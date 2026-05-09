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

  const agentItems = modal.querySelectorAll('#ai-agent-list > .ai-agent-section:first-child .ai-agent-item');
  agentItems.forEach(item => {
    item.onclick = () => {
      const agentId = item.dataset.agent;
      selectAgentAndCreateSession(agentId);
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
  customAgentList.innerHTML = agents.map(agent => `
    <div class="ai-agent-item ai-agent-item-custom" data-agent="${agent.id}">
      <span class="ai-agent-icon">${agent.icon || '🤖'}</span>
      <div class="ai-agent-info">
        <div class="ai-agent-name">${agent.name}</div>
        <div class="ai-agent-desc">${agent.desc || ''}</div>
      </div>
      <div class="ai-agent-actions">
        <button class="ai-agent-edit-btn" data-agent-id="${agent.id}" title="编辑">✏️</button>
        <button class="ai-agent-delete-btn" data-agent-id="${agent.id}" title="删除">🗑️</button>
      </div>
    </div>
  `).join('');
  
  // 绑定选择事件
  customAgentList.querySelectorAll('.ai-agent-item').forEach(item => {
    item.onclick = (e) => {
      // 如果点击的是编辑/删除按钮，不触发选择
      if (e.target.closest('.ai-agent-actions')) return;
      const agentId = item.dataset.agent;
      selectAgentAndCreateSession(agentId);
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
 * 选择智能体并创建会话
 * @param {string} agentId - 智能体ID
 */
function selectAgentAndCreateSession(agentId) {
  messagesContainer.innerHTML = '';
  conversationHistory = [];
  
  const agentLabel = getAgentLabel(agentId);
  SessionManager.createSession(agentLabel, agentId);
  
  renderSessionList();
  updateHeaderTitle();
  inputTextarea.focus();
  
  // 新建会话时自动获取页面上下文（遵守useContext开关）
  if (config.useContext) {
    autoFetchPageContext();
  }
  
  showToast(`已创建${agentLabel}会话`);
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
    statusEl.textContent = result.message;
    statusEl.className = 'ai-add-agent-verify-status success';

    if (isEditing) {
      // 编辑模式：删除旧的再添加新的
      await CustomAgentManager.remove(isEditing);
      await CustomAgentManager.add({
        id: agentId,
        name: name,
        key: agentKey,
        icon: icon,
        desc: desc,
        createdAt: Date.now(),
      });
      setTimeout(() => {
        closeAddAgentModal();
        showToast(`智能体「${name}」已更新`);
      }, 800);
    } else {
      // 新增模式
      await CustomAgentManager.add({
        id: agentId,
        name: name,
        key: agentKey,
        icon: icon,
        desc: desc,
        createdAt: Date.now(),
      });
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

  listEl.innerHTML = agents.map(agent => `
    <div class="ai-manage-agent-item" data-agent-id="${agent.id}">
      <div class="ai-manage-agent-info">
        <span class="ai-manage-agent-icon">${agent.icon || '🤖'}</span>
        <div class="ai-manage-agent-detail">
          <div class="ai-manage-agent-name">${agent.name}</div>
          <div class="ai-manage-agent-id">ID: ${agent.id}</div>
          ${agent.desc ? `<div class="ai-manage-agent-desc">${agent.desc}</div>` : ''}
        </div>
      </div>
      <button class="ai-manage-agent-delete" data-agent-id="${agent.id}">🗑️ 删除</button>
    </div>
  `).join('');

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
