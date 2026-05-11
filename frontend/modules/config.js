/**
 * 配置管理模块
 * 负责加载、保存和管理插件配置
 * @module config
 */

// ========== 默认配置 ==========
const DEFAULT_CONFIG = {
  useContext: true,
  contextLength: 20000,
  maxTotalChars: 100000,
  myName: '',
  otherInfo: '',
};

// 当前配置（全局可访问）
let config = { ...DEFAULT_CONFIG };

/**
 * 加载配置
 * 从 chrome.storage.sync 读取配置
 */
async function loadConfig() {
  try {
    const stored = await chrome.storage.sync.get([
      'useContext', 'contextLength',
      'maxTotalChars', 'myName', 'otherInfo'
    ]);

    config = {
      ...DEFAULT_CONFIG,
      useContext: stored.useContext ?? DEFAULT_CONFIG.useContext,
      contextLength: stored.contextLength ?? DEFAULT_CONFIG.contextLength,
      maxTotalChars: stored.maxTotalChars ?? DEFAULT_CONFIG.maxTotalChars,
      myName: stored.myName ?? DEFAULT_CONFIG.myName,
      otherInfo: stored.otherInfo ?? DEFAULT_CONFIG.otherInfo,
    };

    console.log("[Config] 配置已从本地存储加载");
  } catch (e) {
    console.log("[Config] 从本地存储加载配置失败，使用默认配置:", e.message);
  }
}

/**
 * 保存配置
 * @param {Object} newConfig - 新配置项
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    await chrome.storage.sync.set(newConfig);
    console.log("[Config] 配置已保存到本地存储");
    return true;
  } catch (e) {
    console.error("[Config] 保存配置失败:", e);
    return false;
  }
}

/**
 * 检查后端服务状态
 * @returns {Promise<{available: boolean, message: string}>}
 */
async function checkBackendStatus() {
  try {
    const backendUrl = await getBackendUrl();
    const response = await fetch(backendUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 0) {
      return { available: true, message: '后端服务正常' };
    }
    return { available: false, message: '后端服务异常' };
  } catch (e) {
    return { available: false, message: '后端连接失败' };
  }
}
