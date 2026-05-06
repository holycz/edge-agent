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
    
    // 添加编辑按钮（仅用户消息，hover时显示）
    const editBtn = document.createElement('button');
    editBtn.className = 'ai-msg-action ai-msg-edit';
    editBtn.innerHTML = '✏️';
    editBtn.title = '编辑消息';
    editBtn.addEventListener('click', () => editMessage(text, content));
    content.appendChild(editBtn);
    
    // 设置content为相对定位，以便editBtn可以绝对定位
    content.style.position = 'relative';
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

    // 添加操作按钮（仅AI消息且非思考中状态）
    if (text !== '思考中...') {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'ai-msg-actions';
      
      // 复制按钮
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ai-msg-action';
      copyBtn.innerHTML = '📋';
      copyBtn.title = '复制消息';
      copyBtn.addEventListener('click', () => copyMessage(text, copyBtn));
      actionsDiv.appendChild(copyBtn);
      
      // 重试按钮（仅最后一条AI消息显示）
      const isLastBotMessage = !messagesContainer.querySelector('.ai-bot-row:last-child .ai-msg-actions .ai-msg-retry');
      if (isLastBotMessage) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'ai-msg-action ai-msg-retry';
        retryBtn.innerHTML = '🔄';
        retryBtn.title = '重新生成';
        retryBtn.addEventListener('click', () => retryLastMessage());
        actionsDiv.appendChild(retryBtn);
      }
      
      content.appendChild(actionsDiv);
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
 * 重试最后一条消息
 * 删除最后的AI回复，重新发送最后一条用户消息
 */
function retryLastMessage() {
  if (isStreaming) {
    showToast('正在生成中，请稍后重试', 2000, 'warning');
    return;
  }
  
  // 找到最后一条用户消息
  const lastUserMsgIndex = conversationHistory.findLastIndex(msg => msg.role === 'user');
  if (lastUserMsgIndex === -1) {
    showToast('没有可重试的消息', 2000, 'warning');
    return;
  }
  
  const lastUserMsg = conversationHistory[lastUserMsgIndex];
  
  // 删除最后的AI回复（如果最后一条是assistant）
  const lastMsg = conversationHistory[conversationHistory.length - 1];
  if (lastMsg && lastMsg.role === 'assistant') {
    conversationHistory.pop();
  }
  
  // 从UI中删除最后的AI消息行
  const botRows = messagesContainer.querySelectorAll('.ai-bot-row');
  if (botRows.length > 0) {
    const lastBotRow = botRows[botRows.length - 1];
    lastBotRow.remove();
  }
  
  // 保存会话
  SessionManager.saveCurrentSessionMessages();
  
  // 重新发送消息
  const text = lastUserMsg.content;
  showToast('正在重新生成...', 2000);
  
  // 设置输入框并发送
  inputTextarea.value = text;
  sendMessage();
}

/**
 * 编辑用户消息
 * 将消息内容放入输入框，删除该消息及其后续所有消息
 * @param {string} text - 原始消息文本
 * @param {HTMLElement} contentEl - 消息内容元素
 */
function editMessage(text, contentEl) {
  if (isStreaming) {
    showToast('正在生成中，请稍后编辑', 2000, 'warning');
    return;
  }
  
  // 找到该消息在conversationHistory中的索引
  const msgIndex = conversationHistory.findIndex(msg => msg.role === 'user' && msg.content === text);
  if (msgIndex === -1) {
    showToast('找不到该消息', 2000, 'warning');
    return;
  }
  
  // 删除该消息及其后续所有消息
  const removedMessages = conversationHistory.splice(msgIndex);
  
  // 从UI中删除对应的消息行
  const allRows = messagesContainer.querySelectorAll('.ai-msg-row');
  let rowIndex = 0;
  allRows.forEach((row, index) => {
    if (index >= msgIndex) {
      row.remove();
    }
  });
  
  // 保存会话
  SessionManager.saveCurrentSessionMessages();
  
  // 将消息内容放入输入框
  inputTextarea.value = text;
  inputTextarea.focus();
  inputTextarea.style.height = 'auto';
  inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
  
  showToast('消息已放入输入框，编辑后重新发送', 2000);
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
