// 双击功能状态
let doubleClickEnabled = false;

// 获取选中的文本
function getSelectedText() {
  return window.getSelection().toString().trim();
}

// 获取网页正文内容
function getPageContent() {
  console.log("[Content] 开始获取页面内容");

  // 尝试获取文章主体内容
  const article = document.querySelector('article');
  if (article) {
    const content = article.innerText.trim();
    console.log("[Content] 从 <article> 获取内容，长度:", content.length);
    return content;
  }

  // 尝试获取 main 标签内容
  const main = document.querySelector('main');
  if (main) {
    const content = main.innerText.trim();
    console.log("[Content] 从 <main> 获取内容，长度:", content.length);
    return content;
  }

  // 获取 body 内容，但排除导航、侧边栏等
  const body = document.body;
  const excludeTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript'];

  // 克隆 body 以便操作
  const clone = body.cloneNode(true);

  // 移除不需要的元素
  excludeTags.forEach(tag => {
    const elements = clone.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });

  // 移除常见的无关元素
  const commonSelectors = [
    '.sidebar', '.nav', '.navigation', '.menu', '.header', '.footer',
    '.advertisement', '.ads', '.comments', '.social-share',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
  ];
  commonSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  const content = clone.innerText.trim();
  console.log("[Content] 从 body 获取内容，长度:", content.length);
  return content;
}

// 获取网页元信息
function getPageMetadata() {
  const title = document.title || '';
  const url = window.location.href;
  const description = document.querySelector('meta[name="description"]')?.content || '';
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';

  return { title, url, description, keywords };
}

// 双击事件处理函数
async function handleDoubleClick(e) {
  if (!doubleClickEnabled) return;

  const selectedText = getSelectedText();
  if (!selectedText) {
    try {
      // 发送消息给 background 打开侧边栏
      await chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
    } catch (e) {
      console.error("[Content] 打开侧边栏失败:", e);
    }
  }
}

// 更新双击事件监听状态
function updateDoubleClickState() {
  if (doubleClickEnabled) {
    document.addEventListener('dblclick', handleDoubleClick);
    console.log("[Content] 双击唤醒功能已启用");
  } else {
    document.removeEventListener('dblclick', handleDoubleClick);
    console.log("[Content] 双击唤醒功能已禁用");
  }
}

// 初始化：读取双击设置
async function initDoubleClickSetting() {
  try {
    const result = await chrome.storage.sync.get('enableDoubleClick');
    doubleClickEnabled = result.enableDoubleClick === true;
    updateDoubleClickState();
  } catch (e) {
    console.error("[Content] 读取双击设置失败:", e);
  }
}

// 监听设置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.enableDoubleClick) {
    doubleClickEnabled = changes.enableDoubleClick.newValue === true;
    updateDoubleClickState();
  }
});

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SELECTED_TEXT") {
    const text = getSelectedText();
    sendResponse({ text });
    return true; // 保持消息通道开放以进行异步响应
  }

  if (msg.type === "GET_PAGE_CONTEXT") {
    try {
      console.log("[Content] 收到 GET_PAGE_CONTEXT 请求");
      const content = getPageContent();
      const metadata = getPageMetadata();

      if (!content || content.length === 0) {
        console.warn("[Content] 获取到的内容为空");
        sendResponse({ content: "", metadata: metadata, error: "内容为空" });
      } else {
        console.log("[Content] 返回内容，长度:", content.length);
        sendResponse({
          content: content,
          metadata: metadata
        });
      }
    } catch (e) {
      console.error("[Content] 获取页面上下文失败:", e);
      sendResponse({ content: "", metadata: {}, error: e.message });
    }
    return true;
  }
});

// 启动初始化
initDoubleClickSetting();
