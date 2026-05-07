/**
 * 智能体管理模块
 * 负责智能体的配置、验证和管理
 * @module agent-manager
 */

// ========== 智能体ID常量 ==========
const AGENT_IDS = {
  CHAT: 'ddf09cedfcbd4d188adc528461a91392',
  SUMMARIZE_PAGE: 'ac32fe9431b1444f8ac3cdf42901024e',
  REWRITE: 'bbad433949b64fab8de7f1a26d6ab56c',
  PROOFREAD: 'a03444b0e45d416fbc0a494b46a2c55b',
  SUMMARIZE_LEADER: '205a099ade6a4c4fb454e11f96ee6a18',
};

// 智能体类型别名（向后兼容）
const AGENT_TYPES = AGENT_IDS;

// ========== 智能体功能配置 ==========
const FEATURE_PROMPTS = {
  summarize: { label: '总结', icon: '📝', agentId: AGENT_IDS.SUMMARIZE_PAGE },
  rewrite: { label: '润色改写', icon: '✨', agentId: AGENT_IDS.REWRITE },
  proofread: { label: '稽核检查', icon: '🔍', agentId: AGENT_IDS.PROOFREAD },
  summarizePage: { label: '总结该网页', icon: '📄', agentId: AGENT_IDS.SUMMARIZE_PAGE },
  summarizeLeaderComments: { label: '总结领导批示', icon: '👔', agentId: AGENT_IDS.SUMMARIZE_LEADER },
  pageRewrite: { label: '网页文本润色', icon: '✨', agentId: AGENT_IDS.REWRITE },
  pageProofread: { label: '网页文本稽核', icon: '🔍', agentId: AGENT_IDS.PROOFREAD },
  pageAsk: { label: '网页AI问答', icon: '💬', agentId: AGENT_IDS.CHAT },
};

// ========== 自定义智能体管理 ==========
// customAgents 已在 globals.js 中定义

const CustomAgentManager = {
  /**
   * 加载自定义智能体列表
   */
  async load() {
    try {
      const data = await chrome.storage.local.get(['customAgents']);
      customAgents = data.customAgents || [];
      console.log('[CustomAgentManager] 加载自定义智能体:', customAgents.length);
    } catch (e) {
      console.error('[CustomAgentManager] 加载失败:', e);
      customAgents = [];
    }
  },

  /**
   * 保存自定义智能体列表
   */
  async save() {
    try {
      await chrome.storage.local.set({ customAgents });
      console.log('[CustomAgentManager] 保存成功:', customAgents.length);
    } catch (e) {
      console.error('[CustomAgentManager] 保存失败:', e);
    }
  },

  /**
   * 添加自定义智能体
   * @param {Object} agent - 智能体配置
   */
  add(agent) {
    customAgents.push(agent);
    return this.save();
  },

  /**
   * 删除自定义智能体
   * @param {string} agentId - 智能体ID
   */
  remove(agentId) {
    const index = customAgents.findIndex(a => a.id === agentId);
    if (index > -1) {
      customAgents.splice(index, 1);
      return this.save();
    }
    return Promise.resolve();
  },

  /**
   * 根据ID获取智能体
   * @param {string} agentId - 智能体ID
   * @returns {Object|null} 智能体配置
   */
  getAgentById(agentId) {
    return customAgents.find(a => a.id === agentId) || null;
  },

  /**
   * 获取所有自定义智能体
   * @returns {Array} 智能体列表
   */
  getAll() {
    return customAgents;
  },

  /**
   * 判断是否为自定义智能体
   * @param {string} agentId - 智能体ID
   * @returns {boolean}
   */
  isCustomAgent(agentId) {
    return customAgents.some(a => a.id === agentId);
  },

  /**
   * 获取智能体密钥
   * @param {string} agentId - 智能体ID
   * @returns {string|null} 智能体密钥
   */
  getAgentKey(agentId) {
    const agent = this.getAgentById(agentId);
    return agent ? agent.key : null;
  }
};

/**
 * 验证智能体配置
 * @param {string} agentId - 智能体ID
 * @param {string} agentKey - 智能体密钥
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifyAgent(agentId, agentKey) {
  try {
    const backendUrl = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_BACKEND_URL }, (response) => {
        resolve(response?.url || '');
      });
    });

    if (!backendUrl) {
      return { success: false, message: '无法获取后端服务地址' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${backendUrl}${API_ENDPOINTS.AGENT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AuthToken': agentKey,
      },
      body: JSON.stringify({
        request_id: 'verify-' + Date.now(),
        dialog_id: 'verify-' + Date.now(),
        agent_id: agentId,
        session_id: agentId,
        user_id: agentId,
        question: '你好',
        use_history: 'false',
        ifInternet: false,
        ifCallback: true,
        agent_state: 'save',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return { success: false, message: '验证失败：Key无效或已过期' };
    }

    if (response.status === 404) {
      return { success: false, message: '验证失败：智能体ID不存在' };
    }

    if (response.ok || response.status === 200) {
      return { success: true, message: '验证成功' };
    }

    return { success: true, message: `服务已响应（状态码: ${response.status}），智能体可能可用` };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { success: false, message: '验证超时，请检查网络连接' };
    }
    return { success: false, message: `连接失败: ${e.message}` };
  }
}

/**
 * 获取智能体显示标签
 * @param {string} agentType - 智能体类型ID
 * @returns {string} 智能体显示名称
 */
function getAgentLabel(agentType) {
  if (agentType === AGENT_TYPES.CHAT) return 'AI问答';
  if (agentType === AGENT_TYPES.SUMMARIZE_PAGE) return '网页总结';
  if (agentType === AGENT_TYPES.REWRITE) return '文本润色';
  if (agentType === AGENT_TYPES.PROOFREAD) return '文本稽核';
  if (agentType === AGENT_TYPES.SUMMARIZE_LEADER) return '批示总结';
  const custom = CustomAgentManager.getAgentById(agentType);
  if (custom) return custom.name;
  return 'AI问答';
}

/**
 * 更新页面标题显示当前智能体类型
 */
function updateHeaderTitle() {
  const titleEl = document.querySelector('.ai-title');
  if (!titleEl) return;
  const session = SessionManager.getCurrentSession();
  const agentType = session?.agentType || AGENT_TYPES.CHAT;
  titleEl.textContent = getAgentLabel(agentType);
}
