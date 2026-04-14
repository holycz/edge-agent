// 创建右键菜单
async function createContextMenus() {
  // 先移除所有现有菜单
  await chrome.contextMenus.removeAll();
  console.log("[Background] 已清除旧菜单");

  // 划词时的菜单项
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

  // 无划词时的菜单项（在页面任意位置右键）
  chrome.contextMenus.create({
    id: "ai-open-panel",
    title: "💬 打开 AI 侧边栏",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "ai-summarize-page",
    title: "📄 总结该网页",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "ai-summarize-leader",
    title: "👔 总结领导批示",
    contexts: ["page"]
  });

  console.log("[Background] 右键菜单创建完成");
}

// 在扩展安装/更新时创建菜单
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] 扩展已安装/更新，创建菜单...");
  createContextMenus();
});

// 在扩展启动时也创建菜单（防止开发时刷新后菜单丢失）
chrome.runtime.onStartup.addListener(() => {
  console.log("[Background] 扩展已启动，创建菜单...");
  createContextMenus();
});

// 立即执行一次（开发调试时）
createContextMenus();

// 右键点击 → 打开侧边栏并发送问题
// 注意：sidePanel.open() 必须在用户手势的同步上下文中调用，不能用 await
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("[Background] ====== 菜单被点击 ======");
  console.log("[Background] menuItemId:", info.menuItemId);
  console.log("[Background] Tab对象:", tab);
  console.log("[Background] Tab.windowId:", tab?.windowId);
  console.log("[Background] 选中文本:", info.selectionText);

  const text = info.selectionText?.trim();
  let prompt = "";
  let action = "";

  // 处理划词菜单项
  if (text && tab?.id) {
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
  }

  // 处理无划词时的页面菜单项（这些不需要选中文字）
  if (info.menuItemId === "ai-open-panel") {
    console.log("[Background] 匹配到打开侧边栏菜单");
    action = "openPanel";
    prompt = "";
  }
  if (info.menuItemId === "ai-summarize-page") {
    console.log("[Background] 匹配到总结该网页菜单");
    action = "summarizePage";
    prompt = "请总结当前网页的主要内容";
  }
  if (info.menuItemId === "ai-summarize-leader") {
    console.log("[Background] 匹配到总结领导批示菜单");
    action = "summarizeLeaderComments";
    prompt = "请分析并总结当前网页中的领导批示内容";
  }

  console.log("[Background] 处理后的action:", action, "prompt:", prompt);

  // 如果没有匹配的动作，直接返回
  if (!action) {
    console.log("[Background] 没有匹配到任何动作，退出");
    return;
  }

    // 准备要存储的数据
  const storageData = {
    pendingQuestion: prompt,
    pendingAction: action,
    pendingSelectedText: text || ""
  };

  // 打开侧边栏
  // 注意：sidePanel.open() 必须在用户手势的同步上下文中调用，不能用 await
  console.log("[Background] 正在打开侧边栏...");

  // 方法1: 如果有 tab.windowId，直接使用（划词菜单时有效）
  if (tab?.windowId) {
    console.log("[Background] 使用 tab.windowId:", tab.windowId);
    chrome.sidePanel.open({ windowId: tab.windowId })
      .then(() => {
        console.log("[Background] 侧边栏打开成功");
        return chrome.storage.session.set(storageData);
      })
      .then(() => console.log("[Background] 数据已存储"))
      .catch(e => console.error("[Background] 操作失败:", e));
    return;
  }

  // 方法2: 对于page菜单，tab.windowId不存在，使用空对象打开当前窗口
  console.log("[Background] 使用当前活动窗口打开侧边栏");
  chrome.sidePanel.open({})
    .then(() => {
      console.log("[Background] 侧边栏打开成功");
      return chrome.storage.session.set(storageData);
    })
    .then(() => console.log("[Background] 数据已存储"))
    .catch(e => {
      console.error("[Background] 操作失败:", e);
      // 备用方案：获取最后聚焦窗口
      console.log("[Background] 尝试备用方案...");
      return chrome.windows.getLastFocused()
        .then(win => {
          console.log("[Background] 获取到最后聚焦窗口:", win.id);
          return chrome.sidePanel.open({ windowId: win.id });
        })
        .then(() => chrome.storage.session.set(storageData))
        .then(() => console.log("[Background] 数据已存储"));
    })
    .catch(e => console.error("[Background] 所有方法都失败:", e));
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