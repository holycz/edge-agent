const DEFAULT_CONFIG = {
  useContext: true,
  enableDoubleClick: false,
  maxHistoryRounds: 5,
  myName: '',
  otherInfo: '',
  // 注意：API配置已从后端移除，由后端 .env 统一管理
};

// ========== 统一接口参数生成工具 ==========

/**
 * 生成请求流水号：时间戳 + 6位随机数
 * 格式：1738675432101 + 123456
 */
function generateRequestId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `${timestamp}${random}`;
}

/**
 * 生成对话ID：(yyyyMMddHHmmssSSS) + 6位随机数
 * 格式：20250204091532123 + 123456
 */
function generateDialogId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}${ms}${random}`;
}

// ========== 会话与智能体映射管理 ==========
// 每个会话(dialogId)对应一个智能体类型
// 默认智能体：'4' (AI问答智能体)
const AGENT_TYPES = {
  SUMMARIZE_PAGE: 'ac32fe9431b1444f8ac3cdf42901024e',     // 网页总结
  REWRITE: 'bbad433949b64fab8de7f1a26d6ab56c',            // 文本润色
  PROOFREAD: 'a03444b0e45d416fbc0a494b46a2c55b',          // 文本稽核
  CHAT: 'ddf09cedfcbd4d188adc528461a91392',               // AI问答（默认）
  SUMMARIZE_LEADER: '205a099ade6a4c4fb454e11f96ee6a18',  // 公文批示总结
};

// ========== 智能体配置 ==========
const FEATURE_PROMPTS = {
  summarize: { label: '总结', icon: '📝', agentId: 'ac32fe9431b1444f8ac3cdf42901024e' },
  rewrite: { label: '润色改写', icon: '✨', agentId: 'bbad433949b64fab8de7f1a26d6ab56c' },
  proofread: { label: '稽核检查', icon: '🔍', agentId: 'a03444b0e45d416fbc0a494b46a2c55b' },
  summarizePage: { label: '总结该网页', icon: '📄', agentId: 'ac32fe9431b1444f8ac3cdf42901024e' },
  summarizeLeaderComments: { label: '总结领导批示', icon: '👔', agentId: '205a099ade6a4c4fb454e11f96ee6a18' },
  pageRewrite: { label: '网页文本润色', icon: '✨', agentId: 'bbad433949b64fab8de7f1a26d6ab56c' },
  pageProofread: { label: '网页文本稽核', icon: '🔍', agentId: 'a03444b0e45d416fbc0a494b46a2c55b' },
  pageAsk: { label: '网页AI问答', icon: '💬', agentId: 'ddf09cedfcbd4d188adc528461a91392' },
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
let isInThinkBlock = false;

// 流式请求状态
let isStreaming = false;
let currentStreamSessionId = null;

// 文件上传状态
let uploadedFiles = []; // 已上传的文件列表 {fileId, imgUrl, fileName}
let isUploading = false;

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

  createSession(title = '新会话', agentType = AGENT_TYPES.CHAT) {
    const session = {
      id: this.generateId(),
      title: title.substring(0, 50),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pageContext: null,
      dialogId: generateDialogId(),  // 所有会话都有 dialogId，支持连续对话
      agentType: agentType,  // 该会话初始的智能体类型
    };

    sessions.unshift(session);
    currentSessionId = session.id;
    StorageManager.saveSessions();

    console.log('[SessionManager] 创建新会话:', session.id, 'agentType:', agentType, 'dialogId:', session.dialogId);
    return session;
  },

  /**
   * 获取当前会话的 dialogId
   * 所有类型的会话都有自己的 dialogId，支持在对话框内继续对话
   */
  getCurrentDialogId() {
    const session = this.getCurrentSession();
    if (!session) return generateDialogId();  // 无当前会话时生成新的

    // 确保会话有 dialogId
    if (!session.dialogId) {
      session.dialogId = generateDialogId();
      StorageManager.saveSessions();
    }
    return session.dialogId;
  },

  /**
   * 获取/设置会话的智能体类型
   */
  getSessionAgentType(sessionId = null) {
    const session = sessionId ? sessions.find(s => s.id === sessionId) : this.getCurrentSession();
    return session?.agentType || AGENT_TYPES.CHAT;
  },

  setSessionAgentType(sessionId, agentType) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.agentType = agentType;
      // 确保会话有 dialogId（首次对话时使用，后续对话保持）
      if (!session.dialogId) {
        session.dialogId = generateDialogId();
      }
      session.updatedAt = Date.now();
      StorageManager.saveSessions();
    }
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
      console.log('[SessionManager] 切换会话:', sessionId, 'agentType:', session.agentType, 'dialogId:', session.dialogId);
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

  clearAll() {
    sessions = [];
    currentSessionId = null;
    StorageManager.saveSessions();
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
      // 同时设置该会话为AI问答类型
      if (!session.agentType) {
        session.agentType = AGENT_TYPES.CHAT;
      }
      StorageManager.saveSessions();
    }
  },
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
        // 创建新会话（默认AI问答）
        SessionManager.createSession('新会话', AGENT_TYPES.CHAT);
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

      console.log("[Sidepanel] 处理待处理问题，action:", action);
      console.log("[Sidepanel] 问题长度:", question?.length || 0, "字符");
      if (selectedText) {
        console.log("[Sidepanel] 选中文本长度:", selectedText.length, "字符:", selectedText.substring(0, 100) + (selectedText.length > 100 ? "..." : ""));
      }

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
      } else if (action === 'summarizePage' || action === 'summarizeLeaderComments' ||
                 action === 'pageRewrite' || action === 'pageProofread' || action === 'pageAsk') {
        // 页面功能：总结、润色、稽核、AI问答
        await handlePageAction(action);
      } else {
        const feature = FEATURE_PROMPTS[action];
        if (feature) {
          const shortText = selectedText.substring(0, 20) + (selectedText.length > 20 ? '...' : '');
          
          // 创建新会话用于这个操作
          const newSession = SessionManager.createSession(feature.label, feature.agentId);
          
          addMessage('user', `${feature.icon} ${feature.label}：「${shortText}」`);
          conversationHistory.push({ role: 'user', content: `${feature.icon} ${feature.label}：「${shortText}」` });
          SessionManager.saveCurrentSessionMessages();
          renderSessionList();
          
          // 调用智能体，传递 dialogId 以支持在该对话框中继续对话
          await callAgent(feature.agentId, selectedText, false, {}, newSession.dialogId, false);
        }
      }
    }
  } catch (e) {
    console.error("[Sidepanel] 检查待处理问题失败:", e);
  } finally {
    isProcessingPending = false;
  }
}

async function handlePageAction(action) {
  const feature = FEATURE_PROMPTS[action];
  if (!feature) {
    console.error("[Sidepanel] 未知的功能类型:", action);
    return;
  }

  const isQA = action === 'pageAsk';
  const isLeaderSummary = action === 'summarizeLeaderComments';

  updateContextStatus('正在获取网页内容...');
  console.log('[Sidepanel] 处理页面功能:', action);
  // 公文批示总结使用专门的页面内容提取
  const pageContext = isLeaderSummary ? await getApprovalPageContext() : await getCurrentPageContext(true);

  if (!pageContext || !pageContext.content) {
    addMessage('bot', '无法获取当前网页内容，请确保您正在浏览一个可访问的网页。');
    return;
  }

  console.log('[Sidepanel] 成功获取页面内容，长度:', pageContext.content.length, '字符，元信息:', pageContext.metadata);
  updateContextStatus('正在分析...');

  let agentType;
  if (isQA) agentType = AGENT_TYPES.CHAT;
  else if (isLeaderSummary) agentType = AGENT_TYPES.SUMMARIZE_LEADER;
  else if (action === 'pageRewrite') agentType = AGENT_TYPES.REWRITE;
  else if (action === 'pageProofread') agentType = AGENT_TYPES.PROOFREAD;
  else agentType = AGENT_TYPES.SUMMARIZE_PAGE;

  // 清空当前消息界面
  messagesContainer.innerHTML = '';
  conversationHistory = [];

  // 创建新会话
  const newSession = SessionManager.createSession(feature.label, agentType);

  // 保存页面上下文到会话中，供后续对话使用
  newSession.pageContext = pageContext;
  SessionManager.saveCurrentSessionMessages();
  renderSessionList();

  // 添加用户消息到新会话
  addMessage('user', `${feature.icon} ${feature.label}`);
  conversationHistory.push({
    role: 'user',
    content: `${feature.icon} ${feature.label}`
  });
  SessionManager.saveCurrentSessionMessages();

  await callAgent(feature.agentId, pageContext.content, isQA, {
    ...pageContext?.metadata,
  }, newSession.dialogId, false);

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

// ========== 配置管理（已移除后端配置接口，仅使用本地存储） ==========

async function loadConfig() {
  try {
    // 从本地存储加载配置
    const stored = await chrome.storage.sync.get([
      'useContext', 'contextLength', 'enableDoubleClick',
      'maxTotalChars', 'maxHistoryRounds', 'myName', 'otherInfo'
    ]);

    config = {
      ...DEFAULT_CONFIG,
      useContext: stored.useContext ?? DEFAULT_CONFIG.useContext,
      contextLength: stored.contextLength ?? DEFAULT_CONFIG.contextLength,
      maxTotalChars: stored.maxTotalChars ?? DEFAULT_CONFIG.maxTotalChars,
      maxHistoryRounds: stored.maxHistoryRounds ?? DEFAULT_CONFIG.maxHistoryRounds,
      myName: stored.myName ?? DEFAULT_CONFIG.myName,
      otherInfo: stored.otherInfo ?? DEFAULT_CONFIG.otherInfo,
      enableDoubleClick: stored.enableDoubleClick ?? DEFAULT_CONFIG.enableDoubleClick,
    };

    console.log("[Sidepanel] 配置已从本地存储加载");
  } catch (e) {
    console.log("[Sidepanel] 从本地存储加载配置失败，使用默认配置:", e.message);
  }
}

/**
 * 检查后端服务状态
 * @returns {Promise<{available: boolean, message: string}>}
 */
async function checkBackendStatus() {
  // try {
  //   const backendUrl = await getBackendUrl();
  //   const controller = new AbortController();
  //   const timeoutId = setTimeout(() => controller.abort(), 5000);
  //   const response = await fetch(`${backendUrl}/api/health`, { 
  //     method: 'GET',
  //     signal: controller.signal
  //   });
  //   clearTimeout(timeoutId);
  //   if (response.ok) {
  //     return { available: true, message: '后端服务正常' };
  //   }
  //   return { available: false, message: '后端服务响应异常' };
  // } catch (e) {
  //   console.log('[Sidepanel] 后端状态检查失败:', e.message);
  //   return { available: false, message: '无法连接到后端服务，请确认后端已启动' };
  // }
  return { available: true, message: '后端服务正常' };
}

async function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    // 保存到本地存储
    await chrome.storage.sync.set(newConfig);
    console.log("[Sidepanel] 配置已保存到本地存储");
    return true;
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
      console.log("[Sidepanel] 配置已保存并更新到内存");
      showToast('配置已保存');
      closeConfigPanel();
    } else {
      showToast('配置保存失败');
    }
  });

  document.querySelector('.ai-config-reset').addEventListener('click', async () => {
    if (confirm('确定要恢复默认配置吗？')) {
      config = { ...DEFAULT_CONFIG };
      refreshConfigPanel();
      showToast('已恢复默认配置');
    }
  });
}

async function sendMessage() {
  const text = inputTextarea.value.trim();
  if (!text) return;

  inputTextarea.value = '';
  inputTextarea.style.height = 'auto';

  addMessage('user', text);
  console.log('[Sidepanel] 发送用户消息，长度:', text.length, '字符:', text.substring(0, 100) + (text.length > 100 ? "..." : ""));

  // 获取当前会话
  const currentSession = SessionManager.getCurrentSession();
  const dialogId = SessionManager.getCurrentDialogId();
  
  // 判断是否是首次对话（还没有AI回复消息）
  const isFirstMessage = currentSession && !currentSession.messages.some(m => m.role === 'assistant');
  
  // 获取绑定的智能体 - 对话与智能体从创建时就绑定，不随用户后续输入改变
  const agentId = currentSession?.agentType || AGENT_TYPES.CHAT;
  const isQA = agentId === AGENT_TYPES.CHAT;
  
  console.log('[Sidepanel] sendMessage 判断:', {
    isFirstMessage,
    agentType: currentSession?.agentType,
    agentId,
    messageCount: currentSession?.messages?.length,
    hasAssistantMsg: currentSession?.messages?.some(m => m.role === 'assistant')
  });

  // 首次对话时获取页面上下文
  // AI问答智能体：需要页面上下文 + 用户问题
  // 其他智能体（润色/稽核/总结等）：需要页面内容作为输入
  let pageContext = null;
  if (isFirstMessage && config.useContext) {
    pageContext = await getCurrentPageContext();
  }

  // 保存用户消息
  conversationHistory.push({ role: 'user', content: text });
  SessionManager.saveCurrentSessionMessages();

  // 自动生成标题（仅在首次对话时）
  if (currentSession && isFirstMessage) {
    SessionManager.autoGenerateTitle(currentSession.id, text);
    renderSessionList();
  }

  // 调用智能体 - 始终使用会话绑定的智能体
  await callAgent(agentId, pageContext?.content || "", isQA, {
    ...pageContext?.metadata,
    userQuestion: text
  }, dialogId, false, !isFirstMessage);
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
    console.log("[Sidepanel] 使用缓存的网页上下文，长度:", pageContextCache.content?.length || 0, "字符");
    return pageContextCache;
  }

  console.log('[Sidepanel] 开始获取当前页面上下文...');

  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    console.log("[Sidepanel] 获取到最后聚焦窗口ID:", lastFocusedWindow.id);

    const activeTab = lastFocusedWindow.tabs?.find(tab => tab.active);

    if (!activeTab || !activeTab.id) {
      console.log("[Sidepanel] 无法获取当前标签页");
      return null;
    }

    console.log("[Sidepanel] 当前标签页 URL:", activeTab.url, "标题:", activeTab.title);

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
      console.log("[Sidepanel] 从 content.js 获取到原始内容，长度:", content.length, "字符");
      console.log("[Sidepanel] 页面元信息:", response.metadata);

      pageContextCache = {
        content: content,
        metadata: response.metadata || {}
      };

      console.log("[Sidepanel] 页面上下文缓存成功，内容长度:", content.length, "字符");
      return pageContextCache;
    } else {
      console.log("[Sidepanel] 响应为空或没有内容", response);
    }
  } catch (e) {
    console.error("[Sidepanel] 获取网页上下文失败:", e);
  }

  return null;
}

async function getApprovalPageContext() {
  if (!config.useContext) {
    console.log("[Sidepanel] 上下文功能已禁用");
    return null;
  }

  console.log('[Sidepanel] 开始获取公文批示专用页面内容...');

  try {
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    const activeTab = lastFocusedWindow.tabs?.find(tab => tab.active);

    if (!activeTab || !activeTab.id) {
      console.log("[Sidepanel] 无法获取当前标签页");
      return null;
    }

    const excludedPatterns = [
      'chrome://', 'chrome-extension://', 'edge://', 'file://', 'about:', 'data:'
    ];
    if (excludedPatterns.some(pattern => activeTab.url?.startsWith(pattern))) {
      return null;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_APPROVAL_PAGE_CONTENT" });
    } catch (e) {
      console.log("[Sidepanel] Content script 可能未加载，尝试注入...", e.message);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_APPROVAL_PAGE_CONTENT" });
      } catch (injectError) {
        console.error("[Sidepanel] 注入失败:", injectError.message);
        return null;
      }
    }

    if (response && response.content) {
      console.log("[Sidepanel] 获取到公文批示专用内容，长度:", response.content.length, "字符");
      return {
        content: response.content,
        metadata: response.metadata || {}
      };
    } else {
      console.log("[Sidepanel] 未获取到公文批示专用内容，回退到全页面内容");
      return await getCurrentPageContext(true);
    }
  } catch (e) {
    console.error("[Sidepanel] 获取公文批示页面内容失败:", e);
    return null;
  }
}

function clearContextCache() {
  pageContextCache = null;
  console.log("[Sidepanel] 上下文缓存已清空");
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
      console.log("[Sidepanel] 获取到页面存储数据，cookies长度:", pageCookiesCache.cookies.length, "localStorage 条目:", Object.keys(pageCookiesCache.localStorage).length, "sessionStorage 条目:", Object.keys(pageCookiesCache.sessionStorage).length);
      return pageCookiesCache;
    }
  } catch (e) {
    console.warn("[Sidepanel] 获取页面存储数据失败:", e);
  }
  return null;
}

async function refreshContextStatus() {
  updateContextStatus('正在获取上下文...');
  console.log('[Sidepanel] 刷新上下文状态...');
  const context = await getCurrentPageContext(true);
  if (context) {
    console.log('[Sidepanel] 上下文刷新成功，总长度:', context.content?.length || 0, '字符');
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

// ========== 智能体调用函数 ==========

// 调用智能体接口（统一接口格式）
// 参数说明：
// - agentId: 智能体ID ('1', '2', '3', '4', '205a099ade6a4c4fb454e11f96ee6a18')
// - content: 用户输入内容，会作为 keyword 字段发送
// - isQA: 是否为AI问答模式（智能体4）
// - pageMetadata: 页面元信息（仅在AI问答模式下使用，用于构建页面上下文）
// - dialogId: 对话ID（可选，复用当前会话的dialogId）
// - enableThinking: 是否启用思考模式（默认false）
  // - isContinuation: 是否为继续对话（true=后续对话，只发用户问题；false=首次对话，发页面上下文）
async function callAgent(agentId, content, isQA = false, pageMetadata = {}, dialogId = null, enableThinking = false, isContinuation = false) {
  await loadConfig();

  // 检查后端服务状态
  const backendStatus = await checkBackendStatus();
  if (!backendStatus.available) {
    addMessage('bot', `后端服务不可用：${backendStatus.message}`);
    openConfigPanel();
    return;
  }

  // 重置状态
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

  // 生成统一接口参数
  const requestId = generateRequestId();
  // 使用传入的 dialogId，或从当前会话获取，或生成新的
  const currentDialogId = dialogId || SessionManager.getCurrentDialogId();
  
  // 对话与智能体从创建时就绑定，不再根据 isContinuation 切换智能体
  // isContinuation 仅用于确定是否是首次对话（影响 keyword 构建方式）
  const actualAgentId = agentId;

  console.log('[Sidepanel] 智能体调用参数:', {
    agentId: actualAgentId,
    isContinuation,
    isFirstMessage: !isContinuation,
    requestId,
    dialogId: currentDialogId,
    isQA,
    contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
  });

  // 构建请求体 - 所有智能体统一使用 AgentRequest 格式，只发送 keyword
  let keyword;
  const userQuestion = pageMetadata.userQuestion || '';
  
  if (isContinuation) {
    // 后续对话（所有智能体）：只发送用户新问题
    // 后端会根据 dialogId 自动关联历史对话，无需重复发送页面上下文
    keyword = `用户问题: ${userQuestion}`;
  } else if (isQA) {
    // AI问答智能体首次对话：构建包含页面上下文和用户问题的 keyword
    let contextHeader = "";
    if (pageMetadata.title) {
      contextHeader += `页面标题: ${pageMetadata.title}\n`;
    }
    if (pageMetadata.url) {
      contextHeader += `页面地址: ${pageMetadata.url}\n`;
    }
    // 格式化的 keyword，后端会解析出页面上下文保存
    keyword = `--- 页面上下文 ---\n${contextHeader}${content}\n--- 页面上下文结束 ---\n\n用户问题: ${userQuestion}`;
  } else {
    // 其他智能体（领导批示、页面总结等）首次对话：直接把 content 作为 keyword
    // 页面内容已经包含在 content 中
    // 如果 content 为空（未获取到页面上下文），使用用户输入的问题
    keyword = content || userQuestion;
  }

  // 统一请求格式，只发送 question，不发送 messages
  // 对于领导批示总结智能体的首次对话，将个人信息附加到 question 中
  // 后续对话由后端根据 dialogId 关联历史，无需重复传递个人信息
  if (agentId === AGENT_TYPES.SUMMARIZE_LEADER && !isContinuation) {
    const personalInfo = [];
    if (config.myName) personalInfo.push(`我的姓名是${config.myName}`);
    if (config.otherInfo) personalInfo.push(config.otherInfo);
    console.log('[Sidepanel] 领导批示智能体 - 当前配置:', {
      myName: config.myName || '(未设置)',
      otherInfo: config.otherInfo || '(未设置)',
      personalInfoLength: personalInfo.length,
      personalInfoContent: personalInfo
    });
    if (personalInfo.length > 0) {
      // 更清晰的格式，让AI能明确识别用户身份
      const infoPrefix = `【我的身份信息】\n${personalInfo.join('。\n')}\n\n【OA审批页面内容】\n`;
      keyword = infoPrefix + keyword;
      console.log('[Sidepanel] 已添加个人信息到 question，最终question前200字符:', keyword.substring(0, 200));
    }
  }

  // 新接口格式：统一 endpoint，agent_id 和 question 在 data 中
  const requestBody = {
    request_id: requestId,
    dialog_id: currentDialogId,
    agent_id: actualAgentId,
    user_id: actualAgentId,
    question: keyword,
    use_history: "true",
    model_id: "",
    ifInternet: false,
    ifCallback: true,
  };

  // 如果有上传的文件，添加文件引用参数（所有智能体都支持文件上传）
  if (uploadedFiles.length > 0) {
    const fileReferences = uploadedFiles.map(f => ({
      file_id: f.fileId,
      file_name: f.fileName,
      file_size: f.fileSize || 0
    }));
    requestBody.referenced_objects = JSON.stringify({ file: fileReferences });
    requestBody.referenced_object_type = "file";
    requestBody.session_id = actualAgentId;
    requestBody.agent_state = "save";
    console.log('[Sidepanel] 添加文件引用:', uploadedFiles.length, '个文件');
  }

  console.log('[Sidepanel] 调用智能体:', actualAgentId, 'sessionId:', currentStreamSessionId, 'dialogId:', currentDialogId);
  console.log('[Sidepanel] question 长度:', keyword.length, '字符');

  try {
    const requestBodyJson = JSON.stringify(requestBody);
    chrome.runtime.sendMessage({
      type: 'API_STREAM_REQUEST',
      endpoint: '/sxzypt/py_talkHub/agent/agent',  // 新接口：统一路径
      body: requestBodyJson,
      sessionId: currentStreamSessionId,
      dialogId: currentDialogId,
      agentId: actualAgentId,  // 同时传递 agentId 供背景页使用
    });
    console.log('[Sidepanel] 智能体请求已发送，等待响应...');

    // 返回 dialogId，方便后续复用
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
  // 新建会话时清空文件上传状态
  clearFileUploadState();
  // 显示智能体选择弹窗
  showAgentSelectionModal();
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

    // 根据智能体类型显示不同的图标
    let agentIcon = '💬';  // 默认AI问答
    if (session.agentType === AGENT_TYPES.SUMMARIZE_PAGE) agentIcon = '📄';
    else if (session.agentType === AGENT_TYPES.SUMMARIZE_LEADER) agentIcon = '👔';
    else if (session.agentType === AGENT_TYPES.REWRITE) agentIcon = '✨';
    else if (session.agentType === AGENT_TYPES.PROOFREAD) agentIcon = '🔍';

    const title = document.createElement('div');
    title.className = 'ai-session-item-title';
    title.textContent = `${agentIcon} ${session.title || '新会话'}`;
    title.title = `${session.title || '新会话'} [${agentIcon} ${session.agentType === AGENT_TYPES.CHAT ? 'AI问答' : '其他'}]`;

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
  const closeBtn = document.getElementById('ai-session-panel-close');
  const exportBtn = document.getElementById('ai-export-data');
  const importBtn = document.getElementById('ai-import-data');
  const clearAllBtn = document.getElementById('ai-clear-all-data');
  const managePromptsBtn = document.getElementById('ai-manage-prompts');

  if (toggleBtn) {
    console.log('[Sidepanel] 绑定侧边栏切换按钮');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[Sidepanel] 点击了切换按钮');
      toggleSessionPanel();
    });
  } else {
    console.log('[Sidepanel] 未找到切换按钮 ai-toggle-sidebar');
  }

  if (closeBtn) closeBtn.addEventListener('click', toggleSessionPanel);

  // 点击主内容区收起侧边栏（只绑定一次，且优先级较低）
  // 使用 setTimeout 确保在初始化完成后再绑定，避免干扰其他事件
  setTimeout(() => {
    const mainContent = document.querySelector('.ai-main-content');
    if (mainContent) {
      // 检查是否已绑定过，避免重复绑定
      if (!mainContent.dataset.hasClickListener) {
        mainContent.dataset.hasClickListener = 'true';
        mainContent.addEventListener('click', (e) => {
          const sidebar = document.getElementById('ai-sidebar-left');
          // 只检查侧边栏是否展开，不处理其他逻辑
          if (sidebar && !sidebar.classList.contains('collapsed')) {
            // 确保点击的不是侧边栏内部
            if (!sidebar.contains(e.target)) {
              toggleSessionPanel();
            }
          }
        });
      }
    }
  }, 100);

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
        SessionManager.clearAll();
        SessionManager.createSession('新会话', AGENT_TYPES.CHAT);
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
  console.log('[Sidepanel] 渲染快捷提示词栏，共', allPrompts.length, '个提示词');

  allPrompts.forEach(prompt => {
    const chip = document.createElement('button');
    chip.className = 'ai-quick-prompt-chip';
    chip.innerHTML = `${prompt.icon || '💬'} ${prompt.title.replace(/^[💻📝✨🔍🌐🇺🇸🐛📋⚡💡]\s*/, '').substring(0, 4)}`;
    chip.title = prompt.title;
    chip.onclick = () => usePromptInInput(prompt.id);
    container.appendChild(chip);
  });
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

  const enableDoubleClickEl = document.getElementById('ai-enable-double-click');
  if (enableDoubleClickEl) {
    enableDoubleClickEl.checked = config.enableDoubleClick === true;
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
  // 配置热加载功能已移除，仅重新加载本地配置
  await loadConfig();
  refreshConfigPanel();
  showToast('配置已重新加载');
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

// ========== 文件上传功能 ==========

/**
 * 更新上传进度条
 * @param {number} percent - 进度百分比 (0-100)
 * @param {string} status - 状态文本
 * @param {string} statusType - 状态类型 (uploading, success, error)
 */
function updateUploadProgress(percent, status = '', statusType = '') {
  const progressBar = document.getElementById('ai-upload-progress');
  const progressFill = document.getElementById('ai-upload-progress-bar');
  const progressText = document.getElementById('ai-upload-progress-text');
  const statusEl = document.getElementById('ai-upload-status');

  if (progressBar && progressFill && progressText) {
    progressBar.style.display = 'flex';
    progressFill.style.setProperty('--progress', `${percent}%`);
    progressText.textContent = `${Math.round(percent)}%`;

    // 更新进度条动画状态
    if (percent < 100) {
      progressFill.classList.add('uploading');
    } else {
      progressFill.classList.remove('uploading');
    }
  }

  // 更新状态提示
  if (statusEl && status) {
    statusEl.style.display = 'flex';
    statusEl.textContent = status;
    statusEl.className = 'ai-upload-status';
    if (statusType) {
      statusEl.classList.add(statusType);
    }
  }
}

/**
 * 隐藏上传进度条
 */
function hideUploadProgress() {
  const progressBar = document.getElementById('ai-upload-progress');
  const statusEl = document.getElementById('ai-upload-status');

  if (progressBar) {
    progressBar.style.display = 'none';
  }
  if (statusEl) {
    statusEl.style.display = 'none';
  }
}

/**
 * 处理文件选择
 */
async function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  // 只支持单文件上传（根据接口说明）
  const file = files[0];

  // 检查文件大小（限制 50MB）
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('文件大小超过50MB限制');
    event.target.value = '';
    return;
  }

  // 显示文件预览（先显示文件名，等待上传完成）
  showFilePreview(file.name, false);

  // 开始上传
  isUploading = true;
  updateUploadButtonState();
  updateUploadProgress(0, '准备上传...', 'uploading');

  try {
    const result = await uploadFileToServer(file);
    if (result && result.success && result.files && result.files.length > 0) {
      const uploadedFile = result.files[0];
      uploadedFiles = [{
        fileId: uploadedFile.fileId,
        fileName: file.name
      }];
      updateUploadProgress(100, '上传完成！', 'success');
      showFilePreview(file.name, true);  // 更新为已上传状态
      showToast('文件上传成功');
      console.log('[Sidepanel] 文件上传成功:', uploadedFile);

      // 3秒后隐藏进度条
      setTimeout(hideUploadProgress, 3000);
    } else {
      // 后端返回的 message 可能已包含"文件上传失败"前缀，避免重复
      let errorMsg = result?.message || '未知错误';
      if (errorMsg.startsWith('文件上传失败: ')) {
        errorMsg = errorMsg.replace('文件上传失败: ', '');
      }
      updateUploadProgress(0, '上传失败: ' + errorMsg, 'error');
      hideFilePreview();
      showToast('文件上传失败: ' + errorMsg);
    }
  } catch (error) {
    console.error('[Sidepanel] 文件上传失败:', error);
    updateUploadProgress(0, '上传失败: ' + error.message, 'error');
    hideFilePreview();
    showToast('文件上传失败: ' + error.message);
  } finally {
    isUploading = false;
    updateUploadButtonState();
    event.target.value = ''; // 清空input以便可以重新选择同一文件
  }
}

/**
 * 上传文件到后端服务器
 * @param {File} file - 要上传的文件
 * @param {string} agentId - 目标智能体ID（可选，默认使用当前会话绑定的智能体）
 */
async function uploadFileToServer(file, agentId = null) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    
    // 如果没有指定agentId，使用当前会话绑定的智能体
    if (!agentId) {
      const currentSession = SessionManager.getCurrentSession();
      agentId = currentSession?.agentType || AGENT_TYPES.CHAT;
    }
    
    console.log('[Sidepanel] 上传文件到智能体:', agentId);

    // 使用 FileReader 读取文件为 ArrayBuffer
    const reader = new FileReader();

    // 进度模拟：分三个阶段
    // 阶段1：文件读取（0-30%）
    // 阶段2：数据发送到后端（30-70%）
    // 阶段3：后端处理（70-99%）直到收到响应
    let progressInterval = setInterval(() => {
      const currentProgress = parseFloat(document.getElementById('ai-upload-progress-bar')?.style.getPropertyValue('--progress') || 0);
      let newProgress = currentProgress;
      let statusText = '正在上传...';

      if (currentProgress < 30) {
        // 阶段1：文件读取中，较快
        newProgress = Math.min(currentProgress + Math.random() * 8 + 3, 30);
      } else if (currentProgress < 70) {
        // 阶段2：数据传输中
        newProgress = Math.min(currentProgress + Math.random() * 5 + 2, 70);
        statusText = '正在传输...';
      } else if (currentProgress < 99) {
        // 阶段3：服务器处理中，缓慢增加
        newProgress = Math.min(currentProgress + 0.5, 99);
        statusText = '服务器处理中...';
      }

      updateUploadProgress(newProgress, statusText, 'uploading');
    }, 200);

    reader.onload = function(e) {
      // 文件读取完成，进入传输阶段
      updateUploadProgress(30, '正在传输...', 'uploading');

      const arrayBuffer = e.target.result;

      // 发送消息给 background.js 进行上传
      chrome.runtime.sendMessage({
        type: 'UPLOAD_FILE',
        requestId: requestId,
        agentId: agentId,
        dialogId: SessionManager.getCurrentDialogId(),
        fileName: file.name,
        fileType: file.type,
        fileData: Array.from(new Uint8Array(arrayBuffer))
      }, (response) => {
        clearInterval(progressInterval);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.success) {
          resolve({
            success: true,
            files: response.files
          });
        } else {
          reject(new Error(response?.error || '上传失败'));
        }
      });
    };

    reader.onprogress = function(e) {
      // 如果有进度事件，更新进度（但FileReader通常只在结束时触发一次）
      if (e.lengthComputable) {
        const fileReadPercent = (e.loaded / e.total) * 30;
        updateUploadProgress(fileReadPercent, '正在读取文件...', 'uploading');
      }
    };

    reader.onerror = function() {
      clearInterval(progressInterval);
      reject(new Error('文件读取失败'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * 显示文件预览
 * @param {string} fileName - 文件名
 * @param {boolean} uploaded - 是否已上传完成（可选，默认false）
 */
function showFilePreview(fileName, uploaded = false) {
  const previewEl = document.getElementById('ai-file-preview');
  const nameEl = document.getElementById('ai-file-name');

  if (previewEl && nameEl) {
    nameEl.textContent = fileName;
    previewEl.style.display = 'block';
  }

  // 禁用上传按钮（上传中或已上传都禁用）
  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    if (uploaded) {
      uploadBtn.title = '已上传文件，点击×移除后可重新上传';
    } else {
      uploadBtn.title = '正在上传中...';
    }
  }
}

/**
 * 隐藏文件预览区域
 */
function hideFilePreview() {
  const previewEl = document.getElementById('ai-file-preview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }

  // 启用上传按钮
  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.title = '上传文件';
  }
}

/**
 * 移除已上传的文件
 */
function removeUploadedFile() {
  uploadedFiles = [];

  const previewEl = document.getElementById('ai-file-preview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }

  // 启用上传按钮
  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.title = '上传文件';
  }

  showToast('已移除文件');
}

/**
 * 更新上传按钮状态
 */
function updateUploadButtonState() {
  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = isUploading || uploadedFiles.length > 0;
    if (isUploading) {
      uploadBtn.innerHTML = '⏳';
    } else {
      uploadBtn.innerHTML = '📎';
    }
  }
}

/**
 * 清空文件上传状态（新建会话时调用）
 */
function clearFileUploadState() {
  uploadedFiles = [];
  isUploading = false;

  const previewEl = document.getElementById('ai-file-preview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }

  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '📎';
    uploadBtn.title = '上传文件';
  }

  const fileInput = document.getElementById('ai-file-input');
  if (fileInput) {
    fileInput.value = '';
  }
}

// ========== 智能体选择弹窗功能 ==========

/**
 * 显示智能体选择弹窗
 */
function showAgentSelectionModal() {
  const modal = document.getElementById('ai-agent-modal');
  if (!modal) return;

  modal.style.display = 'flex';

  // 绑定智能体选择事件
  const agentItems = modal.querySelectorAll('.ai-agent-item');
  agentItems.forEach(item => {
    item.onclick = () => {
      const agentId = item.dataset.agent;
      selectAgentAndCreateSession(agentId);
      closeAgentSelectionModal();
    };
  });

  // 绑定关闭按钮
  const closeBtn = modal.querySelector('.ai-agent-modal-close');
  if (closeBtn) {
    closeBtn.onclick = closeAgentSelectionModal;
  }

  // 点击背景关闭
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeAgentSelectionModal();
    }
  };
}

/**
 * 关闭智能体选择弹窗
 */
function closeAgentSelectionModal() {
  const modal = document.getElementById('ai-agent-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 选择智能体并创建会话
 */
function selectAgentAndCreateSession(agentId) {
  // 清空消息区域
  messagesContainer.innerHTML = '';
  clearContextCache();
  conversationHistory = [];
  clearFileUploadState();

  // 根据智能体ID确定标题
  let title = '新会话';
  let agentType = AGENT_TYPES.CHAT;
  let toastMsg = 'AI问答';

  switch (agentId) {
    case 'ddf09cedfcbd4d188adc528461a91392':
      title = 'AI问答会话';
      agentType = AGENT_TYPES.CHAT;
      toastMsg = 'AI问答';
      break;
    case 'bbad433949b64fab8de7f1a26d6ab56c':
      title = '文本润色会话';
      agentType = AGENT_TYPES.REWRITE;
      toastMsg = '文本润色';
      break;
    case 'a03444b0e45d416fbc0a494b46a2c55b':
      title = '文本稽核会话';
      agentType = AGENT_TYPES.PROOFREAD;
      toastMsg = '文本稽核';
      break;
  }

  // 创建新会话
  SessionManager.createSession(title, agentType);
  renderSessionList();
  console.log(`[Sidepanel] 已创建新${toastMsg}会话`);
  showToast(`已新建${toastMsg}对话`);
}

init();
