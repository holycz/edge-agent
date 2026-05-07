/**
 * 流式请求模块
 * 负责与AI智能体的流式通信
 * @module stream
 */

// 流式请求状态已在 globals.js 中定义

/**
 * 调用智能体接口
 * @param {string} agentId - 智能体ID
 * @param {string} content - 用户输入内容
 * @param {boolean} isQA - 是否为AI问答模式
 * @param {Object} pageMetadata - 页面元信息
 * @param {string|null} dialogId - 对话ID
 * @param {boolean} enableThinking - 是否启用思考模式
 * @param {boolean} isContinuation - 是否为继续对话
 * @returns {Promise<string>} 对话ID
 */
async function callAgent(agentId, content, isQA = false, pageMetadata = {}, dialogId = null, enableThinking = false, isContinuation = false) {
  await loadConfig();

  const backendStatus = await checkBackendStatus();
  if (!backendStatus.available) {
    addMessage('bot', `后端服务不可用：${backendStatus.message}`);
    openConfigPanel();
    return;
  }

  // 如果有正在进行的流，先中止
  if (isStreaming && currentStreamSessionId) {
    const oldSessionId = currentStreamSessionId;
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.ABORT_STREAM,
      sessionId: oldSessionId,
    }).catch(() => {});
    if (accumulatedText.trim() || accumulatedThinkText.trim()) {
      const fullResponse = accumulatedThinkText
        ? `  \n${accumulatedThinkText}\n\n${accumulatedText}\n\n*[已中止]*`
        : `${accumulatedText}\n\n*[已中止]*`;
      conversationHistory.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
      SessionManager.saveCurrentSessionMessages();
    }
  }

  // 重置状态
  currentBotBubble = null;
  currentThinkBubble = null;
  currentThinkContainer = null;
  accumulatedText = '';
  accumulatedThinkText = '';
  isInThinkBlock = false;
  streamStartTime = 0;

  isStreaming = true;
  currentStreamSessionId = 'stream_' + Date.now();
  updateSendButtonState();

  const requestId = generateRequestId();
  const currentDialogId = dialogId || SessionManager.getCurrentDialogId();
  const actualAgentId = agentId;

  console.log('[Stream] 智能体调用参数:', {
    agentId: actualAgentId,
    isContinuation,
    isFirstMessage: !isContinuation,
    requestId,
    dialogId: currentDialogId,
    isQA,
    contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
  });

  // 构建请求体
  let keyword;
  const userQuestion = pageMetadata.userQuestion || '';
  
  if (isContinuation) {
    keyword = `用户问题: ${userQuestion}`;
  } else if (isQA) {
    let contextHeader = "";
    if (pageMetadata.title) {
      contextHeader += `页面标题: ${pageMetadata.title}\n`;
    }
    if (pageMetadata.url) {
      contextHeader += `页面地址: ${pageMetadata.url}\n`;
    }
    keyword = `--- 页面上下文 ---\n${contextHeader}${content}\n--- 页面上下文结束 ---\n\n用户问题: ${userQuestion}`;
  } else {
    keyword = content || userQuestion;
  }

  // 领导批示智能体添加个人信息
  if (agentId === AGENT_TYPES.SUMMARIZE_LEADER && !isContinuation) {
    const personalInfo = [];
    if (config.myName) personalInfo.push(`我的姓名是${config.myName}`);
    if (config.otherInfo) personalInfo.push(config.otherInfo);
    if (personalInfo.length > 0) {
      const infoPrefix = `【我的身份信息】\n${personalInfo.join('。\n')}\n\n【OA审批页面内容】\n`;
      keyword = infoPrefix + keyword;
    }
  }

  const requestBody = {
    request_id: requestId,
    dialog_id: currentDialogId,
    agent_id: actualAgentId,
    session_id: actualAgentId,
    user_id: actualAgentId,
    question: keyword,
    use_history: "true",
    model_id: "",
    ifInternet: false,
    ifCallback: true,
  };

  // 添加文件引用
  if (uploadedFiles.length > 0) {
    const fileReferences = uploadedFiles.map(f => ({
      file_id: f.fileId,
      file_name: f.fileName,
      file_size: f.fileSize || 0
    }));
    requestBody.referenced_objects = JSON.stringify({ file: fileReferences });
    requestBody.referenced_object_type = "file";
    requestBody.agent_state = "save";
  }

  try {
    const requestBodyJson = JSON.stringify(requestBody);
    const customAgentKey = CustomAgentManager.getAgentKey(actualAgentId);
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.API_STREAM_REQUEST,
      endpoint: API_ENDPOINTS.AGENT,
      body: requestBodyJson,
      sessionId: currentStreamSessionId,
      dialogId: currentDialogId,
      agentId: actualAgentId,
      agentKey: customAgentKey || undefined,
    });

    return currentDialogId;
  } catch (e) {
    if (currentBotBubble) {
      currentBotBubble.innerHTML = '出错：' + e.message;
    }
    currentBotBubble = null;
    isStreaming = false;
    updateSendButtonState();
    throw e;
  }
}

/**
 * 中止流式请求
 */
function abortStream() {
  if (isStreaming && currentStreamSessionId) {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.ABORT_STREAM,
      sessionId: currentStreamSessionId,
    }, (response) => {
      console.log("[Stream] 中止请求响应:", response);
    });

    if (currentBotBubble) {
      const contentBubble = currentBotBubble.content.querySelector('.ai-bot:not(.ai-think)');
      if (contentBubble && accumulatedText) {
        contentBubble.innerHTML = parseMarkdown(accumulatedText + '\n\n*[已中止]*');
      } else if (!contentBubble && !accumulatedText) {
        const bubble = createContentBubble(currentBotBubble.content);
        bubble.innerHTML = '*[已中止]*';
      }
    }

    if (accumulatedText.trim() || accumulatedThinkText.trim()) {
      const fullResponse = accumulatedThinkText
        ? `  \n${accumulatedThinkText}\n\n${accumulatedText}\n\n*[已中止]*`
        : `${accumulatedText}\n\n*[已中止]*`;
      conversationHistory.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
      SessionManager.saveCurrentSessionMessages();
      renderSessionList();
    }

    isStreaming = false;
    currentStreamSessionId = null;
    updateSendButtonState();
    resetStreamState();
    streamStartTime = 0;
    showToast('已中止回复');
  }
}

/**
 * 重置流式状态
 */
function resetStreamState() {
  currentBotBubble = null;
  currentThinkBubble = null;
  currentThinkContainer = null;
  accumulatedText = '';
  accumulatedThinkText = '';
  isInThinkBlock = false;
  streamStartTime = 0;
}

/**
 * 更新发送按钮状态（发送/中止切换）
 */
function updateSendButtonState() {
  if (!sendButton) return;

  if (isStreaming) {
    sendButton.textContent = '⏹';
    sendButton.classList.add('ai-stop');
    sendButton.title = '中止回复';
  } else {
    sendButton.textContent = '发送';
    sendButton.classList.remove('ai-stop');
    sendButton.title = '发送消息';
  }
}

/**
 * 处理流式消息
 * @param {Object} msg - 消息对象
 */
function handleStreamMessage(msg) {
  if (msg.type === MESSAGE_TYPES.STREAM_CHUNK) {
    if (msg.sessionId && msg.sessionId !== currentStreamSessionId) {
      return;
    }
    const { content, contentType } = msg;

    if (contentType === STREAM_CONTENT_TYPES.THINK_START) {
      if (!currentBotBubble) {
        const msgElements = addMessage('bot', '');
        currentBotBubble = msgElements;
      }
      streamStartTime = Date.now();
      isInThinkBlock = true;

    } else if (contentType === STREAM_CONTENT_TYPES.THINK) {
      if (!currentBotBubble) {
        const msgElements = addMessage('bot', '');
        currentBotBubble = msgElements;
      }
      if (!currentThinkBubble) {
        const thinkElements = createThinkBubble(currentBotBubble.content);
        currentThinkBubble = thinkElements.thinkBubble;
        currentThinkContainer = thinkElements.thinkContainer;
      }
      accumulatedThinkText += content;
      currentThinkBubble.innerHTML = parseMarkdown(accumulatedThinkText);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

    } else if (contentType === STREAM_CONTENT_TYPES.THINK_END) {
      isInThinkBlock = false;
      if (currentThinkContainer) {
        collapseThinkBubble(currentThinkContainer);
      }
      currentThinkBubble = null;
      currentThinkContainer = null;

    } else if (contentType === STREAM_CONTENT_TYPES.CONTENT) {
      if (!currentBotBubble) {
        const msgElements = addMessage('bot', '');
        currentBotBubble = msgElements;
      }
      if (!streamStartTime) streamStartTime = Date.now();
      if (!currentBotBubble.content.querySelector('.ai-bot:not(.ai-think)')) {
        createContentBubble(currentBotBubble.content);
      }
      accumulatedText += content;
      const contentBubble = currentBotBubble.content.querySelector('.ai-bot:not(.ai-think)');
      if (contentBubble) {
        contentBubble.innerHTML = parseMarkdown(accumulatedText);
      }
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

  } else if (msg.type === MESSAGE_TYPES.STREAM_DONE || msg.type === MESSAGE_TYPES.STREAM_ABORTED) {
    if (msg.sessionId && msg.sessionId !== currentStreamSessionId) {
      return;
    }

    // 计算流式统计
    const elapsedSec = streamStartTime ? ((Date.now() - streamStartTime) / 1000).toFixed(1) : null;
    const charCount = accumulatedText.length;

    const fullResponse = accumulatedThinkText
      ? `  \n${accumulatedThinkText}\n\n${accumulatedText}`
      : accumulatedText;
    if (fullResponse.trim()) {
      const maxResponseLength = FILE_LIMITS.MAX_HISTORY_RESPONSE_LENGTH;
      const savedResponse = fullResponse.length > maxResponseLength
        ? fullResponse.substring(0, maxResponseLength) + '\n...(回复已截断保存)'
        : fullResponse;
      conversationHistory.push({ role: 'assistant', content: savedResponse, timestamp: Date.now() });

      const maxTotalMessages = (config.maxHistoryRounds || 5) * 2 + 2;
      if (conversationHistory.length > maxTotalMessages * 2) {
        const systemMessages = conversationHistory.filter(m => m.role === 'system');
        const otherMessages = conversationHistory.filter(m => m.role !== 'system');
        const recentMessages = otherMessages.slice(-maxTotalMessages);
        conversationHistory = [...systemMessages, ...recentMessages];
      }

      SessionManager.saveCurrentSessionMessages();
      renderSessionList();
    }

    // 渲染统计条和时间戳
    if (currentBotBubble && elapsedSec) {
      const tps = elapsedSec > 0 ? (charCount / parseFloat(elapsedSec)).toFixed(1) : '0';
      const statsDiv = document.createElement('div');
      statsDiv.className = 'ai-msg-stats';
      statsDiv.innerHTML = `<span>📝 ${charCount} 字</span><span>⏱ ${elapsedSec}s</span><span>⚡ ${tps} 字/s</span>`;
      currentBotBubble.content.appendChild(statsDiv);

      const timeDiv = document.createElement('div');
      timeDiv.className = 'ai-msg-time ai-msg-time-bot';
      timeDiv.textContent = formatTimestamp(Date.now());
      currentBotBubble.content.appendChild(timeDiv);

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    isStreaming = false;
    currentStreamSessionId = null;
    updateSendButtonState();
    currentBotBubble = null;
    currentThinkBubble = null;
    currentThinkContainer = null;
    accumulatedText = '';
    accumulatedThinkText = '';
    isInThinkBlock = false;
    streamStartTime = 0;

  } else if (msg.type === MESSAGE_TYPES.STREAM_ERROR) {
    if (msg.sessionId && msg.sessionId !== currentStreamSessionId) {
      return;
    }
    if (currentBotBubble) {
      const errorBubble = currentBotBubble.content.querySelector('.ai-bot:not(.ai-think)');
      if (errorBubble) {
        errorBubble.innerHTML = '出错：' + msg.error;
      } else {
        const bubble = createContentBubble(currentBotBubble.content);
        bubble.innerHTML = '出错：' + msg.error;
      }
    } else {
      addMessage('bot', '出错：' + msg.error);
    }
    isStreaming = false;
    currentStreamSessionId = null;
    updateSendButtonState();
    resetStreamState();
  }
}
