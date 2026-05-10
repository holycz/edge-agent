/**
 * 存储管理模块
 * 负责与 chrome.storage 交互，管理会话数据的持久化
 * @module storage
 */

// 全局状态引用已在 globals.js 中定义

const StorageManager = {
  /**
   * 加载会话数据
   * @returns {Promise<Array>} 会话列表
   */
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

  /**
   * 保存会话数据
   */
  async saveSessions() {
    try {
      await chrome.storage.local.set({ sessions, currentSessionId });
      console.log('[Storage] 保存会话成功:', sessions.length);
    } catch (e) {
      console.error('[Storage] 保存会话失败:', e);
    }
  },

  /**
   * 导出所有数据
   * @returns {Promise<string>} JSON字符串
   */
  async exportData() {
    const data = await chrome.storage.local.get(['sessions']);
    return JSON.stringify(data, null, 2);
  },

  /**
   * 导入数据
   * @param {string} jsonString - JSON字符串
   * @returns {Promise<boolean>} 是否导入成功
   */
  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.sessions) await chrome.storage.local.set({ sessions: data.sessions });
      await this.loadSessions();
      return true;
    } catch (e) {
      console.error('[Storage] 导入数据失败:', e);
      return false;
    }
  },

  /**
   * 清空所有数据
   * @returns {Promise<boolean>} 是否清空成功
   */
  async clearAllData() {
    try {
      await chrome.storage.local.remove(['sessions', 'currentSessionId']);
      sessions = [];
      currentSessionId = null;
      console.log('[Storage] 已清空所有数据');
      return true;
    } catch (e) {
      console.error('[Storage] 清空数据失败:', e);
      return false;
    }
  }
};
