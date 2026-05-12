/**
 * 工作流管理模块
 * 负责工作流的配置、验证和管理
 * @module workflow-manager
 */

// ========== 工作流ID常量（内置工作流） ==========
const WORKFLOW_IDS = {
  // 内置工作流示例（可根据需要添加）
  // LIVE_SCRIPT_FIX: 'fe49c25aba4a4b23b5a9c679286a68e5',  // 直播话术修复
  // SELLING_POINT: '90ca11ab78074e61abc3c0ab8f7f4483',     // 卖点提取
};

// 工作流类型别名（向后兼容）
const WORKFLOW_TYPES = WORKFLOW_IDS;

// ========== 内置工作流配置 ==========
const BUILTIN_WORKFLOWS = [
  // 内置工作流示例（可根据需要添加）
  // {
  //   id: 'fe49c25aba4a4b23b5a9c679286a68e5',
  //   name: '直播话术修复',
  //   endpoint_id: 'fe49c25aba4a4b23b5a9c679286a68e5',
  //   icon: '🎤',
  //   desc: '修复和优化直播话术',
  //   auth_token: '950fcd3e9e7d4f4ba344158fb854ddc8',
  // },
  // {
  //   id: '90ca11ab78074e61abc3c0ab8f7f4483',
  //   name: '卖点提取',
  //   endpoint_id: '90ca11ab78074e61abc3c0ab8f7f4483',
  //   icon: '💡',
  //   desc: '从内容中提取关键卖点',
  //   auth_token: '5a0506aee0df4dbe8375a76f1fe420ee',
  // },
];

// ========== 自定义工作流管理 ==========
// customWorkflows 已在 globals.js 中定义

const CustomWorkflowManager = {
  /**
   * 加载自定义工作流列表
   */
  async load() {
    try {
      const data = await chrome.storage.local.get(['customWorkflows']);
      customWorkflows = data.customWorkflows || [];
      console.log('[CustomWorkflowManager] 加载自定义工作流:', customWorkflows.length);
    } catch (e) {
      console.error('[CustomWorkflowManager] 加载失败:', e);
      customWorkflows = [];
    }
  },

  /**
   * 保存自定义工作流列表
   */
  async save() {
    try {
      await chrome.storage.local.set({ customWorkflows });
      console.log('[CustomWorkflowManager] 保存成功:', customWorkflows.length);
    } catch (e) {
      console.error('[CustomWorkflowManager] 保存失败:', e);
    }
  },

  /**
   * 添加自定义工作流
   * @param {Object} workflow - 工作流配置
   */
  add(workflow) {
    customWorkflows.push(workflow);
    return this.save();
  },

  /**
   * 删除自定义工作流
   * @param {string} workflowId - 工作流ID
   */
  remove(workflowId) {
    const index = customWorkflows.findIndex(w => w.id === workflowId);
    if (index > -1) {
      customWorkflows.splice(index, 1);
      return this.save();
    }
    return Promise.resolve();
  },

  /**
   * 根据ID获取工作流
   * @param {string} workflowId - 工作流ID
   * @returns {Object|null} 工作流配置
   */
  getWorkflowById(workflowId) {
    // 先查找自定义工作流
    const custom = customWorkflows.find(w => w.id === workflowId);
    if (custom) return custom;
    // 再查找内置工作流
    return BUILTIN_WORKFLOWS.find(w => w.id === workflowId) || null;
  },

  /**
   * 获取所有工作流（内置 + 自定义）
   * @returns {Array} 工作流列表
   */
  getAll() {
    return [...BUILTIN_WORKFLOWS, ...customWorkflows];
  },

  /**
   * 获取所有自定义工作流
   * @returns {Array} 自定义工作流列表
   */
  getCustom() {
    return customWorkflows;
  },

  /**
   * 判断是否为自定义工作流
   * @param {string} workflowId - 工作流ID
   * @returns {boolean}
   */
  isCustomWorkflow(workflowId) {
    return customWorkflows.some(w => w.id === workflowId);
  },

  /**
   * 判断是否为内置工作流
   * @param {string} workflowId - 工作流ID
   * @returns {boolean}
   */
  isBuiltinWorkflow(workflowId) {
    return BUILTIN_WORKFLOWS.some(w => w.id === workflowId);
  },

  /**
   * 获取工作流的 AuthToken
   * @param {string} workflowId - 工作流ID
   * @returns {string|null} AuthToken
   */
  getAuthToken(workflowId) {
    const workflow = this.getWorkflowById(workflowId);
    return workflow ? workflow.auth_token : null;
  },

  /**
   * 获取工作流的 endpoint_id
   * @param {string} workflowId - 工作流ID
   * @returns {string|null} endpoint_id
   */
  getEndpointId(workflowId) {
    const workflow = this.getWorkflowById(workflowId);
    return workflow ? workflow.endpoint_id : null;
  }
};

/**
 * 验证工作流配置
 * @param {string} endpointId - 工作流端点ID
 * @param {string} authToken - 认证令牌
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifyWorkflow(endpointId, authToken) {
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

    const response = await fetch(`${backendUrl}/sxzypt/scene_gateway/sse/${endpointId}`, {
      method: 'POST',
      headers: {
        'AuthToken': authToken,
      },
      body: new URLSearchParams({
        keyword: '测试',
        requestId: Date.now().toString() + Math.random().toString().substr(2, 6),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return { success: false, message: '验证失败：AuthToken无效或已过期' };
    }

    if (response.status === 404) {
      return { success: false, message: '验证失败：工作流端点不存在' };
    }

    if (response.status === 400) {
      return { success: false, message: '验证失败：请求参数错误' };
    }

    if (response.status === 503) {
      return { success: false, message: '验证失败：后端服务未就绪' };
    }

    if (response.ok || response.status === 200) {
      return { success: true, message: '验证成功' };
    }

    return { success: false, message: `验证失败：服务返回状态码 ${response.status}` };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { success: false, message: '验证超时，请检查网络连接' };
    }
    return { success: false, message: `连接失败: ${e.message}` };
  }
}

/**
 * 获取工作流显示标签
 * @param {string} workflowId - 工作流ID
 * @returns {string} 工作流显示名称
 */
function getWorkflowLabel(workflowId) {
  const workflow = CustomWorkflowManager.getWorkflowById(workflowId);
  return workflow ? workflow.name : '未知工作流';
}
