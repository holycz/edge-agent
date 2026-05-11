/**
 * 会话管理模块
 * 负责会话的创建、切换、删除等操作
 * @module session
 */

// 全局状态引用已在 globals.js 中定义

const SessionManager = {
  /**
   * 生成唯一ID
   * @returns {string} 唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * 创建新会话
   * @param {string} title - 会话标题
   * @param {string} agentType - 智能体类型ID
   * @param {string} dialogType - 对话类型：'agent'（智能体）或 'workflow'（工作流）
   * @returns {Object} 新创建的会话对象
   */
  createSession(title = '新会话', agentType = AGENT_TYPES.CHAT, dialogType = 'agent') {
    const session = {
      id: this.generateId(),
      title: title.substring(0, 50),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pageContext: null,
      dialogId: generateDialogId(),
      agentType: agentType,
      dialogType: dialogType, // 'agent' 或 'workflow'
    };

    sessions.unshift(session);
    currentSessionId = session.id;
    StorageManager.saveSessions();

    console.log('[SessionManager] 创建新会话:', session.id, 'agentType:', agentType, 'dialogType:', dialogType, 'dialogId:', session.dialogId);
    return session;
  },

  /**
   * 获取当前会话的 dialogId
   * @returns {string} 对话ID
   */
  getCurrentDialogId() {
    const session = this.getCurrentSession();
    if (!session) return generateDialogId();

    if (!session.dialogId) {
      session.dialogId = generateDialogId();
      StorageManager.saveSessions();
    }
    return session.dialogId;
  },

  /**
   * 获取会话的智能体类型
   * @param {string|null} sessionId - 会话ID（可选，默认当前会话）
   * @returns {string} 智能体类型ID
   */
  getSessionAgentType(sessionId = null) {
    const session = sessionId ? sessions.find(s => s.id === sessionId) : this.getCurrentSession();
    return session?.agentType || AGENT_TYPES.CHAT;
  },

  /**
   * 获取会话的对话类型
   * @param {string|null} sessionId - 会话ID（可选，默认当前会话）
   * @returns {string} 对话类型：'agent' 或 'workflow'
   */
  getSessionDialogType(sessionId = null) {
    const session = sessionId ? sessions.find(s => s.id === sessionId) : this.getCurrentSession();
    return session?.dialogType || 'agent';
  },

  /**
   * 设置会话的对话类型
   * @param {string} sessionId - 会话ID
   * @param {string} dialogType - 对话类型：'agent' 或 'workflow'
   */
  setSessionDialogType(sessionId, dialogType) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.dialogType = dialogType;
      session.updatedAt = Date.now();
      StorageManager.saveSessions();
    }
  },

  /**
   * 设置会话的智能体类型
   * @param {string} sessionId - 会话ID
   * @param {string} agentType - 智能体类型ID
   */
  setSessionAgentType(sessionId, agentType) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.agentType = agentType;
      if (!session.dialogId) {
        session.dialogId = generateDialogId();
      }
      session.updatedAt = Date.now();
      StorageManager.saveSessions();
    }
  },

  /**
   * 获取当前会话
   * @returns {Object|null} 当前会话对象
   */
  getCurrentSession() {
    return sessions.find(s => s.id === currentSessionId) || null;
  },

  /**
   * 切换会话
   * @param {string} sessionId - 目标会话ID
   * @returns {Object|null} 切换后的会话对象
   */
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

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   * @returns {boolean} 是否删除成功
   */
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

  /**
   * 清空所有会话
   */
  clearAll() {
    sessions = [];
    currentSessionId = null;
    StorageManager.saveSessions();
  },

  /**
   * 更新会话标题
   * @param {string} sessionId - 会话ID
   * @param {string} newTitle - 新标题
   * @returns {boolean} 是否更新成功
   */
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

  /**
   * 保存当前会话的消息
   */
  saveCurrentSessionMessages() {
    const session = this.getCurrentSession();
    if (session) {
      session.messages = [...conversationHistory];
      session.updatedAt = Date.now();
      StorageManager.saveSessions();
    } else if (conversationHistory.length > 0) {
      this.createSession('新会话');
      const newSession = this.getCurrentSession();
      if (newSession) {
        newSession.messages = [...conversationHistory];
        newSession.updatedAt = Date.now();
        StorageManager.saveSessions();
      }
    }
  },

  /**
   * 自动生成会话标题
   * @param {string} sessionId - 会话ID
   * @param {string} firstMessage - 第一条消息内容
   */
  autoGenerateTitle(sessionId, firstMessage) {
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.title === '新会话' && firstMessage) {
      const title = firstMessage.substring(0, 20) + (firstMessage.length > 20 ? '...' : '');
      session.title = title;
      session.updatedAt = Date.now();
      if (!session.agentType) {
        session.agentType = AGENT_TYPES.CHAT;
      }
      StorageManager.saveSessions();
    }
  },
};
