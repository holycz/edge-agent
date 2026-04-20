const DEFAULT_CONFIG = {
  useContext: true,
  contextLength: 8000,
  enableDoubleClick: false,
  maxTotalChars: 25000,
  maxHistoryRounds: 5,
  myName: "",
  otherInfo: "",
  apiKeySet: false,
};

const FEATURE_PROMPTS = {
  summarize: { label: '总结', icon: '📝' },
  rewrite: { label: '润色改写', icon: '✨' },
  proofread: { label: '稽核检查', icon: '🔍' },
  summarizePage: { label: '总结该网页', icon: '📄' },
  summarizeLeaderComments: { label: '总结领导批示', icon: '👔' },
};

// ========== 内置提示词模板 ==========
const BUILT_IN_PROMPTS = [
  { id: 'builtin_1', title: '💻 解释代码', content: '请详细解释这段代码的功能、逻辑和关键实现细节：\n\n{{selection}}', icon: '💻', isBuiltIn: true },
  { id: 'builtin_2', title: '📝 总结文字', content: '请对以下内容进行简明扼要的总结，提取核心要点：\n\n{{selection}}', icon: '📝', isBuiltIn: true },
  { id: 'builtin_3', title: '✨ 润色文字', content: '请对以下文字进行润色和改写，使其更加流畅、专业、易读：\n\n{{selection}}', icon: '✨', isBuiltIn: true },
  { id: 'builtin_4', title: '🔍 稽核检查', content: '请对以下文字进行细致的稽核，检查是否存在错别字、语法问题、格式问题或表达不当的地方，并给出修改建议：\n\n{{selection}}', icon: '🔍', isBuiltIn: true },
  { id: 'builtin_5', title: '🌐 翻译中文', content: '请将以下内容翻译成中文，保持原意的同时力求自然流畅：\n\n{{selection}}', icon: '🌐', isBuiltIn: true },
  { id: 'builtin_6', title: '🇺🇸 翻译英文', content: '请将以下内容翻译成英文，保持原意的同时力求自然地道：\n\n{{selection}}', icon: '🇺🇸', isBuiltIn: true },
  { id: 'builtin_7', title: '🐛 查找 Bug', content: '请仔细检查以下代码，找出潜在的bug、安全漏洞或性能问题，并给出修复建议：\n\n{{selection}}', icon: '🐛', isBuiltIn: true },
  { id: 'builtin_8', title: '📋 生成文档', content: '请为以下代码或功能生成详细的文档说明，包括功能描述、参数说明、使用示例等：\n\n{{selection}}', icon: '📋', isBuiltIn: true },
  { id: 'builtin_9', title: '⚡ 优化代码', content: '请对以下代码进行优化，提升其性能、可读性或简化逻辑：\n\n{{selection}}', icon: '⚡', isBuiltIn: true },
  { id: 'builtin_10', title: '💡 提供建议', content: '请对以下内容进行分析，并给出专业、实用的建议或改进方案：\n\n{{selection}}', icon: '💡', isBuiltIn: true },
];

// ========== 全局状态 ==========
let config = { ...DEFAULT_CONFIG };
let currentBotBubble = null;
let currentThinkBubble = null;
let currentThinkContainer = null;
let accumulatedText = "";
let accumulatedThinkText = "";
let isProcessingPending = false;
let pageContextCache = null;
let pageCookiesCache = null;
let isInThinkBlock = false;

// 流式请求状态
let isStreaming = false;
let currentStreamSessionId = null;

// 会话相关状态（现在存储在 chrome.storage.local 中）
let sessions = [];
let currentSessionId = null;
let promptTemplates = [];

// 为了向后兼容，内存中仍保留当前对话历史（实际已保存在当前会话中）
let conversationHistory = [];

const messagesContainer = document.getElementById('ai-messages');
const inputTextarea = document.getElementById('ai-input');
const sendButton = document.getElementById('ai-send');
const configPanel = document.getElementById('ai-config-panel');

// ========== Storage Manager - 数据持久化 ==========
const StorageManager = {
  async loadSessions() {
    try {
      const data = await chrome.storage.local.get(['sessions', 'currentSessionId']);
      sessions = data.sessions || [];
      currentSessionId = data.currentSessionId || null;
      console.log('[Storage] 加载会话:', sessions.length, '当前会话ID:', currentSessionId);
      return sessions;
    } catch (e) {
      console.error('[Storage] 加载会话失败:', e);
      sessions = [];
      currentSessionId = null;
      return [];
    }
  },

  async saveSessions() {
    try {
      await chrome.storage.local.set({ sessions, currentSessionId });
      console.log('[Storage] 保存会话成功:', sessions.length);
    } catch (e) {
      console.error('[Storage] 保存会话失败:', e);
    }
  },

  async loadPromptTemplates() {
    try {
      const data = await chrome.storage.local.get(['promptTemplates']);
      promptTemplates = data.promptTemplates || [];
      console.log('[Storage] 加载提示词模板:', promptTemplates.length);
      return promptTemplates;
    } catch (e) {
      console.error('[Storage] 加载提示词模板失败:', e);
      promptTemplates = [];
      return [];
    }
  },

  async savePromptTemplates() {
    try {
      await chrome.storage.local.set({ promptTemplates });
      console.log('[Storage] 保存提示词模板成功:', promptTemplates.length);
    } catch (e) {
      console.error('[Storage] 保存提示词模板失败:', e);
    }
  },

  async exportData() {
    const data = await chrome.storage.local.get(['sessions', 'promptTemplates']);
    return JSON.stringify(data, null, 2);
  },

  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.sessions) await chrome.storage.local.set({ sessions: data.sessions });
      if (data.promptTemplates) await chrome.storage.local.set({ promptTemplates: data.promptTemplates });
      await this.loadSessions();
      await this.loadPromptTemplates();
      return true;
    } catch (e) {
      console.error('[Storage] 导入数据失败:', e);
      return false;
    }
  },

  async clearAllData() {
    try {
      await chrome.storage.local.remove(['sessions', 'currentSessionId', 'promptTemplates']);
      sessions = [];
      currentSessionId = null;
      promptTemplates = [];
      console.log('[Storage] 已清空所有数据');
      return true;
    } catch (e) {
      console.error('[Storage] 清空数据失败:', e);
      return false;
    }
  }
};

// ========== Session Manager - 会话管理 ==========
const SessionManager = {
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  createSession(title = '新会话') {
    const session = {
      id: this.generateId(),
      title: title.substring(0, 50),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pageContext: null
    };
    sessions.unshift(session);
    currentSessionId = session.id;
    StorageManager.saveSessions();
    return session;
  },

  getCurrentSession() {
    return sessions.find(s => s.id === currentSessionId) || null;
  },

  switchSession(sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      currentSessionId = sessionId;
      conversationHistory = [...session.messages];
      StorageManager.saveSessions();
      return session;
    }
    return null;
  },

  deleteSession(sessionId) {
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index > -1) {
      sessions.splice(index, 1);
      if (currentSessionId === sessionId) {
        currentSessionId = sessions.length > 0 ? sessions[0].id : null;
        if (currentSessionId) {
          const newSession = sessions.find(s => s.id === currentSessionId);
          conversationHistory = newSession ? [...newSession.messages] : [];
        } else {
          conversationHistory = [];
        }
      }
      StorageManager.saveSessions();
      return true;
    }
    return false;
  },

  updateSessionTitle(sessionId, newTitle) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.title = newTitle.substring(0, 50);
      session.updatedAt = Date.now();
      StorageManager.saveSessions();
      return true;
    }
    return false;
  },

  saveCurrentSessionMessages() {
    const session = this.getCurrentSession();
    if (session) {
      session.messages = [...conversationHistory];
      session.updatedAt = Date.now();
      StorageManager.saveSessions();
    } else if (conversationHistory.length > 0) {
      // 如果没有当前会话但有消息，创建新会话
      this.createSession('新会话');
      const newSession = this.getCurrentSession();
      if (newSession) {
        newSession.messages = [...conversationHistory];
        newSession.updatedAt = Date.now();
        StorageManager.saveSessions();
      }
    }
  },

  autoGenerateTitle(sessionId, firstMessage) {
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.title === '新会话' && firstMessage) {
      const title = firstMessage.substring(0, 20) + (firstMessage.length > 20 ? '...' : '');
      session.title = title;
      session.updatedAt = Date.now();
      StorageManager.saveSessions();
    }
  }
};

// ========== Prompt Manager - 提示词模板管理 ==========
const PromptManager = {
  getAllPrompts() {
    return [...BUILT_IN_PROMPTS, ...promptTemplates];
  },

  createCustomPrompt(title, content, icon = '💬') {
    const prompt = {
      id: 'custom_' + Date.now(),
      title: title.substring(0, 30),
      content: content,
      icon: icon,
      isBuiltIn: false,
      createdAt: Date.now()
    };
    promptTemplates.push(prompt);
    StorageManager.savePromptTemplates();
    return prompt;
  },

  updatePrompt(promptId, title, content, icon) {
    const prompt = promptTemplates.find(p => p.id === promptId);
    if (prompt) {
      prompt.title = title.substring(0, 30);
      prompt.content = content;
      if (icon) prompt.icon = icon;
      StorageManager.savePromptTemplates();
      return true;
    }
    return false;
  },

  deletePrompt(promptId) {
    const index = promptTemplates.findIndex(p => p.id === promptId);
    if (index > -1) {
      promptTemplates.splice(index, 1);
      StorageManager.savePromptTemplates();
      return true;
    }
    return false;
  },

  getPromptById(promptId) {
    return BUILT_IN_PROMPTS.find(p => p.id === promptId) ||
           promptTemplates.find(p => p.id === promptId) ||
           null;
  },

  applyPrompt(promptId, selection = '') {
    const prompt = this.getPromptById(promptId);
    if (prompt) {
      return prompt.content.replace(/\{\{selection\}\}/g, selection);
    }
    return null;
  }
};

async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_BACKEND_URL" }, (response) => {
      resolve(response?.url || "http://localhost:8765");
    });
  });
}

async function init() {
  try {
    await loadConfig();
    initMarkdownParser();
    setupEventListeners();
    setupSessionPanelListeners();
    setupPromptPanelListeners();

    // 加载会话和提示词数据
    await StorageManager.loadSessions();
    await StorageManager.loadPromptTemplates();
    renderSessionList();
    renderQuickPrompts();

    // 恢复当前会话
    if (currentSessionId) {
      const session = SessionManager.getCurrentSession();
      if (session && session.messages.length > 0) {
        conversationHistory = [...session.messages];
        renderConversationHistory();
        console.log("[Sidepanel] 恢复会话:", session.title, "消息数:", session.messages.length);
      } else {
        // 创建新会话
        SessionManager.createSession('新会话');
        renderSessionList();
      }
    } else {
      // 没有当前会话，创建新会话
      SessionManager.createSession('新会话');
      renderSessionList();
    }

    console.log("[Sidepanel] 初始化完成，检查待处理问题...");
    await checkPendingQuestion();

    chrome.storage.onChanged.addListener(handleStorageChange);
  } catch (e) {
    console.error("[Sidepanel] 初始化失败:", e);
  }
}

function handleStorageChange(changes, namespace) {
  if (namespace === 'session' && (changes.pendingQuestion?.newValue || changes.pendingAction?.newValue)) {
    console.log("[Sidepanel] 检测到待处理数据变化");
    checkPendingQuestion();
  }
}

async function checkPendingQuestion() {
  if (isProcessingPending) {
    console.log("[Sidepanel] 已有正在处理的待处理问题，跳过");
    return;
  }

  try {
    const result = await chrome.storage.session.get(['pendingQuestion', 'pendingAction', 'pendingSelectedText']);
    console.log("[Sidepanel] 获取到待处理数据:", result);

    if (result.pendingQuestion) {
      isProcessingPending = true;
      const question = result.pendingQuestion;
      const action = result.pendingAction;
      const selectedText = result.pendingSelectedText;

      await chrome.storage.session.remove(['pendingQuestion', 'pendingAction', 'pendingSelectedText']);

      console.log("[Sidepanel] 处理待处理问题:", question, "动作:", action);

      if (action === 'ask') {
        if (selectedText) {
          inputTextarea.value = `请回答关于这段文字的问题：\n\n「${selectedText}」\n\n`;
          inputTextarea.focus();
          inputTextarea.style.height = 'auto';
          inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
          inputTextarea.setSelectionRange(inputTextarea.value.length, inputTextarea.value.length);
        }
      } else if (action === 'openPanel') {
        console.log("[Sidepanel] 仅打开侧边栏");
      } else if (action === 'summarizePage' || action === 'summarizeLeaderComments') {
        await handlePageSummary(action);
      } else {
        const feature = FEATURE_PROMPTS[action];
        if (feature) {
          const shortText = selectedText.substring(0, 20) + (selectedText.length > 20 ? '...' : '');
          addMessage('user', `${feature.icon} ${feature.label}：「${shortText}」`);

          let pageContext = null;
          if (config.useContext) {
            pageContext = await getCurrentPageContext();
          }

          const backendUrl = await getBackendUrl();
          try {
            const promptRes = await fetch(`${backendUrl}/api/build-prompt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: action,
                selected_text: selectedText,
                page_content: pageContext?.content || "",
                page_metadata: pageContext?.metadata || {},
                conversation_history: conversationHistory,
                max_total_chars: config.maxTotalChars,
                max_history_rounds: Math.min(3, config.maxHistoryRounds),
              }),
            });
            const promptData = await promptRes.json();

            if (promptData.error) {
              addMessage('bot', promptData.error);
              return;
            }

            conversationHistory.push({ role: 'user', content: `${feature.icon} ${feature.label}：「${shortText}」` });
            SessionManager.saveCurrentSessionMessages();
            await askAI(promptData.messages, promptData.enable_thinking);
          } catch (e) {
            addMessage('bot', '后端连接失败: ' + e.message);
          }
        }
      }
    }
  } catch (e) {
    console.error("[Sidepanel] 检查待处理问题失败:", e);
  } finally {
    isProcessingPending = false;
  }
}

async function handlePageSummary(action) {
  const feature = FEATURE_PROMPTS[action];
  if (!feature) {
    console.error("[Sidepanel] 未知的功能类型:", action);
    return;
  }

  addMessage('user', `${feature.icon} ${feature.label}`);

  updateContextStatus('正在获取网页内容...');
  const pageContext = await getCurrentPageContext(true);

  if (!pageContext || !pageContext.content) {
    addMessage('bot', '无法获取当前网页内容，请确保您正在浏览一个可访问的网页。');
    return;
  }

  updateContextStatus('正在分析...');

  if (action === 'summarizeLeaderComments') {
    await loadConfig();
    if (!config.myName && !config.otherInfo) {
      addMessage('bot', '请先在后端配置个人身份信息（.env 中的 MY_NAME / OTHER_INFO），以便准确识别相关批示。');
      return;
    }
  }

  conversationHistory.push({
    role: 'user',
    content: `${feature.icon} ${feature.label}`
  });
  SessionManager.saveCurrentSessionMessages();

  const backendUrl = await getBackendUrl();
  try {
    const promptRes = await fetch(`${backendUrl}/api/build-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action,
        page_content: pageContext.content,
        page_metadata: pageContext.metadata || {},
        conversation_history: conversationHistory,
        max_total_chars: config.maxTotalChars,
        max_history_rounds: Math.min(3, config.maxHistoryRounds),
      }),
    });
    const promptData = await promptRes.json();

    if (promptData.error) {
      addMessage('bot', promptData.error);
      return;
    }

    await askAI(promptData.messages, promptData.enable_thinking);
  } catch (e) {
    addMessage('bot', '后端连接失败: ' + e.message);
  }

  const statusText = buildContextStatusText(pageContext);
  updateContextStatus(statusText);
}

function initMarkdownParser() {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      gfm: true,
      breaks: true,
      headerIds: false,
      mangle: false,
      sanitize: false,
      smartLists: true,
      smartypants: true,
      xhtml: false,
      highlight: function(code, lang) {
        if (typeof hljs !== 'undefined') {
          try {
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
          } catch (e) {
            return code;
          }
        }
        return code;
      }
    });
  }
}

async function loadConfig() {
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/config`);
    if (res.ok) {
      const backendConfig = await res.json();
      const mapped = {
        useContext: backendConfig.use_context,
        contextLength: backendConfig.context_length,
        maxTotalChars: backendConfig.max_total_chars,
        maxHistoryRounds: backendConfig.max_history_rounds,
        myName: backendConfig.my_name,
        otherInfo: backendConfig.other_info,
        apiKeySet: backendConfig.api_key_set,
      };
      config = { ...DEFAULT_CONFIG, ...mapped };
      console.log("[Sidepanel] 从后端加载配置成功，apiKeySet:", config.apiKeySet);
    } else {
      console.log("[Sidepanel] 后端配置加载失败，使用默认配置");
    }
  } catch (e) {
    console.log("[Sidepanel] 后端未连接，使用默认配置:", e.message);
  }
}

async function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConfig),
    });
    if (res.ok) {
      console.log("[Sidepanel] 配置已保存到后端");
      return true;
    }
    console.error("[Sidepanel] 保存配置到后端失败:", res.status);
    return false;
  } catch (e) {
    console.error("[Sidepanel] 保存配置失败:", e);
    return false;
  }
}

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

  document.querySelector('.ai-config-save').addEventListener('click', async () => {
    const contextLengthInput = parseInt(document.getElementById('ai-context-length').value);
    const maxTotalCharsInput = parseInt(document.getElementById('ai-max-total-chars').value);
    const maxHistoryRoundsInput = parseInt(document.getElementById('ai-max-history-rounds').value);

    const newConfig = {
      use_context: document.getElementById('ai-use-context').checked,
      context_length: contextLengthInput >= 1000 && contextLengthInput <= 15000 ? contextLengthInput : DEFAULT_CONFIG.contextLength,
      max_total_chars: maxTotalCharsInput >= 5000 ? maxTotalCharsInput : DEFAULT_CONFIG.maxTotalChars,
      max_history_rounds: maxHistoryRoundsInput >= 1 && maxHistoryRoundsInput <= 20 ? maxHistoryRoundsInput : DEFAULT_CONFIG.maxHistoryRounds,
      my_name: document.getElementById('ai-my-name').value.trim(),
      other_info: document.getElementById('ai-other-info').value.trim(),
    };

    const enableDoubleClick = document.getElementById('ai-enable-double-click').checked;
    await chrome.storage.sync.set({ enableDoubleClick });

    if (await saveConfig(newConfig)) {
      config = { ...config, ...newConfig };
      console.log("[Sidepanel] 配置已保存并更新到内存");
      showToast('配置已保存');
      closeConfigPanel();
    } else {
      showToast('配置保存失败，请检查后端连接');
    }
  });

  document.querySelector('.ai-config-reset').addEventListener('click', async () => {
    if (confirm('确定要恢复默认配置吗？')) {
      config = { ...DEFAULT_CONFIG };
      refreshConfigPanel();
      showToast('已恢复默认配置');
    }
  });

  document.querySelector('.ai-refresh-context').addEventListener('click', async () => {
    await handleRefreshContext();
  });

  const miniRefreshBtn = document.querySelector('.ai-refresh-context-mini');
  if (miniRefreshBtn) {
    miniRefreshBtn.addEventListener('click', async () => {
      await handleRefreshContext();
    });
  }

  const reloadConfigBtn = document.getElementById('ai-reload-config');
  if (reloadConfigBtn) {
    reloadConfigBtn.addEventListener('click', async () => {
      await handleReloadConfig();
    });
  }
}

async function sendMessage() {
  const text = inputTextarea.value.trim();
  if (!text) return;

  inputTextarea.value = '';
  inputTextarea.style.height = 'auto';

  addMessage('user', text);

  let pageContext = null;
  if (config.useContext) {
    pageContext = await getCurrentPageContext();
  }

  const backendUrl = await getBackendUrl();
  const enableThinkCheckbox = document.getElementById('ai-enable-think');
  const enableThinking = enableThinkCheckbox ? enableThinkCheckbox.checked : false;

  try {
    const promptRes = await fetch(`${backendUrl}/api/build-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: text,
        page_content: pageContext?.content || "",
        page_metadata: pageContext?.metadata || {},
        conversation_history: conversationHistory,
        max_total_chars: config.maxTotalChars,
        max_history_rounds: config.maxHistoryRounds,
        enable_thinking: enableThinking,
      }),
    });
    const promptData = await promptRes.json();

    if (promptData.error) {
      addMessage('bot', promptData.error);
      return;
    }

    conversationHistory.push({ role: 'user', content: text });
    SessionManager.saveCurrentSessionMessages();

    const currentSession = SessionManager.getCurrentSession();
    if (currentSession && currentSession.messages.length <= 2) {
      SessionManager.autoGenerateTitle(currentSession.id, text);
      renderSessionList();
    }

    await askAI(promptData.messages, promptData.enable_thinking);
  } catch (e) {
    addMessage('bot', '后端连接失败: ' + e.message);
  }
}

function addMessage(role, text) {
  const row = document.createElement('div');
  row.className = `ai-msg-row ai-${role}-row`;

  const avatar = document.createElement('div');
  avatar.className = `ai-avatar ai-${role}-avatar`;
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const content = document.createElement('div');
  content.className = 'ai-msg-content';

  if (role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = `ai-msg ai-${role}`;
    bubble.textContent = text;
    content.appendChild(bubble);
  } else {
    const bubble = document.createElement('div');
    bubble.className = `ai-msg ai-${role}`;
    if (text === '思考中...') {
      bubble.innerHTML = `
        <div class="ai-typing">
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
        </div>
      `;
    } else {
      bubble.innerHTML = parseMarkdown(text);
    }
    content.appendChild(bubble);
  }

  if (role === 'user') {
    row.appendChild(content);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(content);
  }

  messagesContainer.appendChild(row);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return { row, content };
}

function createThinkBubble(contentContainer) {
  const thinkContainer = document.createElement('div');
  thinkContainer.className = 'ai-think-container';

  const thinkHeader = document.createElement('div');
  thinkHeader.className = 'ai-think-header';
  thinkHeader.innerHTML = `
    <div class="ai-think-title">
      <span class="ai-think-icon">💭</span>
      <span>思考过程</span>
    </div>
    <span class="ai-think-toggle">▼</span>
  `;

  const thinkBubble = document.createElement('div');
  thinkBubble.className = 'ai-msg ai-think';

  thinkHeader.addEventListener('click', () => {
    const isCollapsed = thinkContainer.classList.toggle('collapsed');
    const toggle = thinkHeader.querySelector('.ai-think-toggle');
    toggle.textContent = isCollapsed ? '▶' : '▼';
  });

  thinkContainer.appendChild(thinkHeader);
  thinkContainer.appendChild(thinkBubble);
  contentContainer.appendChild(thinkContainer);

  return { thinkContainer, thinkBubble };
}

function collapseThinkBubble(thinkContainer) {
  if (thinkContainer) {
    thinkContainer.classList.add('collapsed');
    const toggle = thinkContainer.querySelector('.ai-think-toggle');
    if (toggle) {
      toggle.textContent = '▶';
    }
  }
}

function createContentBubble(contentContainer) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg ai-bot';
  contentContainer.appendChild(bubble);
  return bubble;
}

function parseMarkdown(text) {
  if (!text) return '';

  if (typeof marked !== 'undefined') {
    try {
      return marked.parse(text);
    } catch (e) {
      console.log('Marked parsing failed:', e);
    }
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

async function getCurrentPageContext(forceRefresh = false) {
  if (!config.useContext) {
    console.log("[Sidepanel] 上下文功能已禁用");
    return null;
  }

  if (!forceRefresh && pageContextCache) {
    console.log("[Sidepanel] 使用缓存的网页上下文");
    return pageContextCache;
  }

  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    console.log("[Sidepanel] 最后聚焦窗口ID:", lastFocusedWindow.id);

    const activeTab = lastFocusedWindow.tabs?.find(tab => tab.active);

    if (!activeTab || !activeTab.id) {
      console.log("[Sidepanel] 无法获取当前标签页");
      return null;
    }

    console.log("[Sidepanel] 当前标签页:", activeTab.url);

    const excludedPatterns = [
      'chrome://', 'chrome-extension://', 'edge://', 'file://', 'about:', 'data:'
    ];
    if (excludedPatterns.some(pattern => activeTab.url?.startsWith(pattern))) {
      console.log("[Sidepanel] 特殊页面不提供上下文:", activeTab.url);
      return null;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_CONTEXT" });
    } catch (e) {
      console.log("[Sidepanel] Content script 可能未加载，尝试注入...", e.message);

      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        });
        console.log("[Sidepanel] Content script 注入成功");

        await new Promise(resolve => setTimeout(resolve, 200));
        response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_CONTEXT" });
      } catch (injectError) {
        console.error("[Sidepanel] 注入失败:", injectError.message);
        return null;
      }
    }

    if (response && response.content) {
      let content = response.content;
      console.log("[Sidepanel] 原始内容长度:", content.length, "限制:", config.contextLength);
      if (content.length > config.contextLength) {
        content = content.substring(0, config.contextLength) + '\n...(内容已截断)';
      }

      pageContextCache = {
        content: content,
        metadata: response.metadata || {}
      };

      console.log("[Sidepanel] 获取到网页上下文，长度:", content.length);
      return pageContextCache;
    } else {
      console.log("[Sidepanel] 响应为空或没有内容", response);
    }
  } catch (e) {
    console.error("[Sidepanel] 获取网页上下文失败:", e);
  }

  return null;
}

function clearContextCache() {
  pageContextCache = null;
  pageCookiesCache = null;
  console.log("[Sidepanel] 上下文和 cookies 缓存已清空");
}

async function getPageCookies() {
  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    const activeTab = lastFocusedWindow.tabs?.find(tab => tab.active);
    if (!activeTab || !activeTab.id) return null;

    const excludedPatterns = [
      'chrome://', 'chrome-extension://', 'edge://', 'file://', 'about:', 'data:'
    ];
    if (excludedPatterns.some(pattern => activeTab.url?.startsWith(pattern))) return null;

    let response;
    try {
      response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_COOKIES" });
    } catch (e) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_COOKIES" });
      } catch (injectError) {
        console.warn("[Sidepanel] 获取 cookies 失败:", injectError.message);
        return null;
      }
    }

    if (response && !response.error) {
      pageCookiesCache = {
        cookies: response.cookies || "",
        localStorage: response.localStorage || {},
        sessionStorage: response.sessionStorage || {},
        url: response.url || "",
        domain: response.domain || ""
      };
      console.log("[Sidepanel] 获取到页面存储数据，cookies长度:", pageCookiesCache.cookies.length);
      return pageCookiesCache;
    }
  } catch (e) {
    console.warn("[Sidepanel] 获取页面存储数据失败:", e);
  }
  return null;
}

async function refreshContextStatus() {
  updateContextStatus('正在获取上下文...');
  const context = await getCurrentPageContext(true);
  if (context) {
    const statusText = buildContextStatusText(context);
    updateContextStatus(statusText);
    console.log("[Sidepanel] 状态栏已更新:", statusText);
  } else {
    updateContextStatus('无法获取当前页面上下文');
  }
}

function buildContextStatusText(context) {
  if (!context || !context.content) {
    return '无法获取上下文';
  }

  let parts = [];
  const content = context.content;
  const metadata = context.metadata || {};

  parts.push(`总长度: ${content.length} 字符`);

  if (content.includes('=== 当前弹窗/模态框内容 ===')) {
    const modalMatch = content.match(/--- 弹窗 \d+ \[(\w+)\] ---/g);
    if (modalMatch) {
      parts.push(`发现 ${modalMatch.length} 个弹窗`);
    }

    if (content.includes('[包含')) {
      const tabMatch = content.match(/\[包含 (\d+) 个 Tab\]/g);
      if (tabMatch) {
        const totalTabs = tabMatch.reduce((sum, match) => {
          const num = parseInt(match.match(/\d+/)[0]);
          return sum + num;
        }, 0);
        parts.push(`共 ${totalTabs} 个 Tab 内容`);
      }
    }

    if (content.includes('Steps 组件') || content.includes('个步骤/阶段')) {
      const stepsMatch = content.match(/\[包含 (\d+) 个步骤[/\/]阶段\]|Steps 组件: (\d+) 个步骤/g);
      if (stepsMatch) {
        const totalSteps = stepsMatch.reduce((sum, match) => {
          const num = parseInt(match.match(/\d+/)[0]);
          return sum + num;
        }, 0);
        parts.push(`共 ${totalSteps} 个步骤`);
      }
    }
  }

  if (metadata.title) {
    parts.push(`页面: ${metadata.title.substring(0, 30)}${metadata.title.length > 30 ? '...' : ''}`);
  }

  return parts.join(' | ');
}

function updateContextStatus(status) {
  const statusEl = document.getElementById('ai-context-status');
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = 'context-status ' + (status.includes('总长度') ? 'has-context' : '');
  }

  const infoEl = document.getElementById('ai-context-info');
  if (infoEl) {
    infoEl.textContent = status;
    infoEl.className = 'context-info ' + (status.includes('总长度') ? 'has-context' : '');
  }
}

async function askAI(messages, enableThinking = false) {
  await loadConfig();

  console.log("[Sidepanel] askAI 被调用，消息数:", messages.length, "apiKeySet:", config.apiKeySet);

  if (!config.apiKeySet) {
    addMessage('bot', '后端 API Key 未配置，请在后端 .env 文件中设置 API_KEY');
    openConfigPanel();
    return;
  }

  currentBotBubble = null;
  currentThinkBubble = null;
  currentThinkContainer = null;
  accumulatedText = '';
  accumulatedThinkText = '';
  isInThinkBlock = false;

  // 设置流式请求状态
  isStreaming = true;
  currentStreamSessionId = 'stream_' + Date.now();
  updateSendButtonState();

  const pageCookies = await getPageCookies();

  const requestBody = {
    messages: messages,
    stream: true,
    enable_thinking: enableThinking,
    page_cookies: pageCookies || {},
  };

  try {
    chrome.runtime.sendMessage({
      type: 'API_STREAM_REQUEST',
      body: JSON.stringify(requestBody),
      sessionId: currentStreamSessionId,
    });
  } catch (e) {
    if (currentBotBubble) {
      currentBotBubble.innerHTML = '出错：' + e.message;
    }
    currentBotBubble = null;
    isStreaming = false;
    updateSendButtonState();
  }
}

// 中止流式请求
function abortStream() {
  if (isStreaming && currentStreamSessionId) {
    chrome.runtime.sendMessage({
      type: 'ABORT_STREAM',
      sessionId: currentStreamSessionId,
    }, (response) => {
      console.log("[Sidepanel] 中止请求响应:", response);
    });

    // 更新 UI 显示已中止
    if (currentBotBubble) {
      const contentBubble = currentBotBubble.content.querySelector('.ai-bot:not(.ai-think)');
      if (contentBubble && accumulatedText) {
        contentBubble.innerHTML = parseMarkdown(accumulatedText + '\n\n*[已中止]*');
      } else if (!contentBubble && !accumulatedText) {
        const bubble = createContentBubble(currentBotBubble.content);
        bubble.innerHTML = '*[已中止]*';
      }
    }

    // 保存已接收的内容
    if (accumulatedText.trim() || accumulatedThinkText.trim()) {
      const fullResponse = accumulatedThinkText
        ? `  \n${accumulatedThinkText}\n\n${accumulatedText}\n\n*[已中止]*`
        : `${accumulatedText}\n\n*[已中止]*`;
      conversationHistory.push({ role: 'assistant', content: fullResponse });
      SessionManager.saveCurrentSessionMessages();
      renderSessionList();
    }

    // 重置状态
    isStreaming = false;
    currentStreamSessionId = null;
    updateSendButtonState();
    resetStreamState();
    showToast('已中止回复');
  }
}

// 重置流式状态
function resetStreamState() {
  currentBotBubble = null;
  currentThinkBubble = null;
  currentThinkContainer = null;
  accumulatedText = '';
  accumulatedThinkText = '';
  isInThinkBlock = false;
}

// 更新发送按钮状态（发送/中止切换）
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_CONTENT_CHANGED') {
    console.log("[Sidepanel] 收到页面变化通知:", msg.url);
    clearContextCache();
    refreshContextStatus();
    return;
  }

  if (msg.type === 'STREAM_CHUNK') {
    const { content, contentType } = msg;

    if (contentType === 'think_start') {
      if (!currentBotBubble) {
        const msgElements = addMessage('bot', '');
        currentBotBubble = msgElements;
      }
      isInThinkBlock = true;

    } else if (contentType === 'think') {
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

    } else if (contentType === 'think_end') {
      isInThinkBlock = false;
      if (currentThinkContainer) {
        collapseThinkBubble(currentThinkContainer);
      }
      currentThinkBubble = null;
      currentThinkContainer = null;

    } else if (contentType === 'content') {
      if (!currentBotBubble) {
        const msgElements = addMessage('bot', '');
        currentBotBubble = msgElements;
      }
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

  } else if (msg.type === 'STREAM_DONE' || msg.type === 'STREAM_ABORTED') {
    const fullResponse = accumulatedThinkText
      ? `  \n${accumulatedThinkText}\n\n${accumulatedText}`
      : accumulatedText;
    if (fullResponse.trim()) {
      const maxResponseLength = 8000;
      const savedResponse = fullResponse.length > maxResponseLength
        ? fullResponse.substring(0, maxResponseLength) + '\n...(回复已截断保存)'
        : fullResponse;
      conversationHistory.push({ role: 'assistant', content: savedResponse });
      console.log("[Sidepanel] 已保存回复到历史，当前历史长度:", conversationHistory.length);

      const maxTotalMessages = (config.maxHistoryRounds || 5) * 2 + 2;
      if (conversationHistory.length > maxTotalMessages * 2) {
        const systemMessages = conversationHistory.filter(m => m.role === 'system');
        const otherMessages = conversationHistory.filter(m => m.role !== 'system');
        const recentMessages = otherMessages.slice(-maxTotalMessages);
        conversationHistory = [...systemMessages, ...recentMessages];
        console.log("[Sidepanel] 已清理旧历史，新历史长度:", conversationHistory.length);
      }

      // 自动保存到当前会话
      SessionManager.saveCurrentSessionMessages();
      // 更新会话列表显示（更新时间和标题）
      renderSessionList();
    }

    // 重置流式状态
    isStreaming = false;
    currentStreamSessionId = null;
    updateSendButtonState();

    currentBotBubble = null;
    currentThinkBubble = null;
    currentThinkContainer = null;
    accumulatedText = '';
    accumulatedThinkText = '';
    isInThinkBlock = false;

  } else if (msg.type === 'STREAM_ERROR') {
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
    // 重置流式状态
    isStreaming = false;
    currentStreamSessionId = null;
    updateSendButtonState();
    resetStreamState();
  }
});

function clearMessages() {
  messagesContainer.innerHTML = '';
  clearContextCache();
  conversationHistory = [];
  // 创建新会话
  SessionManager.createSession('新会话');
  renderSessionList();
  console.log("[Sidepanel] 已创建新会话");
  showToast('已新建对话');
}

// ========== 会话面板 UI 功能 ==========
function toggleSessionPanel() {
  const sidebar = document.getElementById('ai-sidebar-left');
  const isCollapsed = sidebar.classList.contains('collapsed');
  if (isCollapsed) {
    sidebar.classList.remove('collapsed');
    renderSessionList();
  } else {
    sidebar.classList.add('collapsed');
  }
}

function renderSessionList() {
  const list = document.getElementById('ai-session-list');
  list.innerHTML = '';

  // 按更新时间排序
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  sortedSessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'ai-session-item' + (session.id === currentSessionId ? ' active' : '');
    item.dataset.id = session.id;

    const title = document.createElement('div');
    title.className = 'ai-session-item-title';
    title.textContent = session.title || '新会话';
    title.title = session.title || '新会话';

    const actions = document.createElement('div');
    actions.className = 'ai-session-item-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ai-session-item-action';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = '删除会话';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteSession(session.id);
    };

    actions.appendChild(deleteBtn);
    item.appendChild(title);
    item.appendChild(actions);

    item.onclick = () => switchToSession(session.id);

    list.appendChild(item);
  });
}

function switchToSession(sessionId) {
  const session = SessionManager.switchSession(sessionId);
  if (session) {
    renderSessionList();
    renderConversationHistory();
    showToast(`切换到: ${session.title}`);
  }
}

function renderConversationHistory() {
  messagesContainer.innerHTML = '';
  conversationHistory.forEach(msg => {
    if (msg.role !== 'system') {
      addMessage(msg.role === 'assistant' ? 'bot' : 'user', msg.content);
    }
  });
}

function deleteSession(sessionId) {
  if (confirm('确定要删除这个会话吗？此操作不可恢复。')) {
    SessionManager.deleteSession(sessionId);
    renderSessionList();
    renderConversationHistory();
    if (currentSessionId === null) {
      // 所有会话都删除了，创建新会话
      SessionManager.createSession('新会话');
      renderSessionList();
    }
    showToast('会话已删除');
  }
}

function setupSessionPanelListeners() {
  const toggleBtn = document.getElementById('ai-toggle-sidebar');
  const newSessionBtn = document.getElementById('ai-new-session-btn');
  const closeBtn = document.getElementById('ai-session-panel-close');
  const exportBtn = document.getElementById('ai-export-data');
  const importBtn = document.getElementById('ai-import-data');
  const clearAllBtn = document.getElementById('ai-clear-all-data');
  const managePromptsBtn = document.getElementById('ai-manage-prompts');

  if (toggleBtn) toggleBtn.addEventListener('click', toggleSessionPanel);
  if (newSessionBtn) newSessionBtn.addEventListener('click', () => {
    clearMessages();
    toggleSessionPanel();
  });
  if (closeBtn) closeBtn.addEventListener('click', toggleSessionPanel);

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const data = await StorageManager.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('数据已导出');
    });
  }

  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          const text = await file.text();
          if (await StorageManager.importData(text)) {
            renderSessionList();
            renderConversationHistory();
            renderQuickPrompts();
            showToast('数据已导入');
          } else {
            showToast('导入失败，请检查文件格式');
          }
        }
      };
      input.click();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      if (confirm('确定要清空所有会话和提示词数据吗？此操作不可恢复！')) {
        await StorageManager.clearAllData();
        messagesContainer.innerHTML = '';
        conversationHistory = [];
        SessionManager.createSession('新会话');
        renderSessionList();
        renderQuickPrompts();
        showToast('所有数据已清空');
      }
    });
  }

  if (managePromptsBtn) {
    managePromptsBtn.addEventListener('click', openPromptPanel);
  }
}

// ========== 提示词面板 UI 功能 ==========
function togglePromptPanel() {
  const panel = document.getElementById('ai-prompt-panel');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
  } else {
    panel.classList.add('open');
    renderPromptList();
  }
}

function openPromptPanel() {
  const panel = document.getElementById('ai-prompt-panel');
  panel.classList.add('open');
  renderPromptList();
}

function closePromptPanel() {
  const panel = document.getElementById('ai-prompt-panel');
  panel.classList.remove('open');
}

function renderPromptList() {
  const builtinList = document.getElementById('ai-prompt-builtin-list');
  const customList = document.getElementById('ai-prompt-custom-list');

  builtinList.innerHTML = '';
  customList.innerHTML = '';

  // 渲染内置提示词
  BUILT_IN_PROMPTS.forEach(prompt => {
    const item = createPromptListItem(prompt, true);
    builtinList.appendChild(item);
  });

  // 渲染自定义提示词
  promptTemplates.forEach(prompt => {
    const item = createPromptListItem(prompt, false);
    customList.appendChild(item);
  });
}

function createPromptListItem(prompt, isBuiltIn) {
  const item = document.createElement('div');
  item.className = 'ai-prompt-list-item';

  const title = document.createElement('span');
  title.className = 'ai-prompt-list-title';
  title.textContent = prompt.title;

  const actions = document.createElement('div');
  actions.className = 'ai-prompt-list-actions';

  if (!isBuiltIn) {
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✏️';
    editBtn.title = '编辑';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      editPrompt(prompt.id);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = '删除';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deletePromptItem(prompt.id);
    };

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
  }

  item.appendChild(title);
  item.appendChild(actions);

  item.onclick = () => usePromptInInput(prompt.id);

  return item;
}

function usePromptInInput(promptId) {
  const prompt = PromptManager.getPromptById(promptId);
  if (prompt) {
    inputTextarea.value = prompt.content;
    inputTextarea.focus();
    inputTextarea.style.height = 'auto';
    inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
    closePromptPanel();
    showToast('提示词已应用到输入框');
  }
}

function deletePromptItem(promptId) {
  if (confirm('确定要删除这个提示词模板吗？')) {
    PromptManager.deletePrompt(promptId);
    renderPromptList();
    renderQuickPrompts();
    showToast('提示词已删除');
  }
}

function editPrompt(promptId) {
  const prompt = PromptManager.getPromptById(promptId);
  if (!prompt) return;

  const modal = document.getElementById('ai-prompt-modal');
  const titleInput = document.getElementById('ai-prompt-title');
  const contentInput = document.getElementById('ai-prompt-content');
  const iconInput = document.getElementById('ai-prompt-icon');

  titleInput.value = prompt.title;
  contentInput.value = prompt.content;
  iconInput.value = prompt.icon || '💬';

  modal.dataset.editingId = promptId;
  modal.classList.add('open');
}

function setupPromptPanelListeners() {
  const closeBtn = document.getElementById('ai-prompt-panel-close');
  const createBtn = document.getElementById('ai-create-prompt');
  const modal = document.getElementById('ai-prompt-modal');
  const modalClose = document.getElementById('ai-prompt-modal-close');
  const modalSave = document.getElementById('ai-prompt-modal-save');
  const modalCancel = document.getElementById('ai-prompt-modal-cancel');

  if (closeBtn) closeBtn.addEventListener('click', closePromptPanel);

  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const modal = document.getElementById('ai-prompt-modal');
      document.getElementById('ai-prompt-title').value = '';
      document.getElementById('ai-prompt-content').value = '';
      document.getElementById('ai-prompt-icon').value = '💬';
      modal.dataset.editingId = '';
      modal.classList.add('open');
    });
  }

  if (modalClose) modalClose.addEventListener('click', () => modal.classList.remove('open'));
  if (modalCancel) modalCancel.addEventListener('click', () => modal.classList.remove('open'));

  if (modalSave) {
    modalSave.addEventListener('click', () => {
      const title = document.getElementById('ai-prompt-title').value.trim();
      const content = document.getElementById('ai-prompt-content').value.trim();
      const icon = document.getElementById('ai-prompt-icon').value.trim() || '💬';
      const editingId = modal.dataset.editingId;

      if (!title || !content) {
        showToast('请填写标题和内容');
        return;
      }

      if (editingId) {
        PromptManager.updatePrompt(editingId, title, content, icon);
      } else {
        PromptManager.createCustomPrompt(title, content, icon);
      }

      renderPromptList();
      renderQuickPrompts();
      modal.classList.remove('open');
      showToast(editingId ? '提示词已更新' : '提示词已创建');
    });
  }
}

// ========== 快捷提示词栏 ==========
function renderQuickPrompts() {
  const container = document.getElementById('ai-quick-prompts');
  if (!container) return;

  container.innerHTML = '';
  const allPrompts = PromptManager.getAllPrompts().slice(0, 6); // 只显示前6个

  allPrompts.forEach(prompt => {
    const chip = document.createElement('button');
    chip.className = 'ai-quick-prompt-chip';
    chip.innerHTML = `${prompt.icon || '💬'} ${prompt.title.replace(/^[💻📝✨🔍🌐🇺🇸🐛📋⚡💡]\s*/, '').substring(0, 4)}`;
    chip.title = prompt.title;
    chip.onclick = () => usePromptInInput(prompt.id);
    container.appendChild(chip);
  });
}

function applyQuickPrompt(promptId) {
  const text = inputTextarea.value.trim();
  const selectedText = window.getSelection()?.toString() || '';
  const prompt = PromptManager.getPromptById(promptId);

  if (prompt) {
    const selection = selectedText || text;
    const appliedContent = prompt.content.replace(/\{\{selection\}\}/g, selection);
    inputTextarea.value = appliedContent;
    inputTextarea.focus();
    inputTextarea.style.height = 'auto';
    inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
  }
}

function openConfigPanel() {
  refreshConfigPanel();
  configPanel.style.display = 'flex';
}

function closeConfigPanel() {
  configPanel.style.display = 'none';
}

function refreshConfigPanel() {
  console.log("[Sidepanel] 刷新设置面板，当前 config:", config);

  const apiKeyStatusEl = document.getElementById('ai-api-key-status');
  if (apiKeyStatusEl) {
    apiKeyStatusEl.textContent = config.apiKeySet ? '已配置 ✓' : '未配置 ✗';
    apiKeyStatusEl.className = 'config-status ' + (config.apiKeySet ? 'status-ok' : 'status-error');
  }

  const useContextEl = document.getElementById('ai-use-context');
  if (useContextEl) {
    useContextEl.checked = config.useContext !== false;
  }

  const contextLengthEl = document.getElementById('ai-context-length');
  if (contextLengthEl) {
    contextLengthEl.value = config.contextLength || DEFAULT_CONFIG.contextLength;
  }

  const enableDoubleClickEl = document.getElementById('ai-enable-double-click');
  if (enableDoubleClickEl) {
    enableDoubleClickEl.checked = config.enableDoubleClick === true;
  }

  const maxTotalCharsEl = document.getElementById('ai-max-total-chars');
  if (maxTotalCharsEl) {
    maxTotalCharsEl.value = config.maxTotalChars || DEFAULT_CONFIG.maxTotalChars;
  }

  const maxHistoryRoundsEl = document.getElementById('ai-max-history-rounds');
  if (maxHistoryRoundsEl) {
    maxHistoryRoundsEl.value = config.maxHistoryRounds || DEFAULT_CONFIG.maxHistoryRounds;
  }

  const myNameEl = document.getElementById('ai-my-name');
  if (myNameEl) {
    myNameEl.value = config.myName || '';
  }

  const otherInfoEl = document.getElementById('ai-other-info');
  if (otherInfoEl) {
    otherInfoEl.value = config.otherInfo || '';
  }

  console.log("[Sidepanel] 设置面板已刷新");
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'ai-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

async function handleReloadConfig() {
  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/config/reload`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      await loadConfig();
      refreshConfigPanel();
      showToast(data.ok ? '配置已热加载' : '热加载失败');
    } else {
      showToast('热加载失败，请检查后端连接');
    }
  } catch (e) {
    showToast('热加载失败: ' + e.message);
  }
}

async function handleRefreshContext() {
  clearContextCache();
  updateContextStatus('正在获取上下文...');
  const context = await getCurrentPageContext(true);
  if (context) {
    const statusText = buildContextStatusText(context);
    updateContextStatus(statusText);
    showToast(`已刷新上下文（${context.content.length}字符）`);
  } else {
    updateContextStatus('无法获取当前页面上下文');
    showToast('无法获取当前页面上下文');
  }
}

init();
