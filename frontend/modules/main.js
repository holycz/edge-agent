/**
 * 主入口模块
 * 负责初始化应用、绑定事件和协调各模块
 * @module main
 */

// 常量和全局变量已在 globals.js 中定义

// ========== 工具函数 ==========

/**
 * 自动获取页面上下文（异步，不阻塞UI）
 * 严格遵守useContext开关状态
 */
async function autoFetchPageContext() {
  try {
    const contextInfoSpan = document.getElementById('ai-context-info');
    if (contextInfoSpan) {
      contextInfoSpan.textContent = '正在获取页面内容...';
    }
    
    const context = await getCurrentPageContext();
    if (context && context.content) {
      const currentSession = SessionManager.getCurrentSession();
      if (currentSession) {
        currentSession.pageContext = context;
        StorageManager.saveSessions();
      }
      const url = context.metadata?.url || '';
      const title = context.metadata?.title || '';
      const shortUrl = url.length > 30 ? url.substring(0, 30) + '...' : url;
      if (contextInfoSpan) {
        contextInfoSpan.textContent = `${title} (${shortUrl})`;
      }
    } else {
      if (contextInfoSpan) {
        contextInfoSpan.textContent = '点击刷新获取页面内容';
      }
    }
  } catch (error) {
    console.error('[Main] 自动获取页面上下文失败:', error);
    const contextInfoSpan = document.getElementById('ai-context-info');
    if (contextInfoSpan) {
      contextInfoSpan.textContent = '点击刷新获取页面内容';
    }
  }
}

// ========== 初始化 ==========

/**
 * 应用初始化
 */
async function init() {
  try {
    // 获取DOM元素
    messagesContainer = document.getElementById('ai-messages');
    inputTextarea = document.getElementById('ai-input');
    sendButton = document.getElementById('ai-send');
    configPanel = document.getElementById('ai-config-panel');

    // 初始化各模块
    await loadConfig();
    initMarkdownParser();
    setupEventListeners();
    setupSessionPanelListeners();
    setupModalEventListeners();
    
    // 初始化搜索模块
    if (typeof SearchManager !== 'undefined' && SearchManager.init) {
      SearchManager.init();
    }

    // 加载数据
    await StorageManager.loadSessions();
    await CustomAgentManager.load();
    renderSessionList();

    // 恢复当前会话
    if (currentSessionId) {
      const session = SessionManager.getCurrentSession();
      if (session && session.messages.length > 0) {
        conversationHistory = [...session.messages];
        renderConversationHistory();
        updateHeaderTitle();
        console.log("[Main] 恢复会话:", session.title, "消息数:", session.messages.length);
      } else {
        SessionManager.createSession('新会话', AGENT_IDS.CHAT);
        renderSessionList();
        updateHeaderTitle();
        // 新建会话时自动获取页面上下文（遵守useContext开关）
        if (config.useContext) {
          autoFetchPageContext();
        }
      }
    } else {
      SessionManager.createSession('新会话');
      renderSessionList();
      updateHeaderTitle();
      // 新建会话时自动获取页面上下文（遵守useContext开关）
      if (config.useContext) {
        autoFetchPageContext();
      }
    }

    console.log("[Main] 初始化完成，检查待处理问题...");
    await checkPendingQuestion();

    // 初始化后端状态检查
    updateBackendStatus();
    setInterval(updateBackendStatus, 60000);

    chrome.storage.onChanged.addListener(handleStorageChange);
  } catch (e) {
    console.error("[Main] 初始化失败:", e);
  }
}

// ========== 事件监听 ==========

/**
 * 处理存储变化
 */
function handleStorageChange(changes, namespace) {
  if (namespace === 'session' && (changes.pendingQuestion?.newValue || changes.pendingAction?.newValue)) {
    console.log("[Main] 检测到待处理数据变化");
    checkPendingQuestion();
  }
}

/**
 * 检查待处理问题
 */
async function checkPendingQuestion() {
  if (isProcessingPending) return;

  try {
    const result = await chrome.storage.session.get(['pendingQuestion', 'pendingAction', 'pendingSelectedText']);

    if (result.pendingQuestion) {
      isProcessingPending = true;
      const question = result.pendingQuestion;
      const action = result.pendingAction;
      const selectedText = result.pendingSelectedText;

      await chrome.storage.session.remove(['pendingQuestion', 'pendingAction', 'pendingSelectedText']);

      if (action === 'ask') {
        if (selectedText) {
          const currentSession = SessionManager.getCurrentSession();
          const currentAgentType = currentSession?.agentType || AGENT_IDS.CHAT;
          
          if (currentAgentType !== AGENT_IDS.CHAT) {
            messagesContainer.innerHTML = '';
            conversationHistory = [];
            SessionManager.createSession('AI问答', AGENT_IDS.CHAT);
            renderSessionList();
            updateHeaderTitle();
            if (config.useContext) autoFetchPageContext();
            showToast('已创建AI问学会话');
          }
          
          const questionText = `请回答关于这段文字的问题：\n\n「${selectedText}」\n\n`;
          inputTextarea.value = questionText;
          inputTextarea.focus();
          inputTextarea.style.height = 'auto';
          inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
          
          await sendMessage();
        }
      } else if (action === 'openPanel') {
        console.log("[Main] 仅打开侧边栏");
      } else if (action === 'pageRewrite' || action === 'pageProofread' || action === 'pageAsk') {
        const feature = FEATURE_PROMPTS[action];
        if (feature) {
          messagesContainer.innerHTML = '';
          conversationHistory = [];
          SessionManager.createSession(feature.label, feature.agentId);
          renderSessionList();
          updateHeaderTitle();
          inputTextarea.focus();
          showToast(`已切换到${feature.label}对话`);
        }
      } else if (action === 'summarizePage' || action === 'summarizeLeaderComments') {
        await handlePageAction(action);
      } else {
        const feature = FEATURE_PROMPTS[action];
        if (feature) {
          const shortText = selectedText.substring(0, 20) + (selectedText.length > 20 ? '...' : '');
          
          const newSession = SessionManager.createSession(feature.label, feature.agentId);
          
          addMessage('user', `${feature.icon} ${feature.label}：「${shortText}」`, Date.now());
          conversationHistory.push({ role: 'user', content: `${feature.icon} ${feature.label}：「${shortText}」`, timestamp: Date.now() });
          SessionManager.saveCurrentSessionMessages();
          renderSessionList();
          updateHeaderTitle();
          
          await callAgent(feature.agentId, selectedText, false, {}, newSession.dialogId, false);
        }
      }
    }
  } catch (e) {
    console.error("[Main] 检查待处理问题失败:", e);
  } finally {
    isProcessingPending = false;
  }
}

/**
 * 处理页面操作
 * @param {string} action - 操作类型
 */
async function handlePageAction(action) {
  const feature = FEATURE_PROMPTS[action];
  if (!feature) return;

  const isQA = action === 'pageAsk';
  const isLeaderSummary = action === 'summarizeLeaderComments';

  updateContextStatus('正在获取网页内容...');
  
  const pageContext = isLeaderSummary ? await getApprovalPageContext() : await getCurrentPageContext(true);

  if (!pageContext || !pageContext.content) {
    const msg = isLeaderSummary
      ? ERROR_MESSAGES.NO_APPROVAL_CONTENT
      : ERROR_MESSAGES.NO_PAGE_CONTENT;
    addMessage('bot', msg);
    return;
  }

  updateContextStatus('正在分析...');

  let agentType;
  if (isQA) agentType = AGENT_IDS.CHAT;
  else if (isLeaderSummary) agentType = AGENT_IDS.SUMMARIZE_LEADER;
  else if (action === 'pageRewrite') agentType = AGENT_IDS.REWRITE;
  else if (action === 'pageProofread') agentType = AGENT_IDS.PROOFREAD;
  else agentType = AGENT_IDS.SUMMARIZE_PAGE;

  messagesContainer.innerHTML = '';
  conversationHistory = [];

  const newSession = SessionManager.createSession(feature.label, agentType);
  newSession.pageContext = pageContext;
  SessionManager.saveCurrentSessionMessages();
  renderSessionList();
  updateHeaderTitle();

  addMessage('user', `${feature.icon} ${feature.label}`, Date.now());
  conversationHistory.push({
    role: 'user',
    content: `${feature.icon} ${feature.label}`,
    timestamp: Date.now()
  });
  SessionManager.saveCurrentSessionMessages();

  await callAgent(feature.agentId, pageContext.content, isQA, {
    ...pageContext?.metadata,
  }, newSession.dialogId, false);

  const statusText = buildContextStatusText(pageContext);
  updateContextStatus(statusText);
}

/**
 * 设置会话面板事件监听器
 */
function setupSessionPanelListeners() {
  const toggleSidebarBtn = document.getElementById('ai-toggle-sidebar');
  if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('ai-sidebar-left');
      if (sidebar) {
        sidebar.classList.toggle('collapsed');
      }
    });
  }
}

/**
 * 设置主事件监听器
 */
function setupEventListeners() {
  sendButton.addEventListener('click', () => {
    if (isStreaming) {
      abortStream();
    } else {
      sendMessage();
    }
  });

  inputTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  inputTextarea.addEventListener('input', () => {
    inputTextarea.style.height = 'auto';
    inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
  });

  document.querySelector('.ai-new-chat').addEventListener('click', clearMessages);
  document.querySelector('.ai-config-btn').addEventListener('click', openConfigPanel);
  document.querySelector('.ai-config-close').addEventListener('click', closeConfigPanel);

  // 清空会话列表按钮
  const clearSessionsBtn = document.getElementById('ai-clear-sessions-btn');
  if (clearSessionsBtn) {
    clearSessionsBtn.addEventListener('click', async () => {
      if (isStreaming && currentStreamSessionId) {
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.ABORT_STREAM,
          sessionId: currentStreamSessionId
        });
        isStreaming = false;
        currentStreamSessionId = null;
      }
      
      if (sessions.length === 0) {
        showToast('会话列表已为空');
        return;
      }
      
      if (confirm(`确定要清空所有 ${sessions.length} 个会话吗？此操作不可恢复。`)) {
        sessions = [];
        currentSessionId = null;
        conversationHistory = [];
        StorageManager.saveSessions();
        
        SessionManager.createSession('新会话', AGENT_IDS.CHAT);
        messagesContainer.innerHTML = '';
        renderSessionList();
        updateHeaderTitle();
        
        showToast('已清空所有会话');
      }
    });
  }

  // 刷新页面上下文按钮和开关
  const refreshContextBtn = document.querySelector('.ai-refresh-context-mini');
  const contextInfoSpan = document.getElementById('ai-context-info');
  const useContextToggle = document.getElementById('ai-use-context');

  // 页面上下文开关
  if (useContextToggle) {
    // 初始化开关状态
    useContextToggle.checked = config.useContext;

    // 监听开关变化
    useContextToggle.addEventListener('change', async () => {
      const isEnabled = useContextToggle.checked;
      config.useContext = isEnabled;
      await saveConfig({ useContext: isEnabled });
      showToast(isEnabled ? '已开启页面上下文' : '已关闭页面上下文');

      // 同步更新刷新按钮和状态文字
      if (refreshContextBtn) {
        refreshContextBtn.disabled = !isEnabled;
        refreshContextBtn.style.opacity = isEnabled ? '1' : '0.5';
      }
      if (contextInfoSpan) {
        contextInfoSpan.style.opacity = isEnabled ? '1' : '0.5';
        contextInfoSpan.textContent = isEnabled ? '点击刷新获取页面内容' : '页面上下文已关闭';
      }
    });
  }

  // 根据开关状态初始化刷新按钮
  if (refreshContextBtn) {
    refreshContextBtn.disabled = !config.useContext;
    refreshContextBtn.style.opacity = config.useContext ? '1' : '0.5';
  }
  if (contextInfoSpan) {
    contextInfoSpan.style.opacity = config.useContext ? '1' : '0.5';
    if (!config.useContext) {
      contextInfoSpan.textContent = '页面上下文已关闭';
    }
  }

  if (refreshContextBtn) {
    const handleRefreshContext = async () => {
      try {
        refreshContextBtn.disabled = true;
        refreshContextBtn.textContent = '⏳';
        contextInfoSpan.textContent = '正在获取页面内容...';
        
        const context = await getCurrentPageContext(true);
        if (context && context.content) {
          const currentSession = SessionManager.getCurrentSession();
          if (currentSession) {
            currentSession.pageContext = context;
            StorageManager.saveSessions();
          }
          const url = context.metadata?.url || '';
          const title = context.metadata?.title || '';
          const shortUrl = url.length > 30 ? url.substring(0, 30) + '...' : url;
          contextInfoSpan.textContent = `${title} (${shortUrl})`;
          showToast('页面内容已获取');
        } else {
          contextInfoSpan.textContent = '无法获取页面内容，请点击重试';
          showToast('获取页面内容失败', 3000, 'error');
        }
      } catch (error) {
        console.error('[Main] 刷新页面上下文失败:', error);
        contextInfoSpan.textContent = '获取失败，请点击重试';
        showToast('刷新页面内容失败', 3000, 'error');
      } finally {
        refreshContextBtn.disabled = false;
        refreshContextBtn.textContent = '🔄';
      }
    };
    
    refreshContextBtn.addEventListener('click', handleRefreshContext);
    if (contextInfoSpan) {
      contextInfoSpan.style.cursor = 'pointer';
      contextInfoSpan.addEventListener('click', handleRefreshContext);
    }
  }

  // 文件上传相关事件
  const uploadFileBtn = document.getElementById('ai-upload-file-btn');
  const fileInput = document.getElementById('ai-file-input');
  const fileRemoveBtn = document.getElementById('ai-file-remove');

  if (uploadFileBtn && fileInput) {
    uploadFileBtn.addEventListener('click', () => {
      if (!isUploading && uploadedFiles.length === 0) {
        fileInput.click();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  if (fileRemoveBtn) {
    fileRemoveBtn.addEventListener('click', removeUploadedFile);
  }

  // 清空对话历史按钮
  const clearHistoryBtn = document.getElementById('ai-clear-history-btn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', handleClearHistory);
  }

  // 新增智能体弹窗事件
  const addAgentModal = document.getElementById('ai-add-agent-modal');
  if (addAgentModal) {
    addAgentModal.querySelector('.ai-add-agent-modal-close').addEventListener('click', closeAddAgentModal);
    addAgentModal.querySelector('.ai-add-agent-modal-cancel').addEventListener('click', closeAddAgentModal);
    addAgentModal.addEventListener('click', (e) => {
      if (e.target === addAgentModal) closeAddAgentModal();
    });

    const verifyBtn = document.getElementById('ai-add-agent-verify-btn');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', handleAddAgentVerify);
    }
  }

  // 配置保存按钮
  document.querySelector('.ai-config-save').addEventListener('click', async () => {
    const maxHistoryRoundsInput = parseInt(document.getElementById('ai-max-history-rounds').value);
    const myName = document.getElementById('ai-my-name').value.trim();
    const otherInfo = document.getElementById('ai-other-info').value.trim();

    const newConfig = {
      maxHistoryRounds: maxHistoryRoundsInput >= 1 && maxHistoryRoundsInput <= 20 ? maxHistoryRoundsInput : DEFAULT_CONFIG.maxHistoryRounds,
      myName: myName,
      otherInfo: otherInfo,
    };

    if (await saveConfig(newConfig)) {
      config = { ...config, ...newConfig };
      showToast('配置已保存');
      closeConfigPanel();
    } else {
      showToast('配置保存失败');
    }
  });

  // 配置重置按钮
  document.querySelector('.ai-config-reset').addEventListener('click', async () => {
    if (confirm('确定要恢复默认配置吗？')) {
      config = { ...DEFAULT_CONFIG };
      await saveConfig(config);
      refreshConfigPanel();
      showToast('已恢复默认配置');
    }
  });

  // 点击主内容区域时收起会话列表
  const mainContent = document.querySelector('.ai-main-content');
  if (mainContent) {
    mainContent.addEventListener('click', (e) => {
      // 排除点击会话列表按钮的情况
      if (e.target.closest('.ai-toggle-sidebar')) return;
      
      const sidebar = document.getElementById('ai-sidebar-left');
      if (sidebar && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
      }
    });
  }
}

/**
 * 设置弹窗事件监听器
 */
function setupModalEventListeners() {
  // 智能体选择弹窗
  const agentModal = document.getElementById('ai-agent-modal');
  if (agentModal) {
    const closeBtn = agentModal.querySelector('.ai-agent-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeAgentSelectionModal);
    }
    agentModal.addEventListener('click', (e) => {
      if (e.target === agentModal) closeAgentSelectionModal();
    });
  }

  // 数据管理按钮
  const exportBtn = document.getElementById('ai-export-sessions');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSessions);
  }

  const importBtn = document.getElementById('ai-import-sessions');
  if (importBtn) {
    importBtn.addEventListener('click', importSessions);
  }

  const clearDataBtn = document.getElementById('ai-clear-sessions');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', clearAllData);
  }
}

/**
 * 发送消息
 */
async function sendMessage() {
  const text = inputTextarea.value.trim();
  if (!text) {
    if (uploadedFiles.length > 0) {
      showToast('请输入问题后再发送');
    }
    return;
  }

  inputTextarea.value = '';
  inputTextarea.style.height = 'auto';

  let displayText = text;
  if (uploadedFiles.length > 0) {
    const fileNames = uploadedFiles.map(f => f.fileName).join('、');
    displayText = text + '\n\n📎 ' + fileNames;
  }

  addMessage('user', displayText, Date.now());

  const currentSession = SessionManager.getCurrentSession();
  const dialogId = SessionManager.getCurrentDialogId();
  
  const isFirstMessage = currentSession && !currentSession.messages.some(m => m.role === 'assistant');
  
  const agentId = currentSession?.agentType || AGENT_IDS.CHAT;
  const isQA = agentId === AGENT_IDS.CHAT;
  
  let pageContext = null;
  if (isFirstMessage && config.useContext) {
    pageContext = await getCurrentPageContext();
  }

  conversationHistory.push({ role: 'user', content: displayText, timestamp: Date.now() });
  SessionManager.saveCurrentSessionMessages();

  if (currentSession && isFirstMessage) {
    SessionManager.autoGenerateTitle(currentSession.id, text);
    renderSessionList();
  }

  await callAgent(agentId, pageContext?.content || "", isQA, {
    ...pageContext?.metadata,
    userQuestion: text
  }, dialogId, false, !isFirstMessage);

  clearFileUploadState();
}

/**
 * 导出会话数据
 */
async function exportSessions() {
  try {
    const data = await StorageManager.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('会话数据已导出');
  } catch (error) {
    showToast('导出失败: ' + error.message, 3000, 'error');
  }
}

/**
 * 导入会话数据
 */
function importSessions() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const success = await StorageManager.importData(text);
      if (success) {
        showToast('会话数据已导入');
        renderSessionList();
      } else {
        showToast('导入失败: 文件格式错误', 3000, 'error');
      }
    } catch (error) {
      showToast('导入失败: ' + error.message, 3000, 'error');
    }
  };
  input.click();
}

/**
 * 清空所有数据
 */
async function clearAllData() {
  if (confirm('确定要清空所有数据吗？此操作不可恢复。')) {
    await StorageManager.clearAllData();
    sessions = [];
    currentSessionId = null;
    conversationHistory = [];
    SessionManager.createSession('新会话', AGENT_IDS.CHAT);
    messagesContainer.innerHTML = '';
    renderSessionList();
    showToast('已清空所有数据');
  }
}

// ========== 后端状态检查 ==========

let lastBackendAvailable = null;

/**
 * 更新后端连接状态显示
 */
async function updateBackendStatus() {
  const dot = document.getElementById('ai-status-dot');
  const text = document.getElementById('ai-status-text');
  if (!dot || !text) return;

  dot.className = 'ai-header-status-dot checking';
  text.textContent = '检查中...';

  const status = await checkBackendStatus();
  lastBackendAvailable = status.available;

  if (status.available) {
    dot.className = 'ai-header-status-dot';
    text.textContent = '已连接';
  } else {
    dot.className = 'ai-header-status-dot offline';
    text.textContent = '未连接';
  }
}

// ========== 清空对话历史 ==========

/**
 * 清空当前对话历史
 * 弹窗确认后清空对话框，并发送POST请求到后端截断会话
 */
async function handleClearHistory() {
  if (conversationHistory.length === 0) {
    showToast('当前对话历史为空');
    return;
  }

  if (!confirm('确定要清空对话历史吗？')) {
    return;
  }

  // 获取当前会话信息
  const currentSession = SessionManager.getCurrentSession();
  const agentId = currentSession?.agentType || AGENT_IDS.CHAT;
  const dialogId = currentSession?.dialogId || SessionManager.getCurrentDialogId();

  // 清空对话框
  messagesContainer.innerHTML = '';
  conversationHistory = [];
  clearFileUploadState();

  showToast('对话历史已清空');

  // 发送POST请求到后端截断会话
  try {
    const backendUrl = await getBackendUrl();
    const response = await fetch(`${backendUrl}/sxzypt/aistar_server/agent/truncateSingleSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        chat_type: 'listing',
        session_id: agentId,
        user_id: dialogId,
      }),
    });

    if (!response.ok) {
      console.error('[Main] 截断会话失败:', response.status);
    }
  } catch (e) {
    console.error('[Main] 截断会话请求异常:', e);
  }
}

// ========== Chrome消息监听 ==========

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MESSAGE_TYPES.PAGE_CONTENT_CHANGED) {
    clearContextCache();
    refreshContextStatus();
    return;
  }

  handleStreamMessage(msg);
});

// ========== 启动应用 ==========

init();
