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
    setupPromptPanelListeners();
    setupModalEventListeners();
    
    // 初始化搜索模块
    if (typeof SearchManager !== 'undefined' && SearchManager.init) {
      SearchManager.init();
    }

    // 加载数据
    await StorageManager.loadSessions();
    await StorageManager.loadPromptTemplates();
    await CustomAgentManager.load();
    renderSessionList();
    renderQuickPrompts();

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

    // 初始化快捷键帮助
    initShortcutHelp();

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
          inputTextarea.value = `请回答关于这段文字的问题：\n\n「${selectedText}」\n\n`;
          inputTextarea.focus();
          inputTextarea.style.height = 'auto';
          inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
          inputTextarea.setSelectionRange(inputTextarea.value.length, inputTextarea.value.length);
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
 * 设置提示词面板事件监听器
 */
function setupPromptPanelListeners() {
  const promptPanel = document.getElementById('ai-prompt-panel');
  if (!promptPanel) return;

  const closeBtn = promptPanel.querySelector('.ai-prompt-panel-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      promptPanel.style.display = 'none';
    });
  }

  const addPromptBtn = document.getElementById('ai-add-prompt-btn');
  if (addPromptBtn) {
    addPromptBtn.addEventListener('click', () => {
      openPromptModal();
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

  // 新增智能体按钮
  const addAgentBtn = document.getElementById('ai-add-agent-btn');
  if (addAgentBtn) {
    addAgentBtn.addEventListener('click', openAddAgentModal);
  }

  // 管理智能体按钮
  const manageAgentBtn = document.getElementById('ai-manage-agent-btn');
  if (manageAgentBtn) {
    manageAgentBtn.addEventListener('click', openManageAgentModal);
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

  // 管理智能体弹窗事件
  const manageAgentModal = document.getElementById('ai-manage-agent-modal');
  if (manageAgentModal) {
    manageAgentModal.querySelector('.ai-manage-agent-modal-close').addEventListener('click', closeManageAgentModal);
    manageAgentModal.querySelector('.ai-manage-agent-modal-close-btn').addEventListener('click', closeManageAgentModal);
    manageAgentModal.addEventListener('click', (e) => {
      if (e.target === manageAgentModal) closeManageAgentModal();
    });
  }

  // 配置保存按钮
  document.querySelector('.ai-config-save').addEventListener('click', async () => {
    const maxHistoryRoundsInput = parseInt(document.getElementById('ai-max-history-rounds').value);
    const myName = document.getElementById('ai-my-name').value.trim();
    const otherInfo = document.getElementById('ai-other-info').value.trim();
    const enableDoubleClick = document.getElementById('ai-enable-double-click').checked;

    const newConfig = {
      maxHistoryRounds: maxHistoryRoundsInput >= 1 && maxHistoryRoundsInput <= 20 ? maxHistoryRoundsInput : DEFAULT_CONFIG.maxHistoryRounds,
      myName: myName,
      otherInfo: otherInfo,
      enableDoubleClick: enableDoubleClick,
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

  // 提示词编辑弹窗
  const promptModal = document.getElementById('ai-prompt-modal');
  if (promptModal) {
    const closeBtn = promptModal.querySelector('.ai-prompt-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closePromptModal);
    }
    const cancelBtn = promptModal.querySelector('.ai-prompt-modal-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', closePromptModal);
    }
    const saveBtn = promptModal.querySelector('.ai-prompt-modal-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', savePrompt);
    }
    promptModal.addEventListener('click', (e) => {
      if (e.target === promptModal) closePromptModal();
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
 * 打开提示词编辑弹窗
 * @param {string|null} promptId - 提示词ID（编辑模式）
 */
function openPromptModal(promptId = null) {
  const modal = document.getElementById('ai-prompt-modal');
  if (!modal) return;

  const titleEl = document.getElementById('ai-prompt-modal-title');
  const titleInput = document.getElementById('ai-prompt-form-title');
  const iconInput = document.getElementById('ai-prompt-form-icon');
  const contentInput = document.getElementById('ai-prompt-form-content');

  if (promptId) {
    const prompt = PromptManager.getPromptById(promptId);
    if (prompt && !prompt.isBuiltIn) {
      titleEl.textContent = '编辑提示词';
      titleInput.value = prompt.title;
      iconInput.value = prompt.icon || '';
      contentInput.value = prompt.content;
      modal.dataset.editingId = promptId;
    }
  } else {
    titleEl.textContent = '添加提示词';
    titleInput.value = '';
    iconInput.value = '';
    contentInput.value = '';
    delete modal.dataset.editingId;
  }

  modal.style.display = 'flex';
}

/**
 * 关闭提示词编辑弹窗
 */
function closePromptModal() {
  const modal = document.getElementById('ai-prompt-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 保存提示词
 */
function savePrompt() {
  const modal = document.getElementById('ai-prompt-modal');
  const title = document.getElementById('ai-prompt-form-title').value.trim();
  const icon = document.getElementById('ai-prompt-form-icon').value.trim();
  const content = document.getElementById('ai-prompt-form-content').value.trim();

  if (!title || !content) {
    showToast('请填写标题和内容');
    return;
  }

  const editingId = modal.dataset.editingId;
  if (editingId) {
    PromptManager.updatePrompt(editingId, title, content, icon);
    showToast('提示词已更新');
  } else {
    PromptManager.createCustomPrompt(title, content, icon);
    showToast('提示词已添加');
  }

  closePromptModal();
  renderQuickPrompts();
}

/**
 * 渲染快速提示词列表
 */
function renderQuickPrompts() {
  const builtInList = document.getElementById('ai-built-in-prompts');
  const customList = document.getElementById('ai-custom-prompts');

  if (builtInList) {
    builtInList.innerHTML = BUILT_IN_PROMPTS.map(prompt => `
      <div class="ai-prompt-item" data-id="${prompt.id}">
        <span class="ai-prompt-icon">${prompt.icon}</span>
        <span class="ai-prompt-title">${prompt.title}</span>
      </div>
    `).join('');

    builtInList.querySelectorAll('.ai-prompt-item').forEach(item => {
      item.addEventListener('click', () => {
        applyPrompt(item.dataset.id);
      });
    });
  }

  if (customList) {
    customList.innerHTML = promptTemplates.map(prompt => `
      <div class="ai-prompt-item" data-id="${prompt.id}">
        <span class="ai-prompt-icon">${prompt.icon || '💬'}</span>
        <span class="ai-prompt-title">${prompt.title}</span>
        <div class="ai-prompt-actions">
          <button class="ai-prompt-edit" data-id="${prompt.id}">✏️</button>
          <button class="ai-prompt-delete" data-id="${prompt.id}">🗑️</button>
        </div>
      </div>
    `).join('');

    customList.querySelectorAll('.ai-prompt-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('ai-prompt-edit') && !e.target.classList.contains('ai-prompt-delete')) {
          applyPrompt(item.dataset.id);
        }
      });
    });

    customList.querySelectorAll('.ai-prompt-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPromptModal(btn.dataset.id);
      });
    });

    customList.querySelectorAll('.ai-prompt-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定要删除这个提示词吗？')) {
          PromptManager.deletePrompt(btn.dataset.id);
          renderQuickPrompts();
          showToast('提示词已删除');
        }
      });
    });
  }
}

/**
 * 应用提示词
 * @param {string} promptId - 提示词ID
 */
function applyPrompt(promptId) {
  const content = PromptManager.applyPrompt(promptId);
  if (content) {
    inputTextarea.value = content;
    inputTextarea.focus();
    document.getElementById('ai-prompt-panel').style.display = 'none';
  }
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
    promptTemplates = [];
    SessionManager.createSession('新会话', AGENT_IDS.CHAT);
    messagesContainer.innerHTML = '';
    renderSessionList();
    renderQuickPrompts();
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

// ========== 快捷键帮助 ==========

/**
 * 初始化快捷键帮助面板
 */
function initShortcutHelp() {
  const overlay = document.getElementById('ai-shortcut-help-overlay');
  const closeBtn = document.getElementById('ai-shortcut-help-close');
  if (!overlay) return;

  // 关闭按钮
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
  });

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('visible');
    }
  });

  // 全局快捷键
  document.addEventListener('keydown', (e) => {
    const isInputFocused = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');

    // Ctrl+/ 显示快捷键帮助
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      overlay.classList.toggle('visible');
      return;
    }

    // 以下快捷键仅在非输入框时生效
    if (isInputFocused) return;

    // Ctrl+N 新建对话
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      clearMessages();
      return;
    }

    // Ctrl+B 切换侧边栏
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      const sidebar = document.getElementById('ai-sidebar-left');
      if (sidebar) sidebar.classList.toggle('collapsed');
      return;
    }
  });
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
  renderQuickPrompts();

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
        chat_type: 'save',
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
