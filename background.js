// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-ask",
    title: "AI 问答",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ai-rewrite",
    title: "文字改写",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ai-summarize",
    title: "内容总结",
    contexts: ["selection"]
  });
});

// 右键点击 → 打开侧边栏并发送问题
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = info.selectionText?.trim();
  if (!text || !tab.id) return;

  let prompt = "";
  if (info.menuItemId === "ai-ask") prompt = `回答问题：${text}`;
  if (info.menuItemId === "ai-rewrite") prompt = `改写文字，保持原意：${text}`;
  if (info.menuItemId === "ai-summarize") prompt = `总结内容：${text}`;

  try {
    // 存储问题，等侧边栏打开后处理
    await chrome.storage.session.set({ pendingQuestion: prompt });
    console.log("[Background] 已存储问题:", prompt);
    
    // 打开侧边栏
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log("[Background] 侧边栏已打开");
  } catch (e) {
    console.error("[Background] 打开侧边栏失败:", e);
  }
});

// 扩展图标点击打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OPEN_SIDEPANEL") {
    // 检查 sender.tab 是否存在
    if (!sender.tab || !sender.tab.windowId) {
      sendResponse({ success: false, error: "Invalid sender tab" });
      return false;
    }
    // 打开侧边栏
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  // 流式跨域代理
  if (msg.type !== "API_STREAM_REQUEST") return false;

  (async () => {
    try {
      let res = await fetch(msg.url, msg.options);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // 发送到侧边栏
              chrome.runtime.sendMessage({
                type: "STREAM_DONE"
              }).catch(() => {});
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                chrome.runtime.sendMessage({
                  type: "STREAM_CHUNK",
                  content: content
                }).catch(() => {});
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
      
      chrome.runtime.sendMessage({
        type: "STREAM_DONE"
      }).catch(() => {});
    } catch (e) {
      chrome.runtime.sendMessage({
        type: "STREAM_ERROR",
        error: e.message
      }).catch(() => {});
    }
  })();

  return true;
});