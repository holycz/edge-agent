// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-ask",
    title: "AI 问答",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ai-summarize",
    title: "总结",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ai-rewrite",
    title: "润色改写",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ai-proofread",
    title: "稽核（检查语句通顺、错别字）",
    contexts: ["selection"]
  });
});

// 右键点击 → 打开侧边栏并发送问题
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = info.selectionText?.trim();
  if (!text || !tab.id) return;

  let prompt = "";
  let action = "";
  
  if (info.menuItemId === "ai-ask") {
    action = "ask";
    prompt = text;
  }
  if (info.menuItemId === "ai-summarize") {
    action = "summarize";
    prompt = `请对以下内容进行总结，提炼核心要点：\n\n${text}`;
  }
  if (info.menuItemId === "ai-rewrite") {
    action = "rewrite";
    prompt = `请对以下内容进行润色改写，保持原意但让表达更流畅、专业：\n\n${text}`;
  }
  if (info.menuItemId === "ai-proofread") {
    action = "proofread";
    prompt = `请对以下内容进行稽核检查，找出语句不通顺的地方和错别字，并给出修改建议：\n\n${text}`;
  }

  try {
    // 存储问题，等侧边栏打开后处理
    // 存储action类型，用于区分是划词引用还是直接提问
    await chrome.storage.session.set({ 
      pendingQuestion: prompt,
      pendingAction: action,
      pendingSelectedText: text
    });
    console.log("[Background] 已存储问题:", prompt, "动作:", action);
    
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