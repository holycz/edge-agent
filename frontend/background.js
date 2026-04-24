const BACKEND_URL = "http://localhost:8765";

// 存储活动的流式请求控制器，用于中止
const activeStreams = new Map();

async function createContextMenus() {
  await chrome.contextMenus.removeAll();
  console.log("[Background] 已清除旧菜单");

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

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] 扩展已安装/更新，创建菜单...");
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[Background] 扩展已启动，创建菜单...");
  createContextMenus();
});

createContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("[Background] ====== 菜单被点击 ======");
  console.log("[Background] menuItemId:", info.menuItemId);
  console.log("[Background] Tab对象:", tab);
  console.log("[Background] Tab.windowId:", tab?.windowId);

  const text = info.selectionText?.trim();
  if (text) {
    console.log("[Background] 选中文本:", text.length, "字符:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
  } else {
    console.log("[Background] 选中文本: 无");
  }
  let prompt = "";
  let action = "";

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

  console.log("[Background] 处理后的 action:", action);
  if (text) {
    console.log("[Background] 最终 prompt 长度:", prompt.length, "字符, 内容:", prompt.substring(0, 150) + (prompt.length > 150 ? "..." : ""));
  }

  if (!action) {
    console.log("[Background] 没有匹配到任何动作，退出");
    return;
  }

  const storageData = {
    pendingQuestion: prompt,
    pendingAction: action,
    pendingSelectedText: text || ""
  };
  console.log("[Background] 准备存储的数据:", {
    pendingAction: storageData.pendingAction,
    pendingQuestionLength: storageData.pendingQuestion?.length || 0,
    pendingSelectedTextLength: storageData.pendingSelectedText?.length || 0
  });

  console.log("[Background] 正在打开侧边栏...");

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

  console.log("[Background] 使用当前活动窗口打开侧边栏");
  chrome.sidePanel.open({})
    .then(() => {
      console.log("[Background] 侧边栏打开成功");
      return chrome.storage.session.set(storageData);
    })
    .then(() => console.log("[Background] 数据已存储"))
    .catch(e => {
      console.error("[Background] 操作失败:", e);
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

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// 中止流式请求的函数
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OPEN_SIDEPANEL") {
    if (!sender.tab || !sender.tab.windowId) {
      sendResponse({ success: false, error: "Invalid sender tab" });
      return false;
    }
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.type === "GET_BACKEND_URL") {
    sendResponse({ url: BACKEND_URL });
    return true;
  }

  if (msg.type === "ABORT_STREAM") {
    const sessionId = msg.sessionId || 'default';
    const success = abortStream(sessionId);
    sendResponse({ success });
    return true;
  }

  if (msg.type === "API_STREAM_REQUEST") {
    const sessionId = msg.sessionId || 'default';
    console.log("[Background] 收到后端 API 代理请求, sessionId:", sessionId);

    try {
      const requestBody = JSON.parse(msg.body);
      console.log("[Background] 请求消息数:", requestBody.messages?.length || 0);
      if (requestBody.messages && requestBody.messages.length > 0) {
        const lastMessage = requestBody.messages[requestBody.messages.length - 1];
        console.log("[Background] 最后一条消息角色:", lastMessage.role, "内容长度:", lastMessage.content?.length || 0);
        if (lastMessage.content) {
          console.log("[Background] 最后一条消息内容预览:", lastMessage.content.substring(0, 200) + (lastMessage.content.length > 200 ? "..." : ""));
        }
      }
    } catch (e) {
      console.log("[Background] 无法解析请求体:", e.message);
    }

    (async () => {
      const abortController = new AbortController();
      activeStreams.set(sessionId, abortController);

      try {
        // 使用前端指定的 endpoint，默认使用 AI问答智能体
      const endpoint = msg.endpoint || "/sxzypt/scene_gateway/agent/open/4";
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: msg.body,
          signal: abortController.signal
        });

        console.log("[Background] 后端响应状态:", res.status, res.statusText);

        if (!res.ok) {
          const errorBody = await res.text();
          console.error("[Background] 后端错误响应:", errorBody);
          let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
          try {
            const errorJson = JSON.parse(errorBody);
            if (errorJson.detail) {
              errorMessage = errorJson.detail;
            }
          } catch (e) {}
          chrome.runtime.sendMessage({
            type: "STREAM_ERROR",
            error: errorMessage,
            sessionId
          }).catch(() => {});
          activeStreams.delete(sessionId);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';

        while (true) {
          // 检查是否已中止
          if (abortController.signal.aborted) {
            console.log("[Background] 流式请求已中止");
            chrome.runtime.sendMessage({
              type: "STREAM_ABORTED",
              sessionId
            }).catch(() => {});
            activeStreams.delete(sessionId);
            return;
          }

          const { done, value } = await reader.read();
          if (done) break;

          // 检查是否已中止
          if (abortController.signal.aborted) {
            console.log("[Background] 流式请求已中止");
            chrome.runtime.sendMessage({
              type: "STREAM_ABORTED",
              sessionId
            }).catch(() => {});
            activeStreams.delete(sessionId);
            return;
          }

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
            type: "STREAM_ERROR",
            error: delta.error,
            sessionId
          }).catch(() => {});
          activeStreams.delete(sessionId);
          return;
        }

        // 处理状态更新 (think_start)
        if (delta.status === "processing") {
          chrome.runtime.sendMessage({
            type: "STREAM_CHUNK",
            content: "",
            contentType: "think_start",
            sessionId
          }).catch(() => {});
          continue;
        }

        // 处理推理内容
        if (delta.reasoning_content) {
          chrome.runtime.sendMessage({
            type: "STREAM_CHUNK",
            content: delta.reasoning_content,
            contentType: "think",
            sessionId
          }).catch(() => {});
          continue;
        }

        // 处理性能指标 (think_end)
        if (delta.performanceMetrics) {
          chrome.runtime.sendMessage({
            type: "STREAM_CHUNK",
            content: "",
            contentType: "think_end",
            sessionId
          }).catch(() => {});
          continue;
        }

        // 处理结束标记
        if (delta.content === "end#end") {
          chrome.runtime.sendMessage({
            type: "STREAM_DONE",
            sessionId
          }).catch(() => {});
          activeStreams.delete(sessionId);
          return;
        }

        // 处理普通内容
        if (delta.content !== undefined) {
          chrome.runtime.sendMessage({
            type: "STREAM_CHUNK",
            content: delta.content,
            contentType: "content",
            sessionId
          }).catch(() => {});
        }
      } catch (e) {
        // ignore parse errors for partial chunks
      }
          }
        }

        chrome.runtime.sendMessage({
          type: "STREAM_DONE",
          sessionId
        }).catch(() => {});
        activeStreams.delete(sessionId);
      } catch (e) {
        if (e.name === 'AbortError') {
          console.log("[Background] 流式请求被中止");
          chrome.runtime.sendMessage({
            type: "STREAM_ABORTED",
            sessionId
          }).catch(() => {});
        } else {
          console.error("[Background] 后端请求异常:", e);
          chrome.runtime.sendMessage({
            type: "STREAM_ERROR",
            error: `后端连接失败: ${e.message}。请确保后端服务已启动 (${BACKEND_URL})`,
            sessionId
          }).catch(() => {});
        }
        activeStreams.delete(sessionId);
      }
    })();

    return true;
  }

  return false;
});
