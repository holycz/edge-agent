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

  console.log("[Background] 收到 API 请求:", msg.url);
  console.log("[Background] 请求 headers:", msg.options?.headers);
  console.log("[Background] 请求 body:", msg.options?.body);

  (async () => {
    try {
      // 创建一个新的 headers 对象，移除 Origin 和 Referer
      const headers = new Headers(msg.options.headers);
      
      // 使用 fetch 发送请求
      let res = await fetch(msg.url, {
        method: msg.options.method,
        headers: headers,
        body: msg.options.body
      });
      console.log("[Background] API 响应状态:", res.status, res.statusText);
      
      // 检查响应状态
      if (!res.ok) {
        // 读取错误响应体
        const errorBody = await res.text();
        console.error("[Background] API 错误响应:", errorBody);
        let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch (e) {
          // 不是 JSON 格式，使用原始错误信息
        }
        chrome.runtime.sendMessage({
          type: "STREAM_ERROR",
          error: errorMessage
        }).catch(() => {});
        return;
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      // 用于累积 think 内容的标志
      let inThinkBlock = false;
      let thinkContent = '';
      let regularContent = '';
      
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
              let content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                // 解析 think 标签
                while (content.length > 0) {
                  if (!inThinkBlock) {
                    const thinkStart = content.indexOf('<think>');
                    if (thinkStart === -1) {
                      // 没有 think 标签，都是普通内容
                      if (content) {
                        chrome.runtime.sendMessage({
                          type: "STREAM_CHUNK",
                          content: content,
                          contentType: "content"
                        }).catch(() => {});
                      }
                      break;
                    } else {
                      // 找到 think 开始标签
                      if (thinkStart > 0) {
                        // think 标签前有普通内容
                        const beforeThink = content.substring(0, thinkStart);
                        chrome.runtime.sendMessage({
                          type: "STREAM_CHUNK",
                          content: beforeThink,
                          contentType: "content"
                        }).catch(() => {});
                      }
                      inThinkBlock = true;
                      content = content.substring(thinkStart + 7);
                      // 通知开始 think
                      chrome.runtime.sendMessage({
                        type: "STREAM_CHUNK",
                        content: "",
                        contentType: "think_start"
                      }).catch(() => {});
                    }
                  } else {
                    // 在 think 块内
                    const thinkEnd = content.indexOf('</think>');
                    if (thinkEnd === -1) {
                      // think 块未结束
                      if (content) {
                        chrome.runtime.sendMessage({
                          type: "STREAM_CHUNK",
                          content: content,
                          contentType: "think"
                        }).catch(() => {});
                      }
                      break;
                    } else {
                      // 找到 think 结束标签
                      const thinkText = content.substring(0, thinkEnd);
                      if (thinkText) {
                        chrome.runtime.sendMessage({
                          type: "STREAM_CHUNK",
                          content: thinkText,
                          contentType: "think"
                        }).catch(() => {});
                      }
                      // 通知 think 结束
                      chrome.runtime.sendMessage({
                        type: "STREAM_CHUNK",
                        content: "",
                        contentType: "think_end"
                      }).catch(() => {});
                      inThinkBlock = false;
                      content = content.substring(thinkEnd + 8);
                    }
                  }
                }
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
      console.error("[Background] 请求异常:", e);
      chrome.runtime.sendMessage({
        type: "STREAM_ERROR",
        error: e.message
      }).catch(() => {});
    }
  })();

  return true;
});