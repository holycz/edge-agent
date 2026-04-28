// 候选后端URL列表，按优先级排序
const CANDIDATE_URLS = [
  "http://127.0.0.1:8765",
  "http://10.142.135.57:8000",
  "http://10.131.228.131:40002"
];

// 当前使用的后端URL，初始为空，会通过测试动态确定
let CURRENT_BACKEND_URL = null;

// 存储活动的流式请求控制器，用于中止
const activeStreams = new Map();

// 测试单个URL是否可用（使用实际存在的智能体接口进行测试）
async function testBackendUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时

    // 使用 AI 问答智能体接口进行测试，发送一个空的测试请求
    const response = await fetch(`${url}/sxzypt/scene_gateway/agent/open/ddf09cedfcbd4d188adc528461a91392`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: "test-" + Date.now(),
        dialogId: "test-" + Date.now(),
        keyword: "test"
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // 只要能成功发起请求（返回任意HTTP状态），就认为URL可用
    // 即使是401/500错误，也说明服务器在运行
    if (response.status !== 0) {
      console.log(`[Background] URL可用: ${url} (状态码: ${response.status})`);
      return true;
    }
  } catch (e) {
    // 请求失败，URL不可用（连接超时、拒绝连接等）
    console.log(`[Background] URL测试失败: ${url}`, e.message);
  }
  return false;
}

// 测试所有候选URL，返回第一个可用的URL（并发测试，哪个先通用哪个）
async function findAvailableBackendUrl() {
  console.log("[Background] 开始测试后端连接...");
  console.log("[Background] 候选URL:", CANDIDATE_URLS);

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
      // 如果所有测试都完成了还没找到可用的，使用第一个默认值
      if (completedCount === CANDIDATE_URLS.length && !foundUrl) {
        console.warn("[Background] 所有URL都不可用，使用默认URL:", CANDIDATE_URLS[0]);
        CURRENT_BACKEND_URL = CANDIDATE_URLS[0];
        resolve(CANDIDATE_URLS[0]);
      }
    };

    // 为每个URL创建一个可取消的测试 Promise
    CANDIDATE_URLS.forEach((url) => {
      (async () => {
        try {
          const isAvailable = await testBackendUrl(url);
          if (isAvailable && !foundUrl) {
            // 第一个成功的URL
            foundUrl = url;
            console.log("[Background] 找到可用URL:", url);
            CURRENT_BACKEND_URL = url;
            // 存储到本地
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

// 获取当前后端URL（如果还没测试过，会触发测试）
async function getBackendUrl() {
  if (CURRENT_BACKEND_URL) {
    return CURRENT_BACKEND_URL;
  }
  return await findAvailableBackendUrl();
}

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
    title: "💬 打开 移点通 侧边栏",
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
  chrome.contextMenus.create({
    id: "ai-page-rewrite",
    title: "✨ 文本润色",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "ai-page-proofread",
    title: "🔍 文本稽核",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "ai-page-ask",
    title: "💬 AI问答",
    contexts: ["page"]
  });

  console.log("[Background] 右键菜单创建完成");
}

// 扩展启动时执行的操作
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
  if (info.menuItemId === "ai-page-rewrite") {
    console.log("[Background] 匹配到页面润色菜单");
    action = "pageRewrite";
    prompt = "请对当前网页的文本内容进行润色改写，保持原意但让表达更流畅、专业";
  }
  if (info.menuItemId === "ai-page-proofread") {
    console.log("[Background] 匹配到页面稽核菜单");
    action = "pageProofread";
    prompt = "请对当前网页的文本进行稽核检查，找出语句不通顺的地方和错别字";
  }
  if (info.menuItemId === "ai-page-ask") {
    console.log("[Background] 匹配到页面AI问答菜单");
    action = "pageAsk";
    prompt = "请基于当前网页内容进行AI问答";
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
    (async () => {
      const url = await getBackendUrl();
      sendResponse({ url });
    })();
    return true; // 保持通道开放以便异步响应
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
        // 获取当前可用的后端URL
        const backendUrl = await getBackendUrl();
        console.log("[Background] 使用后端URL:", backendUrl);

        // 使用前端指定的 endpoint，默认使用 AI问答智能体
        const endpoint = msg.endpoint || "/sxzypt/scene_gateway/agent/open/4";
        const res = await fetch(`${backendUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "AuthToken": "badb4c53652e4eb3990cff59db7a0381"
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
        if (delta.content === "end##end") {
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
          const currentUrl = CURRENT_BACKEND_URL || "未知";
          chrome.runtime.sendMessage({
            type: "STREAM_ERROR",
            error: `后端连接失败: ${e.message}。请确保后端服务已启动 (${currentUrl})`,
            sessionId
          }).catch(() => {});
        }
        activeStreams.delete(sessionId);
      }
    })();

    return true;
  }

  // 处理文件上传请求
  if (msg.type === "UPLOAD_FILE") {
    (async () => {
      try {
        console.log("[Background] 收到文件上传请求, requestId:", msg.requestId);
        
        // 将 Array 转回 Uint8Array 再转 Blob
        const uint8Array = new Uint8Array(msg.fileData);
        const blob = new Blob([uint8Array], { type: msg.fileType });
        
        // 构建 FormData
        const formData = new FormData();
        formData.append("files", blob, msg.fileName);
        formData.append("request_id", msg.requestId);
        formData.append("agent_id", msg.agentId);
        formData.append("chat_type", "save");

        // 获取当前可用的后端URL
        const backendUrl = await getBackendUrl();

        // 发送请求到后端，使用 agentId 构建正确路径
        const response = await fetch(`${backendUrl}/aisatr_server/sdk/agent/open/${msg.agentId}/uploadFiles`, {
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
        
        // 后端返回 code 为 0 表示成功，兼容 1000 也作为成功标识
        if ((result.code === 0 || result.code === 1000) && result.result) {
          const uploadedFile = result.result;
          sendResponse({
            success: true,
            files: [{
              fileId: uploadedFile.fileId,
              imgUrl: null,  // 本地存储没有imgUrl，fileId作为唯一标识
              fileName: uploadedFile.fileName,
              fileSize: uploadedFile.fileSize
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
    })();
    
    return true; // 保持通道开放以便异步响应
  }

  return false;
});
