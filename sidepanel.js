// 默认配置
const DEFAULT_CONFIG = {
  apiKey: "",
  apiUrl: "https://integrate.api.nvidia.com/v1",
  model: "qwen/qwen3-next-80b-a3b-instruct",
  temperature: 0.7,
  maxTokens: 2048,
  useContext: true, // 默认启用网页上下文
  contextLength: 5000, // 上下文最大字符数
  enableDoubleClick: false // 默认关闭双击唤醒
};

let config = { ...DEFAULT_CONFIG };
let currentBotBubble = null;
let currentThinkBubble = null;
let currentThinkContainer = null;
let accumulatedText = "";
let accumulatedThinkText = "";
let isProcessingPending = false;
let pageContextCache = null;
let isInThinkBlock = false;
let conversationHistory = []; // 存储对话历史

// DOM 元素
const messagesContainer = document.getElementById('ai-messages');
const inputTextarea = document.getElementById('ai-input');
const sendButton = document.getElementById('ai-send');
const configPanel = document.getElementById('ai-config-panel');

// 初始化
async function init() {
  try {
    await loadConfig();
    initMarkdownParser();
    setupEventListeners();
    
    // 检查是否有待处理的提问（从右键菜单触发）
    console.log("[Sidepanel] 初始化完成，检查待处理问题...");
    await checkPendingQuestion();
    
    // 监听 storage 变化，防止打开时还没设置好
    chrome.storage.onChanged.addListener(handleStorageChange);
  } catch (e) {
    console.error("[Sidepanel] 初始化失败:", e);
  }
}

// 处理 storage 变化
function handleStorageChange(changes, namespace) {
  if (namespace === 'session' && (changes.pendingQuestion?.newValue || changes.pendingAction?.newValue)) {
    console.log("[Sidepanel] 检测到待处理数据变化");
    checkPendingQuestion();
  }
  
  // 监听配置变化，实时更新 config
  if (namespace === 'sync' && changes.aiConfig) {
    console.log("[Sidepanel] 检测到配置变化，重新加载配置");
    config = { ...DEFAULT_CONFIG, ...changes.aiConfig.newValue };
    console.log("[Sidepanel] 配置已更新:", { 
      apiUrl: config.apiUrl, 
      model: config.model,
      apiKey: config.apiKey ? '已设置' : '未设置'
    });
  }
}

// 检查并处理待处理问题
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
      
      // 清除存储的数据
      await chrome.storage.session.remove(['pendingQuestion', 'pendingAction', 'pendingSelectedText']);
      
      console.log("[Sidepanel] 处理待处理问题:", question, "动作:", action);
      
      // 根据动作类型处理
      if (action === 'ask') {
        // AI问答：直接填入输入框并引用划词内容
        if (selectedText) {
          inputTextarea.value = `请回答关于这段文字的问题：\n\n「${selectedText}」\n\n`;
          inputTextarea.focus();
          // 自动调整高度
          inputTextarea.style.height = 'auto';
          inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
          // 将光标移到末尾
          inputTextarea.setSelectionRange(inputTextarea.value.length, inputTextarea.value.length);
        }
      } else {
        // 总结、改写、稽核：直接发送请求
        const userPrompt = action === 'summarize' ? '请总结以下内容' : 
                          action === 'rewrite' ? '请润色改写以下内容' : '请稽核检查以下内容';
        addMessage('user', userPrompt);
        addMessage('user', `「${selectedText}」`);
        
        // 保存到历史
        conversationHistory.push({ 
          role: 'user', 
          content: `${userPrompt}:\n\n${selectedText}` 
        });
        
        await askAI(question);
      }
    }
  } catch (e) {
    console.error("[Sidepanel] 检查待处理问题失败:", e);
  } finally {
    isProcessingPending = false;
  }
}

// 初始化 Markdown 解析器
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

// 加载配置
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get("aiConfig");
    console.log("[Sidepanel] 从 storage 读取的原始配置:", result);
    if (result.aiConfig) {
      config = { ...DEFAULT_CONFIG, ...result.aiConfig };
      console.log("[Sidepanel] 加载配置成功，合并后配置:", config);
    } else {
      console.log("[Sidepanel] 未找到已保存的配置，使用默认配置:", config);
    }
  } catch (e) {
    console.error("[Sidepanel] 加载配置失败:", e);
  }
}

// 保存配置
async function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    await chrome.storage.sync.set({ aiConfig: config });
    console.log("[Sidepanel] 配置已保存到 storage:", config);
    return true;
  } catch (e) {
    console.error("[Sidepanel] 保存配置失败:", e);
    return false;
  }
}

// 设置事件监听
function setupEventListeners() {
  // 发送按钮
  sendButton.addEventListener('click', sendMessage);
  
  // 输入框回车发送
  inputTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // 输入框自动调整高度
  inputTextarea.addEventListener('input', () => {
    inputTextarea.style.height = 'auto';
    inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
  });
  
  // 新建对话
  document.querySelector('.ai-new-chat').addEventListener('click', clearMessages);
  
  // 设置按钮
  document.querySelector('.ai-config-btn').addEventListener('click', openConfigPanel);
  
  // 关闭设置
  document.querySelector('.ai-config-close').addEventListener('click', closeConfigPanel);
  
  // 保存设置
  document.querySelector('.ai-config-save').addEventListener('click', async () => {
    const contextLengthInput = parseInt(document.getElementById('ai-context-length').value);
    const newConfig = {
      apiKey: document.getElementById('ai-api-key').value.trim(),
      apiUrl: document.getElementById('ai-api-url').value.trim() || DEFAULT_CONFIG.apiUrl,
      model: document.getElementById('ai-model').value.trim() || DEFAULT_CONFIG.model,
      temperature: parseFloat(document.getElementById('ai-temperature').value) || DEFAULT_CONFIG.temperature,
      maxTokens: parseInt(document.getElementById('ai-max-tokens').value) || DEFAULT_CONFIG.maxTokens,
      useContext: document.getElementById('ai-use-context').checked,
      contextLength: contextLengthInput >= 1000 ? contextLengthInput : DEFAULT_CONFIG.contextLength,
      enableDoubleClick: document.getElementById('ai-enable-double-click').checked
    };

    console.log("[Sidepanel] 准备保存配置，新配置值:", newConfig);
    console.log("[Sidepanel] 从输入框读取的 apiKey:", document.getElementById('ai-api-key').value.trim());
    console.log("[Sidepanel] 从输入框读取的 apiUrl:", document.getElementById('ai-api-url').value.trim());
    console.log("[Sidepanel] 从输入框读取的 model:", document.getElementById('ai-model').value.trim());

    // 同步双击设置到 storage
    await chrome.storage.sync.set({ enableDoubleClick: newConfig.enableDoubleClick });

    if (await saveConfig(newConfig)) {
      // 确保内存中的 config 也立即更新
      config = { ...config, ...newConfig };
      console.log("[Sidepanel] 配置已保存并更新到内存:", config);
      showToast('配置已保存');
      closeConfigPanel();
    }
  });
  
  // 恢复默认
  document.querySelector('.ai-config-reset').addEventListener('click', async () => {
    if (confirm('确定要恢复默认配置吗？')) {
      config = { ...DEFAULT_CONFIG };
      await chrome.storage.sync.remove('aiConfig');
      refreshConfigPanel();
      showToast('已恢复默认配置');
    }
  });
  
  // 刷新上下文按钮（设置面板）
  document.querySelector('.ai-refresh-context').addEventListener('click', async () => {
    await handleRefreshContext();
  });

  // 刷新上下文按钮（底部状态栏迷你按钮）
  const miniRefreshBtn = document.querySelector('.ai-refresh-context-mini');
  if (miniRefreshBtn) {
    miniRefreshBtn.addEventListener('click', async () => {
      await handleRefreshContext();
    });
  }
  
}

// 发送消息
async function sendMessage() {
  const text = inputTextarea.value.trim();
  if (!text) return;
  
  inputTextarea.value = '';
  inputTextarea.style.height = 'auto';
  
  addMessage('user', text);
  
  // 保存用户消息到历史
  conversationHistory.push({ role: 'user', content: text });
  
  await askAI(text);
}

// 添加消息
function addMessage(role, text) {
  const row = document.createElement('div');
  row.className = `ai-msg-row ai-${role}-row`;
  
  // 头像
  const avatar = document.createElement('div');
  avatar.className = `ai-avatar ai-${role}-avatar`;
  avatar.textContent = role === 'user' ? '👤' : '🤖';
  
  // 内容容器
  const content = document.createElement('div');
  content.className = 'ai-msg-content';
  
  if (role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = `ai-msg ai-${role}`;
    bubble.textContent = text;
    content.appendChild(bubble);
  } else {
    if (text === '思考中...') {
      const bubble = document.createElement('div');
      bubble.className = `ai-msg ai-${role}`;
      bubble.innerHTML = `
        <div class="ai-typing">
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
        </div>
      `;
      content.appendChild(bubble);
    }
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

// 创建 think 区块
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
  
  // 点击头部切换折叠
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

// 折叠 think 容器
function collapseThinkBubble(thinkContainer) {
  if (thinkContainer) {
    thinkContainer.classList.add('collapsed');
    const toggle = thinkContainer.querySelector('.ai-think-toggle');
    if (toggle) {
      toggle.textContent = '▶';
    }
  }
}

// 创建普通内容区块
function createContentBubble(contentContainer) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg ai-bot';
  contentContainer.appendChild(bubble);
  return bubble;
}

// 解析 Markdown
function parseMarkdown(text) {
  if (!text) return '';
  
  if (typeof marked !== 'undefined') {
    try {
      return marked.parse(text);
    } catch (e) {
      console.log('Marked parsing failed:', e);
    }
  }
  
  // 降级处理
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// 获取当前标签页的上下文
async function getCurrentPageContext(forceRefresh = false) {
  if (!config.useContext) {
    console.log("[Sidepanel] 上下文功能已禁用");
    return null;
  }

  // 如果不是强制刷新且缓存存在，直接返回缓存
  if (!forceRefresh && pageContextCache) {
    console.log("[Sidepanel] 使用缓存的网页上下文");
    return pageContextCache;
  }

  try {
    // 获取最后聚焦的窗口（即用户正在浏览的网页窗口）
    const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: true });
    console.log("[Sidepanel] 最后聚焦窗口ID:", lastFocusedWindow.id);

    // 找到激活的标签页
    const activeTab = lastFocusedWindow.tabs?.find(tab => tab.active);

    if (!activeTab || !activeTab.id) {
      console.log("[Sidepanel] 无法获取当前标签页");
      return null;
    }

    console.log("[Sidepanel] 当前标签页:", activeTab.url);

    // 排除特殊页面
    const excludedPatterns = [
      'chrome://', 'chrome-extension://', 'edge://', 'file://', 'about:', 'data:'
    ];
    if (excludedPatterns.some(pattern => activeTab.url?.startsWith(pattern))) {
      console.log("[Sidepanel] 特殊页面不提供上下文:", activeTab.url);
      return null;
    }

    // 先尝试发送消息，如果失败则注入content script
    let response;
    try {
      response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_CONTEXT" });
    } catch (e) {
      console.log("[Sidepanel] Content script 可能未加载，尝试注入...", e.message);

      try {
        // 注入content script
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        });
        console.log("[Sidepanel] Content script 注入成功");

        // 等待一小段时间让脚本初始化
        await new Promise(resolve => setTimeout(resolve, 200));

        // 再次尝试发送消息
        response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_CONTEXT" });
      } catch (injectError) {
        console.error("[Sidepanel] 注入失败:", injectError.message);
        return null;
      }
    }

    if (response && response.content) {
      // 截断内容到限制长度
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

// 清空上下文缓存
function clearContextCache() {
  pageContextCache = null;
  console.log("[Sidepanel] 上下文缓存已清空");
}

// 刷新上下文状态（自动获取新内容并更新状态栏）
async function refreshContextStatus() {
  updateContextStatus('正在获取上下文...');
  const context = await getCurrentPageContext(true); // 强制刷新
  if (context) {
    const statusText = buildContextStatusText(context);
    updateContextStatus(statusText);
    console.log("[Sidepanel] 状态栏已更新:", statusText);
  } else {
    updateContextStatus('无法获取当前页面上下文');
  }
}

// 构建上下文状态文本
function buildContextStatusText(context) {
  if (!context || !context.content) {
    return '无法获取上下文';
  }
  
  let parts = [];
  const content = context.content;
  const metadata = context.metadata || {};

  // 显示内容总长度
  parts.push(`总长度: ${content.length} 字符`);

  // 检测是否有弹窗
  if (content.includes('=== 当前弹窗/模态框内容 ===')) {
    const modalMatch = content.match(/--- 弹窗 \d+ \[(\w+)\] ---/g);
    if (modalMatch) {
      parts.push(`发现 ${modalMatch.length} 个弹窗`);
    }

    // 检测是否有 Tab
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

    // 检测是否有 Steps
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

  // 显示页面标题
  if (metadata.title) {
    parts.push(`页面: ${metadata.title.substring(0, 30)}${metadata.title.length > 30 ? '...' : ''}`);
  }

  return parts.join(' | ');
}

// 更新上下文状态显示
function updateContextStatus(status) {
  // 更新设置面板中的状态
  const statusEl = document.getElementById('ai-context-status');
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = 'context-status ' + (status.includes('总长度') ? 'has-context' : '');
  }
  
  // 更新输入框附近的状态栏
  const infoEl = document.getElementById('ai-context-info');
  if (infoEl) {
    infoEl.textContent = status;
    infoEl.className = 'context-info ' + (status.includes('总长度') ? 'has-context' : '');
  }
}

// 构建带上下文的提示词
function buildPromptWithContext(userQuestion, context) {
  if (!context || !context.content) {
    return userQuestion;
  }
  
  const { content, metadata } = context;
  let contextHeader = "";
  
  if (metadata.title) {
    contextHeader += `页面标题: ${metadata.title}\n`;
  }
  if (metadata.url) {
    contextHeader += `页面地址: ${metadata.url}\n`;
  }
  
  // 检测内容中是否包含弹窗信息
  const hasModalContent = content.includes('=== 当前弹窗/模态框内容 ===');
  
  let promptInstructions;
  if (hasModalContent) {
    promptInstructions = `请优先基于弹窗/模态框内容回答，如果弹窗内容不足以回答，再参考页面主体内容。如果内容完全无关，请告知用户。`;
  } else {
    promptInstructions = `请基于上述网页内容回答，如果内容与问题无关，请告知用户。`;
  }
  
  const prompt = `以下是一篇网页的内容，请基于这些内容回答用户的问题：

--- 网页内容 ---
${contextHeader}
${content}
--- 内容结束 ---

用户问题: ${userQuestion}

${promptInstructions}`;

  return prompt;
}

// 询问 AI
async function askAI(text, context = null) {
  // 重新加载配置，确保使用最新的配置
  await loadConfig();
  
  console.log("[Sidepanel] askAI 被调用，当前配置:", { 
    apiUrl: config.apiUrl, 
    model: config.model, 
    apiKey: config.apiKey ? '已设置(' + config.apiKey.substring(0, 10) + '...)' : '未设置',
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    historyLength: conversationHistory.length
  });
  
  if (!config.apiKey) {
    addMessage('bot', '请先点击面板右上角的 ⚙️ 设置 API Key');
    openConfigPanel();
    return;
  }
  
  currentBotBubble = null;
  currentThinkBubble = null;
  currentThinkContainer = null;
  accumulatedText = '';
  accumulatedThinkText = '';
  isInThinkBlock = false;
  
  // 如果没有传入上下文，尝试获取
  let pageContext = context;
  if (config.useContext && !pageContext) {
    pageContext = await getCurrentPageContext();
  }
  
  // 构建消息列表（包含历史对话）
  const messages = [];
  
  // 添加系统提示（如果有网页上下文）
  if (pageContext) {
    const { content, metadata } = pageContext;
    let contextHeader = "";
    if (metadata.title) contextHeader += `页面标题: ${metadata.title}\n`;
    if (metadata.url) contextHeader += `页面地址: ${metadata.url}\n`;
    
    const hasModalContent = content.includes('=== 当前弹窗/模态框内容 ===');
    const promptInstructions = hasModalContent 
      ? "请优先基于弹窗/模态框内容回答，如果弹窗内容不足以回答，再参考页面主体内容。如果内容完全无关，请告知用户。"
      : "请基于上述网页内容回答，如果内容与问题无关，请告知用户。";
    
    messages.push({
      role: 'system',
      content: `以下是一篇网页的内容，用户的提问可能基于这些内容：

--- 网页内容 ---
${contextHeader}
${content}
--- 内容结束 ---

${promptInstructions}`
    });
  }
  
  // 添加历史对话（限制最近 10 轮）
  const maxHistory = 10;
  const recentHistory = conversationHistory.slice(-maxHistory * 2); // 每轮包含 user 和 assistant
  messages.push(...recentHistory);
  
  // 添加当前问题
  messages.push({ role: 'user', content: text });
  
  console.log("[Sidepanel] 发送请求，消息数量:", messages.length, "历史轮数:", conversationHistory.length / 2);
  
  const requestBody = {
    model: config.model,
    messages: messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true
  };
  
  // 根据 think 复选框状态决定是否禁用 thinking
  const enableThinkCheckbox = document.getElementById('ai-enable-think');
  if (enableThinkCheckbox && !enableThinkCheckbox.checked) {
    requestBody.chat_template_kwargs = {
      enable_thinking: false
    };
  }
  
  // One API 可能需要的一些额外参数
  const apiUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
  const fullUrl = apiUrl + '/chat/completions';
  
  console.log("[Sidepanel] 请求 URL:", fullUrl);
  console.log("[Sidepanel] 请求体:", JSON.stringify(requestBody, null, 2));
  
  // One API 支持两种认证方式: Bearer Token 或直接使用 API Key
  // 尝试不使用 Bearer 前缀
  const authHeader = config.apiKey.startsWith('Bearer ') || config.apiKey.startsWith('sk-') 
    ? config.apiKey 
    : config.apiKey;
  
  console.log("[Sidepanel] 请求头 Authorization:", authHeader.substring(0, 15) + '...');
  
  try {
    chrome.runtime.sendMessage({
      type: 'API_STREAM_REQUEST',
      url: fullUrl,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
          'Authorization': authHeader
        },
        body: JSON.stringify(requestBody)
      }
    });
  } catch (e) {
    currentBotBubble.innerHTML = '出错：' + e.message;
    currentBotBubble = null;
  }
}

// 监听流式响应和页面变化
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_CONTENT_CHANGED') {
    console.log("[Sidepanel] 收到页面变化通知:", msg.url);
    // 清空缓存
    clearContextCache();
    // 立即获取新内容并更新状态栏
    refreshContextStatus();
    return;
  }
  
  if (msg.type === 'STREAM_CHUNK') {
    const { content, contentType } = msg;
    
    if (contentType === 'think_start') {
      // 开始 think 块，创建消息行但不创建具体内容
      if (!currentBotBubble) {
        const msgElements = addMessage('bot', '');
        currentBotBubble = msgElements;
      }
      isInThinkBlock = true;
      
    } else if (contentType === 'think') {
      // think 内容
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
      // think 块结束，自动折叠
      isInThinkBlock = false;
      if (currentThinkContainer) {
        collapseThinkBubble(currentThinkContainer);
      }
      currentThinkBubble = null;
      currentThinkContainer = null;
      
    } else if (contentType === 'content') {
      // 普通内容
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
    
  } else if (msg.type === 'STREAM_DONE') {
    // 保存 AI 回复到历史（包含思考过程和普通内容）
    const fullResponse = accumulatedThinkText 
      ? `<think>\n${accumulatedThinkText}\n</think>\n\n${accumulatedText}`
      : accumulatedText;
    if (fullResponse.trim()) {
      conversationHistory.push({ role: 'assistant', content: fullResponse });
      console.log("[Sidepanel] 已保存回复到历史，当前历史长度:", conversationHistory.length);
    }
    
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
    currentBotBubble = null;
    currentThinkBubble = null;
    currentThinkContainer = null;
    accumulatedText = '';
    accumulatedThinkText = '';
    isInThinkBlock = false;
  }
});

// 清空对话
function clearMessages() {
  messagesContainer.innerHTML = '';
  clearContextCache(); // 清空对话时同时清空上下文缓存
  conversationHistory = []; // 清空对话历史
  console.log("[Sidepanel] 已清空对话和历史记录");
  showToast('已新建对话');
}

// 打开设置面板
function openConfigPanel() {
  refreshConfigPanel();
  configPanel.style.display = 'flex';
}

// 关闭设置面板
function closeConfigPanel() {
  configPanel.style.display = 'none';
}

// 刷新设置面板
function refreshConfigPanel() {
  console.log("[Sidepanel] 刷新设置面板，当前 config:", config);
  document.getElementById('ai-api-key').value = config.apiKey || '';
  document.getElementById('ai-api-url').value = config.apiUrl || '';
  document.getElementById('ai-model').value = config.model || '';
  document.getElementById('ai-temperature').value = config.temperature || 0.7;
  document.getElementById('ai-max-tokens').value = config.maxTokens || 2048;
  document.getElementById('ai-use-context').checked = config.useContext !== false;
  document.getElementById('ai-context-length').value = config.contextLength || DEFAULT_CONFIG.contextLength;
  document.getElementById('ai-enable-double-click').checked = config.enableDoubleClick === true;
  console.log("[Sidepanel] 设置面板已刷新，apiUrl:", document.getElementById('ai-api-url').value);
}

// 显示提示
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'ai-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// 处理刷新上下文
async function handleRefreshContext() {
  clearContextCache();
  updateContextStatus('正在获取上下文...');
  const context = await getCurrentPageContext(true); // 强制刷新
  if (context) {
    const statusText = buildContextStatusText(context);
    updateContextStatus(statusText);
    showToast(`已刷新上下文（${context.content.length}字符）`);
  } else {
    updateContextStatus('无法获取当前页面上下文');
    showToast('无法获取当前页面上下文');
  }
}

// 启动
init();