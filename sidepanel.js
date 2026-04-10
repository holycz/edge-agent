// 默认配置
const DEFAULT_CONFIG = {
  apiKey: "",
  apiUrl: "https://integrate.api.nvidia.com/v1",
  model: "qwen/qwen3-next-80b-a3b-instruct",
  temperature: 0.7,
  maxTokens: 2048
};

let config = { ...DEFAULT_CONFIG };
let currentBotBubble = null;
let accumulatedText = "";

// DOM 元素
const messagesContainer = document.getElementById('ai-messages');
const inputTextarea = document.getElementById('ai-input');
const sendButton = document.getElementById('ai-send');
const configPanel = document.getElementById('ai-config-panel');

// 初始化
async function init() {
  await loadConfig();
  initMarkdownParser();
  setupEventListeners();
  
  // 检查是否有待处理的提问（从右键菜单触发）
  console.log("[Sidepanel] 初始化完成，检查待处理问题...");
  checkPendingQuestion();
  
  // 监听 storage 变化，防止打开时还没设置好
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'session' && changes.pendingQuestion) {
      console.log("[Sidepanel] 检测到待处理问题变化");
      checkPendingQuestion();
    }
  });
}

// 检查并处理待处理问题
async function checkPendingQuestion() {
  try {
    const result = await chrome.storage.session.get('pendingQuestion');
    console.log("[Sidepanel] 获取到待处理问题:", result);
    
    if (result.pendingQuestion) {
      const question = result.pendingQuestion;
      await chrome.storage.session.remove('pendingQuestion');
      console.log("[Sidepanel] 处理待处理问题:", question);
      addMessage('user', question);
      await askAI(question);
    }
  } catch (e) {
    console.error("[Sidepanel] 检查待处理问题失败:", e);
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
    if (result.aiConfig) {
      config = { ...DEFAULT_CONFIG, ...result.aiConfig };
    }
  } catch (e) {
    console.log("加载配置失败:", e);
  }
}

// 保存配置
async function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    await chrome.storage.sync.set({ aiConfig: config });
    return true;
  } catch (e) {
    console.log("保存配置失败:", e);
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
    const newConfig = {
      apiKey: document.getElementById('ai-api-key').value.trim(),
      apiUrl: document.getElementById('ai-api-url').value.trim() || DEFAULT_CONFIG.apiUrl,
      model: document.getElementById('ai-model').value.trim() || DEFAULT_CONFIG.model,
      temperature: parseFloat(document.getElementById('ai-temperature').value) || DEFAULT_CONFIG.temperature,
      maxTokens: parseInt(document.getElementById('ai-max-tokens').value) || DEFAULT_CONFIG.maxTokens
    };
    
    if (await saveConfig(newConfig)) {
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
  
  // 监听来自 content script 的消息
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AI_TRIGGER') {
      addMessage('user', msg.text);
      askAI(msg.text);
    }
  });
}

// 发送消息
async function sendMessage() {
  const text = inputTextarea.value.trim();
  if (!text) return;
  
  inputTextarea.value = '';
  inputTextarea.style.height = 'auto';
  
  addMessage('user', text);
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
  
  // 内容
  const content = document.createElement('div');
  content.className = 'ai-msg-content';
  
  const bubble = document.createElement('div');
  bubble.className = `ai-msg ai-${role}`;
  
  if (role === 'user') {
    bubble.textContent = text;
  } else {
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
  }
  
  content.appendChild(bubble);
  
  if (role === 'user') {
    row.appendChild(content);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(content);
  }
  
  messagesContainer.appendChild(row);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
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

// 询问 AI
async function askAI(text) {
  if (!config.apiKey) {
    addMessage('bot', '请先点击面板右上角的 ⚙️ 设置 API Key');
    openConfigPanel();
    return;
  }
  
  currentBotBubble = addMessage('bot', '思考中...');
  accumulatedText = '';
  
  try {
    chrome.runtime.sendMessage({
      type: 'API_STREAM_REQUEST',
      url: config.apiUrl + '/chat/completions',
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + config.apiKey
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: text }],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: true
        })
      }
    });
  } catch (e) {
    currentBotBubble.innerHTML = '出错：' + e.message;
    currentBotBubble = null;
  }
}

// 监听流式响应
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STREAM_CHUNK') {
    if (currentBotBubble) {
      accumulatedText += msg.content;
      currentBotBubble.innerHTML = parseMarkdown(accumulatedText);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  } else if (msg.type === 'STREAM_DONE') {
    currentBotBubble = null;
    accumulatedText = '';
  } else if (msg.type === 'STREAM_ERROR') {
    if (currentBotBubble) {
      currentBotBubble.innerHTML = '出错：' + msg.error;
      currentBotBubble = null;
      accumulatedText = '';
    }
  }
});

// 清空对话
function clearMessages() {
  messagesContainer.innerHTML = '';
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
  document.getElementById('ai-api-key').value = config.apiKey || '';
  document.getElementById('ai-api-url').value = config.apiUrl || '';
  document.getElementById('ai-model').value = config.model || '';
  document.getElementById('ai-temperature').value = config.temperature || 0.7;
  document.getElementById('ai-max-tokens').value = config.maxTokens || 2048;
}

// 显示提示
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'ai-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// 启动
init();