/**
 * 页面上下文模块
 * 负责获取当前页面的内容和元信息
 * @module page-context
 */

// 页面上下文缓存已在 globals.js 中定义

/**
 * 获取当前页面上下文
 * @param {boolean} forceRefresh - 是否强制刷新
 * @returns {Promise<Object|null>} 页面上下文对象
 */
async function getCurrentPageContext(forceRefresh = false) {
  if (!config.useContext) {
    console.log("[PageContext] 上下文功能已禁用");
    return null;
  }

  if (!forceRefresh && pageContextCache) {
    console.log("[PageContext] 使用缓存的网页上下文，长度:", pageContextCache.content?.length || 0, "字符");
    return pageContextCache;
  }

  console.log('[PageContext] 开始获取当前页面上下文...');

  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    console.log("[PageContext] 获取到最后聚焦窗口ID:", lastFocusedWindow.id);

    const activeTab = lastFocusedWindow.tabs?.find(tab => tab.active);

    if (!activeTab || !activeTab.id) {
      console.log("[PageContext] 无法获取当前标签页，窗口标签数:", lastFocusedWindow.tabs?.length);
      return null;
    }

    console.log("[PageContext] 当前标签页 URL:", activeTab.url, "标题:", activeTab.title);

    if (EXCLUDED_PAGE_PATTERNS.some(pattern => activeTab.url?.startsWith(pattern))) {
      console.log("[PageContext] 特殊页面不提供上下文:", activeTab.url);
      return null;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.GET_PAGE_CONTEXT });
      console.log("[PageContext] 收到content script响应:", response ? '有内容' : '空', response?.content?.length || 0, '字符');
    } catch (e) {
      console.log("[PageContext] Content script 可能未加载，尝试注入...", e.message);

      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        });
        console.log("[PageContext] Content script 注入成功");

        await new Promise(resolve => setTimeout(resolve, 300));
        response = await chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.GET_PAGE_CONTEXT });
        console.log("[PageContext] 注入后重新获取，响应:", response ? '有内容' : '空', response?.content?.length || 0, '字符');
      } catch (injectError) {
        console.error("[PageContext] 注入失败:", injectError.message);
        return null;
      }
    }

    if (response && response.content) {
      pageContextCache = {
        content: response.content,
        metadata: response.metadata || {}
      };
      console.log("[PageContext] 页面上下文缓存成功，内容长度:", response.content.length, "字符");
      return pageContextCache;
    } else {
      console.log("[PageContext] 响应为空或没有内容", response);
    }
  } catch (e) {
    console.error("[PageContext] 获取网页上下文失败:", e);
  }

  return null;
}

/**
 * 获取公文批示专用页面内容
 * @returns {Promise<Object|null>} 页面上下文对象
 */
async function getApprovalPageContext() {
  if (!config.useContext) {
    console.log("[PageContext] 上下文功能已禁用");
    return null;
  }

  console.log('[PageContext] 开始获取公文批示专用页面内容...');

  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    console.log("[PageContext] 获取到最后聚焦窗口ID:", lastFocusedWindow.id);

    const activeTab = lastFocusedWindow.tabs?.find(tab => tab.active);

    if (!activeTab || !activeTab.id) {
      console.log("[PageContext] 无法获取当前标签页，窗口标签数:", lastFocusedWindow.tabs?.length);
      return null;
    }

    console.log("[PageContext] 当前标签页 URL:", activeTab.url, "标题:", activeTab.title);

    if (EXCLUDED_PAGE_PATTERNS.some(pattern => activeTab.url?.startsWith(pattern))) {
      console.log("[PageContext] 特殊页面不提供上下文:", activeTab.url);
      return null;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.GET_APPROVAL_PAGE_CONTENT });
      console.log("[PageContext] 收到content script响应:", response ? '有内容' : '空', response?.content?.length || 0, '字符');
    } catch (e) {
      console.log("[PageContext] Content script 可能未加载，尝试注入...", e.message);

      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        });
        console.log("[PageContext] Content script 注入成功");

        await new Promise(resolve => setTimeout(resolve, 300));
        response = await chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.GET_APPROVAL_PAGE_CONTENT });
        console.log("[PageContext] 注入后重新获取，响应:", response ? '有内容' : '空', response?.content?.length || 0, '字符');
      } catch (injectError) {
        console.error("[PageContext] 注入失败:", injectError.message);
        return null;
      }
    }

    if (response && response.content && response.content.trim().length > 0) {
      console.log("[PageContext] 获取到公文批示专用内容，长度:", response.content.length, "字符");
      return {
        content: response.content,
        metadata: response.metadata || {}
      };
    } else {
      console.log("[PageContext] 未获取到公文批示专用内容", response);
      return null;
    }
  } catch (e) {
    console.error("[PageContext] 获取公文批示页面内容失败:", e);
    return null;
  }
}

/**
 * 清空页面上下文缓存
 */
function clearContextCache() {
  pageContextCache = null;
  console.log("[PageContext] 上下文缓存已清空");
}

/**
 * 刷新上下文状态
 */
async function refreshContextStatus() {
  updateContextStatus('正在获取上下文...');
  const context = await getCurrentPageContext(true);
  if (context) {
    const statusText = buildContextStatusText(context);
    updateContextStatus(statusText);
  } else {
    updateContextStatus('无法获取当前页面上下文');
  }
}
