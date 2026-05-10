/**
 * 对话历史搜索模块
 * 负责搜索所有会话的消息内容，支持关键词搜索和高亮显示
 * @module search
 */

// ========== 搜索UI元素引用 ==========
let searchInput = null;
let searchClearBtn = null;
let searchResultsPanel = null;
let searchResultsList = null;
let searchResultsCount = null;
let searchCloseBtn = null;
let searchContainer = null;

// ========== 初始化 ==========

/**
 * 初始化搜索模块
 */
function initSearch() {
  // 获取DOM元素
  searchInput = document.getElementById('ai-search-input');
  searchClearBtn = document.getElementById('ai-search-clear');
  searchResultsPanel = document.getElementById('ai-search-results');
  searchResultsList = document.getElementById('ai-search-results-list');
  searchResultsCount = document.getElementById('ai-search-results-count');
  searchCloseBtn = document.getElementById('ai-search-close');
  searchContainer = document.getElementById('ai-search-container');

  if (!searchInput) {
    console.error('[Search] 搜索输入框元素未找到');
    return;
  }

  // 绑定事件
  bindSearchEvents();

  console.log('[Search] 搜索模块已初始化');
}

/**
 * 绑定搜索相关事件
 */
function bindSearchEvents() {
  // 输入事件（防抖搜索）
  let debounceTimer = null;
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // 显示/隐藏清除按钮
    searchClearBtn.style.display = query ? 'block' : 'none';
    
    // 清除之前的定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    if (query) {
      // 300ms防抖
      debounceTimer = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      // 清空搜索
      clearSearch();
    }
  });

  // 清除按钮
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    searchClearBtn.style.display = 'none';
    clearSearch();
  });

  // 关闭搜索结果按钮
  searchCloseBtn.addEventListener('click', () => {
    clearSearch();
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
  });

  // 键盘快捷键
  document.addEventListener('keydown', handleSearchKeydown);
}

/**
 * 处理搜索快捷键
 */
function handleSearchKeydown(e) {
  // ESC 关闭搜索结果或清空搜索
  if (e.key === 'Escape' && searchResultsPanel.style.display === 'block') {
    clearSearch();
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    searchInput.blur();
  }
}

/**
 * 聚焦搜索输入框
 */
function focusSearchInput() {
  // 展开侧边栏
  const sidebar = document.getElementById('ai-sidebar-left');
  if (sidebar && sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
  }
  
  // 聚焦搜索框
  searchInput.focus();
  
  // 如果有搜索内容，显示结果面板
  if (searchInput.value.trim()) {
    searchResultsPanel.style.display = 'block';
  }
}

// ========== 搜索逻辑 ==========

/**
 * 执行搜索
 * @param {string} query - 搜索关键词
 */
function performSearch(query) {
  currentSearchQuery = query;
  
  if (!query) {
    clearSearch();
    return;
  }

  // 搜索所有会话的消息
  const results = searchAllSessions(query);
  searchResults = results;
  
  // 渲染结果
  renderSearchResults(results, query);
  
  // 显示结果面板
  searchResultsPanel.style.display = 'block';
  
  console.log(`[Search] 搜索 "${query}" 找到 ${results.length} 条结果`);
}

/**
 * 搜索所有会话
 * @param {string} query - 搜索关键词
 * @returns {Array} 搜索结果列表
 */
function searchAllSessions(query) {
  const results = [];
  const lowerQuery = query.toLowerCase();
  
  sessions.forEach(session => {
    if (!session.messages || session.messages.length === 0) return;
    
    // 搜索会话标题
    const titleMatch = session.title && session.title.toLowerCase().includes(lowerQuery);
    
    // 搜索每条消息
    session.messages.forEach((msg, msgIndex) => {
      const content = msg.content || '';
      const lowerContent = content.toLowerCase();
      
      if (lowerContent.includes(lowerQuery)) {
        // 找到匹配，创建结果对象
        results.push({
          sessionId: session.id,
          sessionTitle: session.title,
          agentType: session.agentType,
          messageIndex: msgIndex,
          message: msg,
          timestamp: session.createdAt,
          // 提取匹配片段
          snippet: extractSnippet(content, query, 80),
        });
      }
    });
    
    // 如果标题匹配但没有消息匹配，也添加一个结果
    if (titleMatch && !session.messages.some(msg => 
      (msg.content || '').toLowerCase().includes(lowerQuery)
    )) {
      const lastMsg = session.messages[session.messages.length - 1];
      results.push({
        sessionId: session.id,
        sessionTitle: session.title,
        agentType: session.agentType,
        messageIndex: session.messages.length - 1,
        message: lastMsg,
        timestamp: session.createdAt,
        snippet: extractSnippet(lastMsg?.content || '', query, 80),
        isTitleMatch: true,
      });
    }
  });
  
  // 按时间倒序排序
  return results.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 提取匹配片段，高亮关键词
 * @param {string} text - 原始文本
 * @param {string} query - 搜索关键词
 * @param {number} maxLength - 最大长度
 * @returns {string} 处理后的HTML片段
 */
function extractSnippet(text, query, maxLength = 80) {
  if (!text || !query) return '';
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  let start = 0;
  let end = Math.min(text.length, maxLength);
  
  if (index !== -1) {
    // 找到匹配位置，以该位置为中心提取
    const snippetLength = Math.floor(maxLength / 2);
    start = Math.max(0, index - snippetLength + 20);
    end = Math.min(text.length, index + query.length + snippetLength - 20);
  }
  
  let snippet = text.substring(start, end);
  
  // 添加省略号
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  
  // 高亮关键词
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  snippet = snippet.replace(regex, '<mark class="ai-search-highlight">$1</mark>');
  
  return snippet;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 清空搜索结果
 */
function clearSearch() {
  searchResults = [];
  currentSearchQuery = '';
  if (searchResultsPanel) {
    searchResultsPanel.style.display = 'none';
  }
  if (searchResultsList) {
    searchResultsList.innerHTML = '';
  }
  if (searchResultsCount) {
    searchResultsCount.textContent = '';
  }
}

// ========== 渲染搜索结果 ==========

/**
 * 渲染搜索结果
 * @param {Array} results - 搜索结果
 * @param {string} query - 搜索关键词
 */
function renderSearchResults(results, query) {
  if (!searchResultsList || !searchResultsCount) return;
  
  // 更新结果数量
  searchResultsCount.textContent = `找到 ${results.length} 条结果`;
  
  if (results.length === 0) {
    searchResultsList.innerHTML = `
      <div class="ai-search-empty">
        <div class="ai-search-empty-icon">🔍</div>
        <div class="ai-search-empty-text">未找到包含 "${escapeHtml(query)}" 的对话</div>
        <div class="ai-search-empty-hint">尝试使用其他关键词</div>
      </div>
    `;
    return;
  }
  
  // 渲染结果列表
  searchResultsList.innerHTML = results.map((result, index) => {
    const agentName = getAgentNameById(result.agentType);
    const roleIcon = result.message.role === 'user' ? '👤' : '🤖';
    const date = formatDate(result.timestamp);
    
    return `
      <div class="ai-search-result-item" data-index="${index}" data-session-id="${result.sessionId}">
        <div class="ai-search-result-header">
          <span class="ai-search-result-title">${escapeHtml(result.sessionTitle)}</span>
          <span class="ai-search-result-agent">${agentName}</span>
        </div>
        <div class="ai-search-result-content">
          <span class="ai-search-result-role">${roleIcon}</span>
          <span class="ai-search-result-snippet">${result.snippet}</span>
        </div>
        <div class="ai-search-result-meta">
          <span class="ai-search-result-date">${date}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定点击事件
  const resultItems = searchResultsList.querySelectorAll('.ai-search-result-item');
  resultItems.forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      const sessionId = item.dataset.sessionId;
      jumpToSearchResult(index, sessionId);
    });
  });
}

// ========== 跳转功能 ==========

/**
 * 跳转到搜索结果
 * @param {number} resultIndex - 结果索引
 * @param {string} sessionId - 会话ID
 */
function jumpToSearchResult(resultIndex, sessionId) {
  const result = searchResults[resultIndex];
  if (!result) return;
  
  // 切换到目标会话（switchSession 内部会设置 conversationHistory）
  const session = SessionManager.switchSession(sessionId);
  if (!session) {
    console.error('[Search] 找不到目标会话:', sessionId);
    return;
  }
  
  // 更新UI
  renderSessionList();
  renderConversationHistory();
  updateHeaderTitle();
  
  // 高亮目标消息（等待 DOM 渲染完成）
  setTimeout(() => {
    highlightMessage(result.messageIndex);
  }, 150);
  
  console.log(`[Search] 跳转到会话 ${sessionId} 的第 ${result.messageIndex} 条消息`);
}

/**
 * 高亮显示目标消息
 * @param {number} messageIndex - 消息索引
 */
function highlightMessage(messageIndex) {
  const rows = messagesContainer.querySelectorAll('.ai-msg-row');
  if (messageIndex >= 0 && messageIndex < rows.length) {
    const targetRow = rows[messageIndex];
    
    // 滚动到目标消息
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 添加高亮动画
    targetRow.classList.add('ai-msg-highlight');
    setTimeout(() => {
      targetRow.classList.remove('ai-msg-highlight');
    }, 3000);
  }
}

// ========== 辅助函数 ==========

/**
 * 根据智能体ID获取名称
 * @param {string} agentId - 智能体ID
 * @returns {string} 智能体名称
 */
function getAgentNameById(agentId) {
  // 内置智能体
  const builtInNames = {
    [AGENT_IDS.CHAT]: 'AI问答',
    [AGENT_IDS.SUMMARIZE_PAGE]: '网页总结',
    [AGENT_IDS.REWRITE]: '文本润色',
    [AGENT_IDS.PROOFREAD]: '文本稽核',
    [AGENT_IDS.SUMMARIZE_LEADER]: '批示总结',
  };
  
  if (builtInNames[agentId]) {
    return builtInNames[agentId];
  }
  
  // 自定义智能体
  const customAgent = customAgents.find(a => a.id === agentId);
  if (customAgent) {
    return customAgent.name;
  }
  
  return 'AI助手';
}

/**
 * 格式化日期
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // 今天
  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 本周
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  }
  
  // 更早
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 转义HTML特殊字符
 * @param {string} text - 原始文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== 导出 ==========

window.SearchManager = {
  init: initSearch,
  focus: focusSearchInput,
  clear: clearSearch,
};