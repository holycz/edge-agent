/**
 * 弹窗管理模块
 * 负责各种弹窗的打开、关闭和交互
 * @module modals
 */

/**
 * 显示智能体选择弹窗
 */
async function showAgentSelectionModal() {
  const modal = document.getElementById('ai-agent-modal');
  if (!modal) return;

  modal.style.display = 'flex';
  
  await renderCustomAgentsInModal();
  await renderCustomWorkflowsInModal();

  const agentItems = modal.querySelectorAll('#ai-agent-list > .ai-agent-section:first-child .ai-agent-item');
  agentItems.forEach(item => {
    item.onclick = () => {
      const agentId = item.dataset.agent;
      selectAgentAndCreateSession(agentId, 'agent');
      closeAgentSelectionModal();
    };
  });

  const closeBtn = modal.querySelector('.ai-agent-modal-close');
  if (closeBtn) {
    closeBtn.onclick = closeAgentSelectionModal;
  }

  // 新增智能体按钮
  const addAgentBtn = document.getElementById('ai-agent-modal-add-btn');
  if (addAgentBtn) {
    addAgentBtn.onclick = () => {
      closeAgentSelectionModal();
      openAddAgentModal();
    };
  }

  // 新增工作流按钮
  const addWorkflowBtn = document.getElementById('ai-workflow-modal-add-btn');
  if (addWorkflowBtn) {
    addWorkflowBtn.onclick = () => {
      closeAgentSelectionModal();
      openAddWorkflowModal();
    };
  }

  modal.onclick = (e) => {
    if (e.target === modal) {
      closeAgentSelectionModal();
    }
  };
}

/**
 * 关闭智能体选择弹窗
 */
function closeAgentSelectionModal() {
  const modal = document.getElementById('ai-agent-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 渲染自定义智能体列表（在选择弹窗中）
 */
async function renderCustomAgentsInModal() {
  const customAgentList = document.getElementById('ai-custom-agent-list');
  const customAgentSection = document.getElementById('ai-custom-agent-section');
  
  if (!customAgentList || !customAgentSection) return;
  
  const agents = CustomAgentManager.getAll();
  
  if (agents.length === 0) {
    customAgentSection.style.display = 'none';
    customAgentList.innerHTML = '';
    return;
  }
  
  customAgentSection.style.display = 'block';
  customAgentList.innerHTML = agents.map(agent => {
    const streamLabel = agent.streamType === 'stream' ? '流式' : '非流式';
    const streamClass = agent.streamType === 'stream' ? 'ai-tag-stream' : 'ai-tag-json';
    return `
    <div class="ai-agent-item ai-agent-item-custom" data-agent="${agent.id}">
      <span class="ai-agent-icon">${agent.icon || '🤖'}</span>
      <div class="ai-agent-info">
        <div class="ai-agent-name">${agent.name} <span class="ai-agent-tag ${streamClass}">${streamLabel}</span></div>
        <div class="ai-agent-desc">${agent.desc || ''}</div>
      </div>
      <div class="ai-agent-actions">
        <button class="ai-agent-edit-btn" data-agent-id="${agent.id}" title="编辑">✏️</button>
        <button class="ai-agent-delete-btn" data-agent-id="${agent.id}" title="删除">🗑️</button>
      </div>
    </div>
    `;
  }).join('');
  
  // 绑定选择事件
  customAgentList.querySelectorAll('.ai-agent-item').forEach(item => {
    item.onclick = (e) => {
      // 如果点击的是编辑/删除按钮，不触发选择
      if (e.target.closest('.ai-agent-actions')) return;
      const agentId = item.dataset.agent;
      selectAgentAndCreateSession(agentId, 'agent');
      closeAgentSelectionModal();
    };
  });
  
  // 绑定编辑事件
  customAgentList.querySelectorAll('.ai-agent-edit-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const agentId = btn.dataset.agentId;
      openEditAgentModal(agentId);
    };
  });
  
  // 绑定删除事件
  customAgentList.querySelectorAll('.ai-agent-delete-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const agentId = btn.dataset.agentId;
      const agent = CustomAgentManager.getAgentById(agentId);
      if (agent && confirm(`确定要删除智能体「${agent.name}」吗？`)) {
        await CustomAgentManager.remove(agentId);
        await renderCustomAgentsInModal();
        showToast(`智能体「${agent.name}」已删除`);
      }
    };
  });
}

/**
 * 渲染自定义工作流列表（在选择弹窗中）
 */
async function renderCustomWorkflowsInModal() {
  const customWorkflowList = document.getElementById('ai-custom-workflow-list');
  const customWorkflowSection = document.getElementById('ai-custom-workflow-section');
  
  if (!customWorkflowList || !customWorkflowSection) return;
  
  const workflows = CustomWorkflowManager.getAll();
  
  if (workflows.length === 0) {
    customWorkflowSection.style.display = 'none';
    customWorkflowList.innerHTML = '';
    return;
  }
  
  customWorkflowSection.style.display = 'block';
  customWorkflowList.innerHTML = workflows.map(workflow => {
    const isCustom = CustomWorkflowManager.isCustomWorkflow(workflow.id);
    return `
    <div class="ai-agent-item ai-agent-item-custom ai-workflow-item" data-workflow="${workflow.id}">
      <span class="ai-agent-icon">${workflow.icon || '⚡'}</span>
      <div class="ai-agent-info">
        <div class="ai-agent-name">${workflow.name} <span class="ai-tag-workflow">工作流</span></div>
        <div class="ai-agent-desc">${workflow.desc || ''}</div>
      </div>
      ${isCustom ? `
      <div class="ai-agent-actions">
        <button class="ai-workflow-edit-btn" data-workflow-id="${workflow.id}" title="编辑">✏️</button>
        <button class="ai-workflow-delete-btn" data-workflow-id="${workflow.id}" title="删除">🗑️</button>
      </div>
      ` : ''}
    </div>
    `;
  }).join('');
  
  // 绑定选择事件
  customWorkflowList.querySelectorAll('.ai-workflow-item').forEach(item => {
    item.onclick = (e) => {
      // 如果点击的是编辑/删除按钮，不触发选择
      if (e.target.closest('.ai-agent-actions')) return;
      const workflowId = item.dataset.workflow;
      selectAgentAndCreateSession(workflowId, 'workflow');
      closeAgentSelectionModal();
    };
  });
  
  // 绑定编辑事件
  customWorkflowList.querySelectorAll('.ai-workflow-edit-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const workflowId = btn.dataset.workflowId;
      openEditWorkflowModal(workflowId);
    };
  });
  
  // 绑定删除事件
  customWorkflowList.querySelectorAll('.ai-workflow-delete-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const workflowId = btn.dataset.workflowId;
      const workflow = CustomWorkflowManager.getWorkflowById(workflowId);
      if (workflow && confirm(`确定要删除工作流「${workflow.name}」吗？`)) {
        await CustomWorkflowManager.remove(workflowId);
        await renderCustomWorkflowsInModal();
        showToast(`工作流「${workflow.name}」已删除`);
      }
    };
  });
}

/**
 * 选择智能体/工作流并创建会话
 * @param {string} id - 智能体ID或工作流ID
 * @param {string} dialogType - 对话类型：'agent' 或 'workflow'
 */
function selectAgentAndCreateSession(id, dialogType = 'agent') {
  messagesContainer.innerHTML = '';
  conversationHistory = [];
  
  let label;
  if (dialogType === 'workflow') {
    label = getWorkflowLabel(id);
  } else {
    label = getAgentLabel(id);
  }
  
  SessionManager.createSession(label, id, dialogType);
  
  renderSessionList();
  updateHeaderTitle();
  inputTextarea.focus();
  
  // 新建会话时自动获取页面上下文（遵守useContext开关）
  if (config.useContext) {
    autoFetchPageContext();
  }
  
  showToast(`已创建${label}会话`);
}

/**
 * 打开新增智能体弹窗
 */
function openAddAgentModal() {
  const modal = document.getElementById('ai-add-agent-modal');
  if (!modal) return;

  document.getElementById('ai-add-agent-name').value = '';
  document.getElementById('ai-add-agent-id').value = '';
  document.getElementById('ai-add-agent-key').value = '';
  document.getElementById('ai-add-agent-icon').value = '🤖';
  document.getElementById('ai-add-agent-desc').value = '';
  document.getElementById('ai-add-agent-verify-status').textContent = '';
  document.getElementById('ai-add-agent-verify-status').className = 'ai-add-agent-verify-status';
  
  // 重置为新增模式
  delete modal.dataset.editingId;
  const titleEl = modal.querySelector('.ai-add-agent-modal-header span:first-child');
  if (titleEl) titleEl.textContent = '新增智能体';
  const verifyBtn = document.getElementById('ai-add-agent-verify-btn');
  if (verifyBtn) verifyBtn.textContent = '✅ 验证并保存';
  
  // 启用ID输入（新增时可编辑）
  document.getElementById('ai-add-agent-id').disabled = false;

  modal.style.display = 'flex';
}

/**
 * 打开编辑智能体弹窗
 * @param {string} agentId - 智能体ID
 */
function openEditAgentModal(agentId) {
  const agent = CustomAgentManager.getAgentById(agentId);
  if (!agent) return;

  const modal = document.getElementById('ai-add-agent-modal');
  if (!modal) return;

  document.getElementById('ai-add-agent-name').value = agent.name || '';
  document.getElementById('ai-add-agent-id').value = agent.id || '';
  document.getElementById('ai-add-agent-key').value = agent.key || '';
  document.getElementById('ai-add-agent-icon').value = agent.icon || '🤖';
  document.getElementById('ai-add-agent-desc').value = agent.desc || '';
  document.getElementById('ai-add-agent-verify-status').textContent = '';
  document.getElementById('ai-add-agent-verify-status').className = 'ai-add-agent-verify-status';
  
  // 设置为编辑模式
  modal.dataset.editingId = agentId;
  const titleEl = modal.querySelector('.ai-add-agent-modal-header span:first-child');
  if (titleEl) titleEl.textContent = '编辑智能体';
  const verifyBtn = document.getElementById('ai-add-agent-verify-btn');
  if (verifyBtn) verifyBtn.textContent = '✅ 验证并更新';
  
  // 禁用ID输入（编辑时不可修改ID）
  document.getElementById('ai-add-agent-id').disabled = true;

  modal.style.display = 'flex';
}

/**
 * 关闭新增智能体弹窗
 */
function closeAddAgentModal() {
  const modal = document.getElementById('ai-add-agent-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 处理新增/编辑智能体验证
 */
async function handleAddAgentVerify() {
  const modal = document.getElementById('ai-add-agent-modal');
  const isEditing = modal.dataset.editingId;
  
  const name = document.getElementById('ai-add-agent-name').value.trim();
  const agentId = document.getElementById('ai-add-agent-id').value.trim();
  const agentKey = document.getElementById('ai-add-agent-key').value.trim();
  const icon = document.getElementById('ai-add-agent-icon').value.trim() || '🤖';
  const desc = document.getElementById('ai-add-agent-desc').value.trim();
  const statusEl = document.getElementById('ai-add-agent-verify-status');
  const verifyBtn = document.getElementById('ai-add-agent-verify-btn');

  if (!name) {
    statusEl.textContent = '请输入智能体名称';
    statusEl.className = 'ai-add-agent-verify-status error';
    return;
  }
  if (!agentId) {
    statusEl.textContent = '请输入智能体ID';
    statusEl.className = 'ai-add-agent-verify-status error';
    return;
  }
  if (!agentKey) {
    statusEl.textContent = '请输入智能体Key';
    statusEl.className = 'ai-add-agent-verify-status error';
    return;
  }

  // 新增模式下检查ID是否已存在
  if (!isEditing && CustomAgentManager.getAgentById(agentId)) {
    statusEl.textContent = '该智能体ID已存在';
    statusEl.className = 'ai-add-agent-verify-status error';
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = '⏳ 验证中...';
  statusEl.textContent = '正在验证智能体...';
  statusEl.className = 'ai-add-agent-verify-status verifying';

  const result = await verifyAgent(agentId, agentKey);

  verifyBtn.disabled = false;
  verifyBtn.textContent = isEditing ? '✅ 验证并更新' : '✅ 验证并保存';

  if (result.success) {
    const streamLabel = result.streamType === 'stream' ? '流式' : result.streamType === 'json' ? 'JSON' : '未知';
    statusEl.textContent = `${result.message}（${streamLabel}响应）`;
    statusEl.className = 'ai-add-agent-verify-status success';

    const agentData = {
      id: agentId,
      name: name,
      key: agentKey,
      icon: icon,
      desc: desc,
      streamType: result.streamType || 'unknown',
      createdAt: Date.now(),
    };

    if (isEditing) {
      // 编辑模式：删除旧的再添加新的
      await CustomAgentManager.remove(isEditing);
      await CustomAgentManager.add(agentData);
      setTimeout(() => {
        closeAddAgentModal();
        showToast(`智能体「${name}」已更新`);
      }, 800);
    } else {
      // 新增模式
      await CustomAgentManager.add(agentData);
      setTimeout(() => {
        closeAddAgentModal();
        showToast(`智能体「${name}」已添加`);
      }, 800);
    }
  } else {
    statusEl.textContent = result.message;
    statusEl.className = 'ai-add-agent-verify-status error';
  }
}

/**
 * 打开管理智能体弹窗
 */
function openManageAgentModal() {
  const modal = document.getElementById('ai-manage-agent-modal');
  if (!modal) return;

  renderManageAgentList();
  modal.style.display = 'flex';
}

/**
 * 关闭管理智能体弹窗
 */
function closeManageAgentModal() {
  const modal = document.getElementById('ai-manage-agent-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 渲染管理智能体列表
 */
function renderManageAgentList() {
  const listEl = document.getElementById('ai-manage-agent-list');
  const emptyEl = document.getElementById('ai-manage-agent-empty');
  if (!listEl) return;

  const agents = CustomAgentManager.getAll();

  if (agents.length === 0) {
    listEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  listEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = agents.map(agent => {
    const streamLabel = agent.streamType === 'stream' ? '流式' : '非流式';
    const streamClass = agent.streamType === 'stream' ? 'ai-tag-stream' : 'ai-tag-json';
    return `
    <div class="ai-manage-agent-item" data-agent-id="${agent.id}">
      <div class="ai-manage-agent-info">
        <span class="ai-manage-agent-icon">${agent.icon || '🤖'}</span>
        <div class="ai-manage-agent-detail">
          <div class="ai-manage-agent-name">${agent.name} <span class="ai-agent-tag ${streamClass}">${streamLabel}</span></div>
          <div class="ai-manage-agent-id">ID: ${agent.id}</div>
          ${agent.desc ? `<div class="ai-manage-agent-desc">${agent.desc}</div>` : ''}
        </div>
      </div>
      <button class="ai-manage-agent-delete" data-agent-id="${agent.id}">🗑️ 删除</button>
    </div>
    `;
  }).join('');

  listEl.querySelectorAll('.ai-manage-agent-delete').forEach(btn => {
    btn.onclick = async () => {
      const agentId = btn.dataset.agentId;
      const agent = CustomAgentManager.getAgentById(agentId);
      if (!agent) return;
      if (confirm(`确定要删除智能体「${agent.name}」吗？\n删除后使用该智能体的会话将无法继续对话。`)) {
        await CustomAgentManager.remove(agentId);
        renderManageAgentList();
        showToast(`智能体「${agent.name}」已删除`);
      }
    };
  });
}

/**
 * 打开配置面板
 */
function openConfigPanel() {
  refreshConfigPanel();
  configPanel.style.display = 'flex';
}

/**
 * 关闭配置面板
 */
function closeConfigPanel() {
  configPanel.style.display = 'none';
}

/**
 * 刷新配置面板
 */
function refreshConfigPanel() {
  const enableDoubleClickEl = document.getElementById('ai-enable-double-click');
  if (enableDoubleClickEl) {
    enableDoubleClickEl.checked = config.enableDoubleClick === true;
  }

  const maxHistoryRoundsEl = document.getElementById('ai-max-history-rounds');
  if (maxHistoryRoundsEl) {
    maxHistoryRoundsEl.value = config.maxHistoryRounds || DEFAULT_CONFIG.maxHistoryRounds;
  }

  const myNameEl = document.getElementById('ai-my-name');
  if (myNameEl) {
    myNameEl.value = config.myName || '';
  }

  const otherInfoEl = document.getElementById('ai-other-info');
  if (otherInfoEl) {
    otherInfoEl.value = config.otherInfo || '';
  }
}

// ========== 工作流管理弹窗 ==========

/**
 * 打开新增工作流弹窗
 */
function openAddWorkflowModal() {
  const modal = document.getElementById('ai-add-workflow-modal');
  if (!modal) return;

  document.getElementById('ai-add-workflow-name').value = '';
  document.getElementById('ai-add-workflow-endpoint').value = '';
  document.getElementById('ai-add-workflow-token').value = '';
  document.getElementById('ai-add-workflow-icon').value = '⚡';
  document.getElementById('ai-add-workflow-desc').value = '';
  document.getElementById('ai-add-workflow-verify-status').textContent = '';
  document.getElementById('ai-add-workflow-verify-status').className = 'ai-add-workflow-verify-status';
  
  // 重置为新增模式
  delete modal.dataset.editingId;
  const titleEl = modal.querySelector('.ai-add-workflow-modal-header span:first-child');
  if (titleEl) titleEl.textContent = '新增工作流';
  const verifyBtn = document.getElementById('ai-add-workflow-verify-btn');
  if (verifyBtn) verifyBtn.textContent = '✅ 验证并保存';
  
  // 启用端点ID输入（新增时可编辑）
  document.getElementById('ai-add-workflow-endpoint').disabled = false;

  modal.style.display = 'flex';
}

/**
 * 打开编辑工作流弹窗
 * @param {string} workflowId - 工作流ID
 */
function openEditWorkflowModal(workflowId) {
  const workflow = CustomWorkflowManager.getWorkflowById(workflowId);
  if (!workflow || !CustomWorkflowManager.isCustomWorkflow(workflowId)) return;

  const modal = document.getElementById('ai-add-workflow-modal');
  if (!modal) return;

  document.getElementById('ai-add-workflow-name').value = workflow.name || '';
  document.getElementById('ai-add-workflow-endpoint').value = workflow.endpoint_id || '';
  document.getElementById('ai-add-workflow-token').value = workflow.auth_token || '';
  document.getElementById('ai-add-workflow-icon').value = workflow.icon || '⚡';
  document.getElementById('ai-add-workflow-desc').value = workflow.desc || '';
  document.getElementById('ai-add-workflow-verify-status').textContent = '';
  document.getElementById('ai-add-workflow-verify-status').className = 'ai-add-workflow-verify-status';
  
  // 设置为编辑模式
  modal.dataset.editingId = workflowId;
  const titleEl = modal.querySelector('.ai-add-workflow-modal-header span:first-child');
  if (titleEl) titleEl.textContent = '编辑工作流';
  const verifyBtn = document.getElementById('ai-add-workflow-verify-btn');
  if (verifyBtn) verifyBtn.textContent = '✅ 验证并更新';
  
  // 禁用端点ID输入（编辑时不可修改ID）
  document.getElementById('ai-add-workflow-endpoint').disabled = true;

  modal.style.display = 'flex';
}

/**
 * 关闭新增工作流弹窗
 */
function closeAddWorkflowModal() {
  const modal = document.getElementById('ai-add-workflow-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 处理新增/编辑工作流验证
 */
async function handleAddWorkflowVerify() {
  const modal = document.getElementById('ai-add-workflow-modal');
  const isEditing = modal.dataset.editingId;
  
  const name = document.getElementById('ai-add-workflow-name').value.trim();
  const endpointId = document.getElementById('ai-add-workflow-endpoint').value.trim();
  const authToken = document.getElementById('ai-add-workflow-token').value.trim();
  const icon = document.getElementById('ai-add-workflow-icon').value.trim() || '⚡';
  const desc = document.getElementById('ai-add-workflow-desc').value.trim();
  const statusEl = document.getElementById('ai-add-workflow-verify-status');
  const verifyBtn = document.getElementById('ai-add-workflow-verify-btn');

  if (!name) {
    statusEl.textContent = '请输入工作流名称';
    statusEl.className = 'ai-add-workflow-verify-status error';
    return;
  }
  if (!endpointId) {
    statusEl.textContent = '请输入工作流端点ID';
    statusEl.className = 'ai-add-workflow-verify-status error';
    return;
  }
  if (!authToken) {
    statusEl.textContent = '请输入AuthToken';
    statusEl.className = 'ai-add-workflow-verify-status error';
    return;
  }

  // 新增模式下检查端点ID是否已存在
  if (!isEditing && CustomWorkflowManager.getWorkflowById(endpointId)) {
    statusEl.textContent = '该工作流端点ID已存在';
    statusEl.className = 'ai-add-workflow-verify-status error';
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = '⏳ 验证中...';
  statusEl.textContent = '正在验证工作流...';
  statusEl.className = 'ai-add-workflow-verify-status verifying';

  const result = await verifyWorkflow(endpointId, authToken);

  verifyBtn.disabled = false;
  verifyBtn.textContent = isEditing ? '✅ 验证并更新' : '✅ 验证并保存';

  if (result.success) {
    statusEl.textContent = result.message;
    statusEl.className = 'ai-add-workflow-verify-status success';

    const workflowData = {
      id: endpointId,
      name: name,
      endpoint_id: endpointId,
      auth_token: authToken,
      icon: icon,
      desc: desc,
      createdAt: Date.now(),
    };

    if (isEditing) {
      // 编辑模式：删除旧的再添加新的
      await CustomWorkflowManager.remove(isEditing);
      await CustomWorkflowManager.add(workflowData);
      setTimeout(() => {
        closeAddWorkflowModal();
        showToast(`工作流「${name}」已更新`);
      }, 800);
    } else {
      // 新增模式
      await CustomWorkflowManager.add(workflowData);
      setTimeout(() => {
        closeAddWorkflowModal();
        showToast(`工作流「${name}」已添加`);
      }, 800);
    }
  } else {
    statusEl.textContent = result.message;
    statusEl.className = 'ai-add-workflow-verify-status error';
  }
}

/**
 * 打开管理工作流弹窗
 */
function openManageWorkflowModal() {
  const modal = document.getElementById('ai-manage-workflow-modal');
  if (!modal) return;

  renderManageWorkflowList();
  modal.style.display = 'flex';
}

/**
 * 关闭管理工作流弹窗
 */
function closeManageWorkflowModal() {
  const modal = document.getElementById('ai-manage-workflow-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 渲染管理工作流列表
 */
function renderManageWorkflowList() {
  const listEl = document.getElementById('ai-manage-workflow-list');
  const emptyEl = document.getElementById('ai-manage-workflow-empty');
  if (!listEl) return;

  const workflows = CustomWorkflowManager.getCustom();

  if (workflows.length === 0) {
    listEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  listEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = workflows.map(workflow => {
    return `
    <div class="ai-manage-agent-item" data-workflow-id="${workflow.id}">
      <div class="ai-manage-agent-info">
        <span class="ai-manage-agent-icon">${workflow.icon || '⚡'}</span>
        <div class="ai-manage-agent-detail">
          <div class="ai-manage-agent-name">${workflow.name} <span class="ai-tag-workflow">工作流</span></div>
          <div class="ai-manage-agent-id">端点ID: ${workflow.endpoint_id}</div>
          ${workflow.desc ? `<div class="ai-manage-agent-desc">${workflow.desc}</div>` : ''}
        </div>
      </div>
      <button class="ai-manage-agent-delete" data-workflow-id="${workflow.id}">🗑️ 删除</button>
    </div>
    `;
  }).join('');

  listEl.querySelectorAll('.ai-manage-agent-delete').forEach(btn => {
    btn.onclick = async () => {
      const workflowId = btn.dataset.workflowId;
      const workflow = CustomWorkflowManager.getWorkflowById(workflowId);
      if (!workflow) return;
      if (confirm(`确定要删除工作流「${workflow.name}」吗？\n删除后使用该工作流的会话将无法继续对话。`)) {
        await CustomWorkflowManager.remove(workflowId);
        renderManageWorkflowList();
        showToast(`工作流「${workflow.name}」已删除`);
      }
    };
  });
}
