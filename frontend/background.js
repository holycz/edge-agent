/**
 * Background Service Worker
 * 负责处理后端通信、右键菜单、流式请求代理等核心功能
 * @module background
 */

// ========== 常量定义（Service Worker 中无法直接 import） ==========
const MESSAGE_TYPES = {
  OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
  GET_BACKEND_URL: 'GET_BACKEND_URL',
  API_STREAM_REQUEST: 'API_STREAM_REQUEST',
  ABORT_STREAM: 'ABORT_STREAM',
  STREAM_CHUNK: 'STREAM_CHUNK',
  STREAM_DONE: 'STREAM_DONE',
  STREAM_ABORTED: 'STREAM_ABORTED',
  STREAM_ERROR: 'STREAM_ERROR',
  UPLOAD_FILE: 'UPLOAD_FILE',
};

const MENU_IDS = {
  AI_ASK: 'ai-ask',
  AI_SUMMARIZE: 'ai-summarize',
  AI_REWRITE: 'ai-rewrite',
  AI_PROOFREAD: 'ai-proofread',
  AI_OPEN_PANEL: 'ai-open-panel',
  AI_SUMMARIZE_PAGE: 'ai-summarize-page',
  AI_SUMMARIZE_LEADER: 'ai-summarize-leader',
  AI_PAGE_REWRITE: 'ai-page-rewrite',
  AI_PAGE_PROOFREAD: 'ai-page-proofread',
  AI_PAGE_ASK: 'ai-page-ask',
};

const API_ENDPOINTS = {
  AGENT: '/sxzypt/py_talkHub/agent/agent',
  UPLOAD: '/sxzypt/aistar_server/agent/upload',
};

// ========== 后端URL配置 ==========

/** 候选后端URL列表，按优先级排序 */
const CANDIDATE_URLS = [
  "http://127.0.0.1:8765",
  "http://10.142.135.57:8000",
  "http://10.131.228.131:40002"
];

/** 当前使用的后端URL，初始为空，会通过测试动态确定 */
let CURRENT_BACKEND_URL = null;

/** 存储活动的流式请求控制器，用于中止 */
const activeStreams = new Map();

// ========== 后端URL管理 ==========

/**
 * 测试单个URL是否可用
 * @param {string} url - 要测试的后端URL
 * @returns {Promise<boolean>} URL是否可用
 */
async function testBackendUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // 只要能成功发起请求（返回任意HTTP状态），就认为URL可用
    if (response.status !== 0) {
      console.log(`[Background] URL可用: ${url} (状态码: ${response.status})`);
      return true;
    }
  } catch (e) {
    console.log(`[Background] URL测试失败: ${url}`, e.message);
  }
  return false;
}

/**
 * 测试所有候选URL，返回第一个可用的URL（并发测试，哪个先通用哪个）
 * @returns {Promise<string>} 可用的后端URL
 */
async function findAvailableBackendUrl() {
  console.log("[Background] 开始测试后端连接...");

  // 先检查存储中是否有之前成功连接的URL
  try {
    const stored = await chrome.storage.local.get("backendUrl");
    if (stored.backendUrl) {
      console.log("[Background] 检查存储的URL:", stored.backendUrl);
      const isAvailable = await testBackendUrl(stored.backendUrl);
      if (isAvailable) {
        console.log("[Background] 使用存储的可用URL:", stored.backendUrl);
        CURRENT_BACKEND_URL = stored.backendUrl;
        return stored.backendUrl;
      }
    }
  } catch (e) {
    console.log("[Background] 读取存储的URL失败:", e.message);
  }

  // 并发测试所有URL，使用 Promise.race 获取第一个成功的
  return new Promise((resolve) => {
    let completedCount = 0;
    let foundUrl = null;

    const checkComplete = () => {
      completedCount++;
      if (completedCount === CANDIDATE_URLS.length && !foundUrl) {
        console.warn("[Background] 所有URL都不可用，使用默认URL:", CANDIDATE_URLS[0]);
        CURRENT_BACKEND_URL = CANDIDATE_URLS[0];
        resolve(CANDIDATE_URLS[0]);
      }
    };

    CANDIDATE_URLS.forEach((url) => {
      (async () => {
        try {
          const isAvailable = await testBackendUrl(url);
          if (isAvailable && !foundUrl) {
            foundUrl = url;
            console.log("[Background] 找到可用URL:", url);
            CURRENT_BACKEND_URL = url;
            await chrome.storage.local.set({ backendUrl: url });
            resolve(url);
          }
        } finally {
          checkComplete();
        }
      })();
    });
  });
}

/**
 * 获取当前后端URL（如果还没测试过，会触发测试）
 * @returns {Promise<string>} 当前后端URL
 */
async function getBackendUrl() {
  if (CURRENT_BACKEND_URL) {
    return CURRENT_BACKEND_URL;
  }
  return await findAvailableBackendUrl();
}

// ========== 右键菜单管理 ==========

/**
 * 创建右键菜单
 */
async function createContextMenus() {
  await chrome.contextMenus.removeAll();
  console.log("[Background] 已清除旧菜单");

  // 选中文本时的菜单
  const selectionMenus = [
    { id: MENU_IDS.AI_ASK, title: "AI 问答" },
    { id: MENU_IDS.AI_SUMMARIZE, title: "总结" },
    { id: MENU_IDS.AI_REWRITE, title: "润色改写" },
    { id: MENU_IDS.AI_PROOFREAD, title: "稽核（检查语句通顺、错别字）" },
  ];

  selectionMenus.forEach(menu => {
    chrome.contextMenus.create({
      id: menu.id,
      title: menu.title,
      contexts: ["selection"]
    });
  });

  // 页面级菜单
  const pageMenus = [
    { id: MENU_IDS.AI_OPEN_PANEL, title: "💬 打开 移点通 侧边栏" },
    { id: MENU_IDS.AI_SUMMARIZE_PAGE, title: "📄 总结该网页" },
    { id: MENU_IDS.AI_SUMMARIZE_LEADER, title: "👔 总结领导批示" },
    { id: MENU_IDS.AI_PAGE_REWRITE, title: "✨ 文本润色" },
    { id: MENU_IDS.AI_PAGE_PROOFREAD, title: "🔍 文本稽核" },
    { id: MENU_IDS.AI_PAGE_ASK, title: "💬 AI问答" },
  ];

  pageMenus.forEach(menu => {
    chrome.contextMenus.create({
      id: menu.id,
      title: menu.title,
      contexts: ["page"]
    });
  });

  console.log("[Background] 右键菜单创建完成");
}

// ========== 扩展生命周期 ==========

/**
 * 扩展启动时执行的操作
 */
async function onExtensionStartup() {
  console.log("[Background] 扩展已启动，测试后端连接...");
  await findAvailableBackendUrl();
  console.log("[Background] 后端URL已确定:", CURRENT_BACKEND_URL);
  createContextMenus();
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] 扩展已安装/更新...");
  onExtensionStartup();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[Background] 扩展已启动...");
  onExtensionStartup();
});

// 立即执行启动逻辑
onExtensionStartup();

// ========== 右键菜单点击处理 ==========

/**
 * 处理右键菜单点击事件
 * @param {Object} info - 菜单点击信息
 * @param {Object} tab - 当前标签页信息
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("[Background] 菜单被点击:", info.menuItemId);

  const text = info.selectionText?.trim();
  let prompt = "";
  let action = "";

  // 处理选中文本的菜单
  if (text && tab?.id) {
    const selectionMenuActions = {
      [MENU_IDS.AI_ASK]: { action: "ask", prompt: text },
      [MENU_IDS.AI_SUMMARIZE]: { action: "summarize", prompt: `请对以下内容进行总结，提炼核心要点：\n\n${text}` },
      [MENU_IDS.AI_REWRITE]: { action: "rewrite", prompt: `请对以下内容进行润色改写，保持原意但让表达更流畅、专业：\n\n${text}` },
      [MENU_IDS.AI_PROOFREAD]: { action: "proofread", prompt: `请对以下内容进行稽核检查，找出语句不通顺的地方和错别字，并给出修改建议：\n\n${text}` },
    };

    const menuConfig = selectionMenuActions[info.menuItemId];
    if (menuConfig) {
      action = menuConfig.action;
      prompt = menuConfig.prompt;
    }
  }

  // 处理页面级菜单
  const pageMenuActions = {
    [MENU_IDS.AI_OPEN_PANEL]: { action: "openPanel", prompt: "" },
    [MENU_IDS.AI_SUMMARIZE_PAGE]: { action: "summarizePage", prompt: "请总结当前网页的主要内容" },
    [MENU_IDS.AI_SUMMARIZE_LEADER]: { action: "summarizeLeaderComments", prompt: "请分析并总结当前网页中的领导批示内容" },
    [MENU_IDS.AI_PAGE_REWRITE]: { action: "pageRewrite", prompt: "请对当前网页的文本内容进行润色改写，保持原意但让表达更流畅、专业" },
    [MENU_IDS.AI_PAGE_PROOFREAD]: { action: "pageProofread", prompt: "请对当前网页的文本进行稽核检查，找出语句不通顺的地方和错别字" },
    [MENU_IDS.AI_PAGE_ASK]: { action: "pageAsk", prompt: "请基于当前网页内容进行AI问答" },
  };

  const pageMenuConfig = pageMenuActions[info.menuItemId];
  if (pageMenuConfig) {
    action = pageMenuConfig.action;
    prompt = pageMenuConfig.prompt;
  }

  if (!action) {
    console.log("[Background] 没有匹配到任何动作，退出");
    return;
  }

  // 存储待处理数据并打开侧边栏
  const storageData = {
    pendingQuestion: prompt,
    pendingAction: action,
    pendingSelectedText: text || ""
  };

  console.log("[Background] 打开侧边栏，action:", action);

  if (tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId })
      .then(() => chrome.storage.session.set(storageData))
      .catch(e => console.error("[Background] 操作失败:", e));
  } else {
    chrome.sidePanel.open({})
      .then(() => chrome.storage.session.set(storageData))
      .catch(e => {
        console.error("[Background] 操作失败，尝试备用方案:", e);
        return chrome.windows.getLastFocused()
          .then(win => chrome.sidePanel.open({ windowId: win.id }))
          .then(() => chrome.storage.session.set(storageData));
      })
      .catch(e => console.error("[Background] 所有方法都失败:", e));
  }
});

// ========== 浏览器动作点击 ==========

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// ========== 流式请求管理 ==========

/**
 * 中止流式请求
 * @param {string} sessionId - 会话ID
 * @returns {boolean} 是否成功中止
 */
function abortStream(sessionId) {
  const controller = activeStreams.get(sessionId);
  if (controller) {
    console.log("[Background] 中止流式请求:", sessionId);
    controller.abort();
    activeStreams.delete(sessionId);
    return true;
  }
  return false;
}

// ========== 消息处理 ==========

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 打开侧边栏
  if (msg.type === MESSAGE_TYPES.OPEN_SIDEPANEL) {
    if (!sender.tab || !sender.tab.windowId) {
      sendResponse({ success: false, error: "Invalid sender tab" });
      return false;
    }
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // 获取后端URL
  if (msg.type === MESSAGE_TYPES.GET_BACKEND_URL) {
    (async () => {
      const url = await getBackendUrl();
      sendResponse({ url });
    })();
    return true;
  }

  // 中止流式请求
  if (msg.type === MESSAGE_TYPES.ABORT_STREAM) {
    const sessionId = msg.sessionId || 'default';
    const success = abortStream(sessionId);
    sendResponse({ success });
    return true;
  }

  // API流式请求
  if (msg.type === MESSAGE_TYPES.API_STREAM_REQUEST) {
    handleStreamRequest(msg, sender, sendResponse);
    return true;
  }

  // 文件上传
  if (msg.type === MESSAGE_TYPES.UPLOAD_FILE) {
    handleFileUpload(msg, sendResponse);
    return true;
  }

  return false;
});

/**
 * 处理流式API请求
 * @param {Object} msg - 消息对象
 * @param {Object} sender - 发送者信息
 * @param {Function} sendResponse - 响应函数
 */
async function handleStreamRequest(msg, sender, sendResponse) {
  const sessionId = msg.sessionId || 'default';
  console.log("[Background] 收到流式请求, sessionId:", sessionId);

  const abortController = new AbortController();
  activeStreams.set(sessionId, abortController);

  try {
    const backendUrl = await getBackendUrl();
    const endpoint = msg.endpoint || API_ENDPOINTS.AGENT;

    const res = await fetch(`${backendUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "AuthToken": msg.agentKey || "badb4c53652e4eb3990cff59db7a0381"
      },
      body: msg.body,
      signal: abortController.signal
    });

    console.log("[Background] 后端响应状态:", res.status);

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("[Background] 后端错误响应:", errorBody);
      
      let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.detail) {
          errorMessage = errorJson.detail;
        }
      } catch (e) {
        // 解析失败，使用默认错误信息
      }

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STREAM_ERROR,
        error: errorMessage,
        sessionId
      }).catch(() => {});
      
      activeStreams.delete(sessionId);
      return;
    }

    // 处理流式响应
    await processStreamResponse(res, sessionId, abortController);

  } catch (e) {
    if (e.name === 'AbortError') {
      console.log("[Background] 流式请求被中止");
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STREAM_ABORTED,
        sessionId
      }).catch(() => {});
    } else {
      console.error("[Background] 后端请求异常:", e);
      const currentUrl = CURRENT_BACKEND_URL || "未知";
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STREAM_ERROR,
        error: `后端连接失败: ${e.message}。请确保后端服务已启动 (${currentUrl})`,
        sessionId
      }).catch(() => {});
    }
    activeStreams.delete(sessionId);
  }
}

/**
 * 处理流式响应数据
 * @param {Response} res - HTTP响应对象
 * @param {string} sessionId - 会话ID
 * @param {AbortController} abortController - 中止控制器
 */
async function processStreamResponse(res, sessionId, abortController) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    // 检查是否已中止
    if (abortController.signal.aborted) {
      console.log("[Background] 流式请求已中止");
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STREAM_ABORTED,
        sessionId
      }).catch(() => {});
      activeStreams.delete(sessionId);
      return;
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const dataStr = trimmed.substring(6);
      if (!dataStr) continue;

      try {
        const parsed = JSON.parse(dataStr);
        const choices = parsed.choices;
        if (!choices || !Array.isArray(choices) || choices.length === 0) continue;

        const delta = choices[0].delta;
        if (!delta) continue;

        // 处理错误
        if (delta.error) {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.STREAM_ERROR,
            error: delta.error,
            sessionId
          }).catch(() => {});
          activeStreams.delete(sessionId);
          return;
        }

        // 处理状态更新 (think_start)
        if (delta.status === "processing") {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.STREAM_CHUNK,
            content: "",
            contentType: "think_start",
            sessionId
          }).catch(() => {});
          continue;
        }

        // 处理推理内容
        if (delta.reasoning_content) {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.STREAM_CHUNK,
            content: delta.reasoning_content,
            contentType: "think",
            sessionId
          }).catch(() => {});
          continue;
        }

        // 处理性能指标 (think_end)
        if (delta.performanceMetrics) {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.STREAM_CHUNK,
            content: "",
            contentType: "think_end",
            performanceMetrics: delta.performanceMetrics,
            sessionId
          }).catch(() => {});
          continue;
        }

        // 处理结束标记
        if (delta.content === "end##end") {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.STREAM_DONE,
            sessionId
          }).catch(() => {});
          activeStreams.delete(sessionId);
          return;
        }

        // 处理普通内容
        if (delta.content !== undefined) {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.STREAM_CHUNK,
            content: delta.content,
            contentType: "content",
            sessionId
          }).catch(() => {});
        }
      } catch (e) {
        // 忽略部分块的解析错误
      }
    }
  }

  // 流正常结束
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.STREAM_DONE,
    sessionId
  }).catch(() => {});
  activeStreams.delete(sessionId);
}

/**
 * 处理文件上传请求
 * @param {Object} msg - 消息对象
 * @param {Function} sendResponse - 响应函数
 */
async function handleFileUpload(msg, sendResponse) {
  try {
    console.log("[Background] 收到文件上传请求, requestId:", msg.requestId);

    // 将 Array 转回 Uint8Array 再转 Blob
    const uint8Array = new Uint8Array(msg.fileData);
    const blob = new Blob([uint8Array], { type: msg.fileType });

    // 构建 param JSON 对象
    const param = JSON.stringify({
      session_id: msg.agentId,
      agent_id: msg.agentId,
      user_id: msg.dialogId || "",
      chat_type: "listing",
      requestId: msg.requestId,
      dialog_id: msg.dialogId || "",
      model_instance_id: "8",
    });

    // 构建 FormData（顺序：files 在前，param 在后）
    const formData = new FormData();
    formData.append("files", blob, msg.fileName);
    formData.append("param", param);

    const backendUrl = await getBackendUrl();

    const response = await fetch(`${backendUrl}${API_ENDPOINTS.UPLOAD}`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Background] 文件上传失败:", response.status, errorText);
      sendResponse({
        success: false,
        error: `上传失败: ${response.status}`
      });
      return;
    }

    const result = await response.json();
    console.log("[Background] 文件上传响应:", result);

    // 后端返回 code 为 1000 表示成功
    if (result.code === 1000 && result.data && result.data.length > 0) {
      sendResponse({
        success: true,
        files: [{
          fileId: result.data[0],
          fileName: msg.fileName
        }]
      });
    } else {
      sendResponse({
        success: false,
        error: result.message || "上传失败",
        code: result.code
      });
    }
  } catch (e) {
    console.error("[Background] 文件上传异常:", e);
    sendResponse({
      success: false,
      error: `上传异常: ${e.message}`
    });
  }
}
