// 默认配置
const DEFAULT_CONFIG = {
  apiKey: "",
  apiUrl: "https://integrate.api.nvidia.com/v1",
  model: "qwen/qwen3-next-80b-a3b-instruct",
  temperature: 0.7,
  maxTokens: 2048,
  useContext: true, // 默认启用网页上下文
  contextLength: 8000, // 上下文最大字符数（增加到8000，但会受maxTotalChars限制）
  enableDoubleClick: false, // 默认关闭双击唤醒
  maxTotalChars: 25000, // 单次请求总字符数上限
  maxHistoryRounds: 5, // 最大保留的对话轮数
  // 个人身份配置
  myName: "", // 用户自己的姓名
  otherInfo: "" // 其他信息（可包含领导、部门等信息）
};

// 功能提示词模板
const FEATURE_PROMPTS = {
  summarize: {
    label: '总结',
    icon: '📝',
    systemPrompt: `你是一位专业的内容总结专家。请对用户提供的文本进行深度总结，要求：

1. **核心要点提炼**：提取文本的主要观点、关键结论和重要信息
2. **结构化呈现**：使用清晰的层次结构（如要点列表、层级标题）
3. **保留关键细节**：保留重要的数据、时间、人名、地点等关键信息
4. **逻辑清晰**：确保总结内容逻辑连贯，易于理解
5. **简洁准确**：在不丢失重要信息的前提下，尽可能精简表达

请用中文输出，采用 Markdown 格式，包含：
- 一句话概括（放在最前面，加粗显示）
- 核心要点（3-5个 bullet points）
- 详细总结（如有必要）

原始文本如下：`,
    userDisplay: (text) => `「${text.substring(0, 30)}${text.length > 30 ? '...' : ''}」`
  },

  rewrite: {
    label: '润色改写',
    icon: '✨',
    systemPrompt: `你是一位资深的文字编辑和写作专家。请对用户提供的文本进行润色改写，要求：

1. **保持原意**：确保改写后的文本与原意完全一致，不增删核心信息
2. **优化表达**：
   - 提升语言流畅度，消除生硬表达
   - 优化句式结构，使阅读更顺畅
   - 替换平淡词汇，使用更准确、生动的表达
   - 统一语气和风格，保持专业性
3. **修正错误**：
   - 修正语法错误
   - 修正标点符号使用
   - 修正错别字
   - 优化语序和逻辑
4. **格式优化**：
   - 合理分段
   - 优化标点使用
   - 保持适当的段落长度

请输出改写后的完整文本，并在最后简要说明主要改进点（用列表形式）。

原始文本如下：`,
    userDisplay: (text) => `「${text.substring(0, 30)}${text.length > 30 ? '...' : ''}」`
  },

  proofread: {
    label: '稽核检查',
    icon: '🔍',
    systemPrompt: `你是一位严谨的文字校对专家。请对用户提供的文本进行全面稽核检查，要求：

1. **错别字检查**：找出并标出所有错别字、错用字、形近字错误
2. **语句通顺性**：
   - 检查语法错误
   - 检查语序不当
   - 检查成分残缺或赘余
   - 检查搭配不当
   - 检查逻辑不通之处
3. **标点符号**：
   - 检查标点使用是否正确
   - 检查是否有遗漏或多余标点
4. **专业术语**：检查专业词汇使用是否准确
5. **格式规范**：检查格式是否统一、规范

请按以下格式输出检查结果：

**检查结果概览**：总体评价（如"存在 X 处问题，整体质量良好/一般/较差"）

**问题详情**：
1. 【类型】原文："XXX" → 建议："XXX"（说明：...）
2. ...

**修改建议版本**：给出修改后的完整文本

原始文本如下：`,
    userDisplay: (text) => `「${text.substring(0, 30)}${text.length > 30 ? '...' : ''}」`
  },

  summarizePage: {
    label: '总结该网页',
    icon: '📄',
    systemPrompt: `你是一位专业的网页内容总结专家。请基于当前网页的全部内容进行深度总结，要求：

1. **页面主旨提炼**：用一句话概括页面核心内容
2. **关键信息提取**：提取页面中的重要信息，包括但不限于：
   - 表单/申请的核心内容
   - 审批流程和状态
   - 关键数据和时间节点
   - 重要审批意见
3. **结构化呈现**：使用清晰的层次结构展示信息
4. **突出重点**：标记出需要特别关注的内容
5. **简洁明了**：避免冗余，保留核心信息

请用中文输出，采用 Markdown 格式。

网页内容如下：`,
    userDisplay: () => `📄 总结当前网页内容`
  },

  summarizeLeaderComments: {
    label: '总结领导批示',
    icon: '👔',
    systemPrompt: `请从以下OA审批意见中，提取并总结与我相关的领导批示。

【我的身份信息】
{USER_INFO}

【提取规则】
1. 只提取与我直接相关的批示意见
2. 重点关注包含我姓名或与我工作相关的审批意见
3. 按审批人分组，提取每个人的批示要点

【输出格式】
1. 总体批示情况（简要说明有几个领导批示、主要态度）

2. 与我相关的批示详情：
   - 审批人：XXX
   - 批示时间：XXXX年XX月XX日
   - 批示意见：（原文摘录关键内容）
   - 涉及我的事项：（明确列出需要我做什么）
   - 批示结果：同意/驳回/补充/转办

3. 待办事项清单：
   - [ ] 事项1（来自XX领导的批示）
   - [ ] 事项2（来自XX领导的批示）

【重要提示】
- 只输出与我相关的批示，其他无关人员的意见一律忽略
- 批示意见要完整准确，不要遗漏关键信息
- 明确标注每个批示对我的具体要求

【网页内容如下】：`
  }
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

// 估算字符数对应的token数（粗略估算：1个中文字符≈0.6 token，1个英文字符≈0.25 token）
function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (let char of String(text)) {
    // 中文字符范围
    if (/[\u4e00-\u9fa5]/.test(char)) {
      tokens += 0.6;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      tokens += 0.25;
    } else {
      tokens += 0.3; // 标点符号等
    }
  }
  return Math.ceil(tokens);
}

// 计算消息列表的总字符数
function calculateTotalChars(messages) {
  return messages.reduce((total, msg) => {
    return total + (msg.content ? String(msg.content).length : 0);
  }, 0);
}

// 截断消息内容到指定长度
function truncateMessageContent(content, maxLength) {
  if (!content || content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '\n...(内容已截断)';
}

// 智能截断消息列表，确保总长度不超过限制
function truncateMessages(messages, maxTotalChars) {
  const totalChars = calculateTotalChars(messages);
  
  if (totalChars <= maxTotalChars) {
    return messages;
  }
  
  console.log("[Sidepanel] 消息总长度超限，需要截断:", totalChars, ">", maxTotalChars);
  
  // 保留系统消息（通常是第一条）
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');
  
  // 计算系统消息占用的长度
  const systemChars = calculateTotalChars(systemMessages);
  const remainingChars = maxTotalChars - systemChars;
  
  if (remainingChars < 1000) {
    // 系统消息就占用了太多空间，需要截断系统消息
    console.log("[Sidepanel] 系统消息过长，进行截断");
    const truncatedSystem = systemMessages.map(msg => ({
      ...msg,
      content: truncateMessageContent(msg.content, Math.floor(maxTotalChars * 0.6))
    }));
    return [...truncatedSystem, ...otherMessages.slice(-2)]; // 只保留最近2条
  }
  
  // 保留最近的消息，删除旧的
  let result = [...systemMessages];
  let currentChars = systemChars;
  
  // 从后往前添加消息
  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const msg = otherMessages[i];
    const msgChars = String(msg.content).length;
    
    if (currentChars + msgChars <= maxTotalChars) {
      result.unshift(msg);
      currentChars += msgChars;
    } else {
      // 空间不足，截断这条消息
      const availableChars = maxTotalChars - currentChars - 100; // 留100字符缓冲
      if (availableChars > 200) {
        result.unshift({
          ...msg,
          content: truncateMessageContent(msg.content, availableChars)
        });
      }
      break;
    }
  }
  
  console.log("[Sidepanel] 截断后消息数:", result.length, "总字符:", calculateTotalChars(result));
  return result;
}

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
      } else if (action === 'openPanel') {
        // 仅打开侧边栏，不执行任何操作
        console.log("[Sidepanel] 仅打开侧边栏");
        // 不执行任何操作，侧边栏已打开
      } else if (action === 'summarizePage' || action === 'summarizeLeaderComments') {
        // 网页总结或领导批示总结（无划词时触发）
        await handlePageSummary(action);
      } else {
        // 功能处理：总结、改写、稽核
        const feature = FEATURE_PROMPTS[action];
        if (feature) {
          // 对话框中只显示简洁的图标和简短文本
          const shortText = selectedText.substring(0, 20) + (selectedText.length > 20 ? '...' : '');
          addMessage('user', `${feature.icon} ${feature.label}：「${shortText}」`);

          // 保存到历史（使用完整的系统提示词+原文）
          conversationHistory.push({
            role: 'user',
            content: `${feature.systemPrompt}\n\n${selectedText}`
          });

          // 发送请求（此时 askAI 会使用 conversationHistory 中的完整提示）
          await askAI('', null, true); // 第三个参数表示这是功能调用，不需要额外构建提示
        }
      }
    }
  } catch (e) {
    console.error("[Sidepanel] 检查待处理问题失败:", e);
  } finally {
    isProcessingPending = false;
  }
}

// 处理网页总结（包括总结该网页和总结领导批示）
async function handlePageSummary(action) {
  const feature = FEATURE_PROMPTS[action];
  if (!feature) {
    console.error("[Sidepanel] 未知的功能类型:", action);
    return;
  }

  // 显示用户操作
  addMessage('user', `${feature.icon} ${feature.label}`);

  // 获取网页上下文
  updateContextStatus('正在获取网页内容...');
  const pageContext = await getCurrentPageContext(true);

  if (!pageContext || !pageContext.content) {
    addMessage('bot', '无法获取当前网页内容，请确保您正在浏览一个可访问的网页。');
    return;
  }

  updateContextStatus('正在分析...');

  // 构建系统提示词
  let systemPrompt = feature.systemPrompt;

  // 如果是总结领导批示，需要替换用户信息占位符
  if (action === 'summarizeLeaderComments') {
    await loadConfig(); // 确保配置是最新的
    let userInfo = '';

    if (config.myName) {
      userInfo += `我的姓名：${config.myName}`;
    }
    if (config.otherInfo) {
      if (userInfo) userInfo += '；';
      userInfo += config.otherInfo;
    }

    if (!userInfo) {
      // 未配置个人信息，提示用户
      addMessage('bot', '请先配置个人身份信息（设置 -> 个人身份配置），以便准确识别相关批示。');
      openConfigPanel();
      return;
    }

    systemPrompt = systemPrompt.replace('{USER_INFO}', userInfo);
  }

  // 保存到历史
  conversationHistory.push({
    role: 'user',
    content: `${systemPrompt}\n\n${pageContext.content}`
  });

  // 发送请求
  await askAI('', null, true);

  // 更新状态栏
  const statusText = buildContextStatusText(pageContext);
  updateContextStatus(statusText);
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
    const maxTotalCharsInput = parseInt(document.getElementById('ai-max-total-chars').value);
    const maxHistoryRoundsInput = parseInt(document.getElementById('ai-max-history-rounds').value);
    
    const newConfig = {
      apiKey: document.getElementById('ai-api-key').value.trim(),
      apiUrl: document.getElementById('ai-api-url').value.trim() || DEFAULT_CONFIG.apiUrl,
      model: document.getElementById('ai-model').value.trim() || DEFAULT_CONFIG.model,
      temperature: parseFloat(document.getElementById('ai-temperature').value) || DEFAULT_CONFIG.temperature,
      maxTokens: parseInt(document.getElementById('ai-max-tokens').value) || DEFAULT_CONFIG.maxTokens,
      useContext: document.getElementById('ai-use-context').checked,
      contextLength: contextLengthInput >= 1000 && contextLengthInput <= 15000 ? contextLengthInput : DEFAULT_CONFIG.contextLength,
      maxTotalChars: maxTotalCharsInput >= 5000 ? maxTotalCharsInput : DEFAULT_CONFIG.maxTotalChars,
      maxHistoryRounds: maxHistoryRoundsInput >= 1 && maxHistoryRoundsInput <= 20 ? maxHistoryRoundsInput : DEFAULT_CONFIG.maxHistoryRounds,
      enableDoubleClick: document.getElementById('ai-enable-double-click').checked,
      // 个人身份配置
      myName: document.getElementById('ai-my-name').value.trim(),
      otherInfo: document.getElementById('ai-other-info').value.trim()
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
async function askAI(text, context = null, isFeatureCall = false) {
  // 重新加载配置，确保使用最新的配置
  await loadConfig();
  
  console.log("[Sidepanel] askAI 被调用，当前配置:", { 
    apiUrl: config.apiUrl, 
    model: config.model, 
    apiKey: config.apiKey ? '已设置(' + config.apiKey.substring(0, 10) + '...)' : '未设置',
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    historyLength: conversationHistory.length,
    isFeatureCall: isFeatureCall
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
  
  // 构建消息列表
  const messages = [];
  
  // 如果不是功能调用，需要构建新的用户提示（包含网页上下文）
  if (!isFeatureCall && text) {
    // 获取网页上下文
    let pageContext = context;
    if (config.useContext && !pageContext) {
      pageContext = await getCurrentPageContext();
    }
    
    // 构建系统提示（如果有网页上下文）
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
    
    // 添加历史对话（限制轮数，防止累积过长）
    const maxHistoryRounds = config.maxHistoryRounds || 5;
    const recentHistory = conversationHistory.slice(-maxHistoryRounds * 2);
    messages.push(...recentHistory);
    
    // 添加当前问题
    messages.push({ role: 'user', content: text });
    
  } else if (isFeatureCall) {
    // 功能调用：消息已经在 conversationHistory 中构建好了
    // 只需要添加历史对话（不包含系统上下文，因为功能调用不需要网页上下文）
    const maxHistoryRounds = Math.min(3, config.maxHistoryRounds || 5); // 功能调用使用更少的历史
    const recentHistory = conversationHistory.slice(-maxHistoryRounds * 2);
    messages.push(...recentHistory);
  }
  
  // 智能截断，确保总长度不超过限制
  const maxTotalChars = config.maxTotalChars || 25000;
  const truncatedMessages = truncateMessages(messages, maxTotalChars);
  
  console.log("[Sidepanel] 发送请求，原始消息数:", messages.length, 
              "截断后消息数:", truncatedMessages.length,
              "总字符:", calculateTotalChars(truncatedMessages),
              "预估tokens:", estimateTokens(truncatedMessages.map(m => m.content).join('')));
  
  const requestBody = {
    model: config.model,
    messages: truncatedMessages,
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
  console.log("[Sidepanel] 请求体消息数:", requestBody.messages.length);
  
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
      ? ` <think> \n${accumulatedThinkText}\n\n${accumulatedText}`
      : accumulatedText;
    if (fullResponse.trim()) {
      // 截断过长的回复，防止历史累积过大
      const maxResponseLength = 8000;
      const savedResponse = fullResponse.length > maxResponseLength 
        ? fullResponse.substring(0, maxResponseLength) + '\n...(回复已截断保存)'
        : fullResponse;
      conversationHistory.push({ role: 'assistant', content: savedResponse });
      console.log("[Sidepanel] 已保存回复到历史，当前历史长度:", conversationHistory.length);
      
      // 清理过旧的历史，防止内存占用过大
      const maxTotalMessages = (config.maxHistoryRounds || 5) * 2 + 2; // 用户+AI 轮数 + 当前请求
      if (conversationHistory.length > maxTotalMessages * 2) {
        // 保留系统消息（如果有）和最近的消息
        const systemMessages = conversationHistory.filter(m => m.role === 'system');
        const otherMessages = conversationHistory.filter(m => m.role !== 'system');
        const recentMessages = otherMessages.slice(-maxTotalMessages);
        conversationHistory = [...systemMessages, ...recentMessages];
        console.log("[Sidepanel] 已清理旧历史，新历史长度:", conversationHistory.length);
      }
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

  // 新的配置项
  const maxTotalCharsEl = document.getElementById('ai-max-total-chars');
  if (maxTotalCharsEl) {
    maxTotalCharsEl.value = config.maxTotalChars || DEFAULT_CONFIG.maxTotalChars;
  }
  const maxHistoryRoundsEl = document.getElementById('ai-max-history-rounds');
  if (maxHistoryRoundsEl) {
    maxHistoryRoundsEl.value = config.maxHistoryRounds || DEFAULT_CONFIG.maxHistoryRounds;
  }

  // 个人身份配置
  const myNameEl = document.getElementById('ai-my-name');
  if (myNameEl) {
    myNameEl.value = config.myName || '';
  }
  const otherInfoEl = document.getElementById('ai-other-info');
  if (otherInfoEl) {
    otherInfoEl.value = config.otherInfo || '';
  }

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