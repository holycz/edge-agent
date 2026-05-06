/**
 * UI渲染模块
 * 负责界面元素的渲染和更新
 * @module ui
 */

// DOM元素引用（在main.js中初始化）
// let messagesContainer, inputTextarea, sendButton, configPanel;

/**
 * 添加消息到界面
 * @param {string} role - 消息角色（user/bot）
 * @param {string} text - 消息内容
 * @returns {Object} 消息元素对象
 */
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

    // 添加复制按钮（仅AI消息）
    if (text !== '思考中...') {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-msg-copy';
      copyBtn.innerHTML = '📋';
      copyBtn.title = '复制消息';
      copyBtn.addEventListener('click', () => copyMessage(text, copyBtn));
      content.appendChild(copyBtn);
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

/**
 * 复制消息内容
 * @param {string} text - 要复制的文本
 * @param {HTMLElement} button - 复制按钮
 */
async function copyMessage(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.innerHTML = '✓';
    button.classList.add('copied');
    showToast('已复制到剪贴板');
    setTimeout(() => {
      button.innerHTML = '📋';
      button.classList.remove('copied');
    }, 2000);
  } catch (e) {
    // 降级方案：使用textarea复制
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      button.innerHTML = '✓';
      button.classList.add('copied');
      showToast('已复制到剪贴板');
      setTimeout(() => {
        button.innerHTML = '📋';
        button.classList.remove('copied');
      }, 2000);
    } catch (err) {
      showToast('复制失败，请手动复制', 3000, 'error');
    }
    document.body.removeChild(textarea);
  }
}

/**
 * 创建思考过程气泡
 * @param {HTMLElement} contentContainer - 内容容器
 * @returns {Object} 思考气泡元素对象
 */
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

/**
 * 折叠思考气泡
 * @param {HTMLElement} thinkContainer - 思考容器
 */
function collapseThinkBubble(thinkContainer) {
  if (thinkContainer) {
    thinkContainer.classList.add('collapsed');
    const toggle = thinkContainer.querySelector('.ai-think-toggle');
    if (toggle) {
      toggle.textContent = '▶';
    }
  }
}

/**
 * 创建内容气泡
 * @param {HTMLElement} contentContainer - 内容容器
 * @returns {HTMLElement} 内容气泡元素
 */
function createContentBubble(contentContainer) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg ai-bot';
  contentContainer.appendChild(bubble);
  return bubble;
}

/**
 * 渲染会话列表
 */
function renderSessionList() {
  const list = document.getElementById('ai-session-list');
  if (!list) return;
  
  list.innerHTML = '';

  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  sortedSessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'ai-session-item' + (session.id === currentSessionId ? ' active' : '');
    item.dataset.id = session.id;

    let agentIcon = '💬';
    if (session.agentType === AGENT_IDS.SUMMARIZE_PAGE) agentIcon = '📄';
    else if (session.agentType === AGENT_IDS.SUMMARIZE_LEADER) agentIcon = '👔';
    else if (session.agentType === AGENT_IDS.REWRITE) agentIcon = '✨';
    else if (session.agentType === AGENT_IDS.PROOFREAD) agentIcon = '🔍';

    const title = document.createElement('div');
    title.className = 'ai-session-item-title';
    title.textContent = `${agentIcon} ${session.title || '新会话'}`;
    title.title = `${session.title || '新会话'} [${agentIcon} ${session.agentType === AGENT_IDS.CHAT ? 'AI问答' : '其他'}]`;

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

/**
 * 切换到指定会话
 * @param {string} sessionId - 会话ID
 */
function switchToSession(sessionId) {
  if (isStreaming) {
    abortStream();
  }
  const session = SessionManager.switchSession(sessionId);
  if (session) {
    renderSessionList();
    renderConversationHistory();
    updateHeaderTitle();
    showToast(`切换到: ${session.title}`);
  }
}

/**
 * 渲染对话历史
 */
function renderConversationHistory() {
  messagesContainer.innerHTML = '';
  conversationHistory.forEach(msg => {
    if (msg.role !== 'system') {
      addMessage(msg.role === 'assistant' ? 'bot' : 'user', msg.content);
    }
  });
}

/**
 * 删除会话
 * @param {string} sessionId - 会话ID
 */
function deleteSession(sessionId) {
  if (confirm('确定要删除这个会话吗？此操作不可恢复。')) {
    SessionManager.deleteSession(sessionId);
    renderSessionList();
    renderConversationHistory();
    if (currentSessionId === null) {
      SessionManager.createSession('新会话');
      renderSessionList();
    }
    showToast('会话已删除');
  }
}

/**
 * 清空所有消息
 */
function clearMessages() {
  if (isStreaming) {
    abortStream();
  }
  messagesContainer.innerHTML = '';
  clearContextCache();
  conversationHistory = [];
  clearFileUploadState();
  showAgentSelectionModal();
}

/**
 * 更新上下文状态显示
 * @param {string} status - 状态文本
 */
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

/**
 * 构建上下文状态文本
 * @param {Object} context - 页面上下文
 * @returns {string} 状态文本
 */
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
  }

  if (metadata.title) {
    parts.push(`页面: ${metadata.title.substring(0, 30)}${metadata.title.length > 30 ? '...' : ''}`);
  }

  return parts.join(' | ');
}
