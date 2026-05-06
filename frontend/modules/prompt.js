/**
 * 提示词管理模块
 * 负责提示词模板的创建、编辑、删除等操作
 * @module prompt
 */

// ========== 内置提示词模板 ==========
const BUILT_IN_PROMPTS = [
  { id: 'builtin_1', title: '💻 解释代码', content: '请详细解释这段代码的功能、逻辑和关键实现细节：\n\n{{selection}}', icon: '💻', isBuiltIn: true },
  { id: 'builtin_2', title: '📝 总结文字', content: '请对以下内容进行简明扼要的总结，提取核心要点：\n\n{{selection}}', icon: '📝', isBuiltIn: true },
  { id: 'builtin_3', title: '✨ 润色文字', content: '请对以下文字进行润色和改写，使其更加流畅、专业、易读：\n\n{{selection}}', icon: '✨', isBuiltIn: true },
  { id: 'builtin_4', title: '🔍 稽核检查', content: '请对以下文字进行细致的稽核，检查是否存在错别字、语法问题、格式问题或表达不当的地方，并给出修改建议：\n\n{{selection}}', icon: '🔍', isBuiltIn: true },
  { id: 'builtin_5', title: '🌐 翻译中文', content: '请将以下内容翻译成中文，保持原意的同时力求自然流畅：\n\n{{selection}}', icon: '🌐', isBuiltIn: true },
  { id: 'builtin_6', title: '🇺🇸 翻译英文', content: '请将以下内容翻译成英文，保持原意的同时力求自然地道：\n\n{{selection}}', icon: '🇺🇸', isBuiltIn: true },
  { id: 'builtin_7', title: '🐛 查找 Bug', content: '请仔细检查以下代码，找出潜在的bug、安全漏洞或性能问题，并给出修复建议：\n\n{{selection}}', icon: '🐛', isBuiltIn: true },
  { id: 'builtin_8', title: '📋 生成文档', content: '请为以下代码或功能生成详细的文档说明，包括功能描述、参数说明、使用示例等：\n\n{{selection}}', icon: '📋', isBuiltIn: true },
  { id: 'builtin_9', title: '⚡ 优化代码', content: '请对以下代码进行优化，提升其性能、可读性或简化逻辑：\n\n{{selection}}', icon: '⚡', isBuiltIn: true },
  { id: 'builtin_10', title: '💡 提供建议', content: '请对以下内容进行分析，并给出专业、实用的建议或改进方案：\n\n{{selection}}', icon: '💡', isBuiltIn: true },
];

// 提示词模板列表已在 globals.js 中定义

const PromptManager = {
  /**
   * 获取所有提示词（内置 + 自定义）
   * @returns {Array} 提示词列表
   */
  getAllPrompts() {
    return [...BUILT_IN_PROMPTS, ...promptTemplates];
  },

  /**
   * 创建自定义提示词
   * @param {string} title - 提示词标题
   * @param {string} content - 提示词内容
   * @param {string} icon - 图标
   * @returns {Object} 创建的提示词对象
   */
  createCustomPrompt(title, content, icon = '💬') {
    const prompt = {
      id: 'custom_' + Date.now(),
      title: title.substring(0, 30),
      content: content,
      icon: icon,
      isBuiltIn: false,
      createdAt: Date.now()
    };
    promptTemplates.push(prompt);
    StorageManager.savePromptTemplates();
    return prompt;
  },

  /**
   * 更新提示词
   * @param {string} promptId - 提示词ID
   * @param {string} title - 新标题
   * @param {string} content - 新内容
   * @param {string} icon - 新图标
   * @returns {boolean} 是否更新成功
   */
  updatePrompt(promptId, title, content, icon) {
    const prompt = promptTemplates.find(p => p.id === promptId);
    if (prompt) {
      prompt.title = title.substring(0, 30);
      prompt.content = content;
      if (icon) prompt.icon = icon;
      StorageManager.savePromptTemplates();
      return true;
    }
    return false;
  },

  /**
   * 删除提示词
   * @param {string} promptId - 提示词ID
   * @returns {boolean} 是否删除成功
   */
  deletePrompt(promptId) {
    const index = promptTemplates.findIndex(p => p.id === promptId);
    if (index > -1) {
      promptTemplates.splice(index, 1);
      StorageManager.savePromptTemplates();
      return true;
    }
    return false;
  },

  /**
   * 根据ID获取提示词
   * @param {string} promptId - 提示词ID
   * @returns {Object|null} 提示词对象
   */
  getPromptById(promptId) {
    return BUILT_IN_PROMPTS.find(p => p.id === promptId) ||
           promptTemplates.find(p => p.id === promptId) ||
           null;
  },

  /**
   * 应用提示词（替换占位符）
   * @param {string} promptId - 提示词ID
   * @param {string} selection - 选中的文本
   * @returns {string|null} 替换后的提示词内容
   */
  applyPrompt(promptId, selection = '') {
    const prompt = this.getPromptById(promptId);
    if (prompt) {
      return prompt.content.replace(/\{\{selection\}\}/g, selection);
    }
    return null;
  }
};
