/**
 * 前端消息类型常量定义
 * 统一管理所有消息类型，避免魔术字符串
 * @module constants
 */

// ========== Chrome Runtime 消息类型 ==========
const MESSAGE_TYPES = {
  // 侧边栏相关
  OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
  TOGGLE_SIDEPANEL: 'TOGGLE_SIDEPANEL',
  GET_BACKEND_URL: 'GET_BACKEND_URL',
  
  // 流式请求相关
  API_STREAM_REQUEST: 'API_STREAM_REQUEST',
  ABORT_STREAM: 'ABORT_STREAM',
  STREAM_CHUNK: 'STREAM_CHUNK',
  STREAM_DONE: 'STREAM_DONE',
  STREAM_ABORTED: 'STREAM_ABORTED',
  STREAM_ERROR: 'STREAM_ERROR',
  
  // 页面内容相关
  GET_SELECTED_TEXT: 'GET_SELECTED_TEXT',
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  GET_APPROVAL_PAGE_CONTENT: 'GET_APPROVAL_PAGE_CONTENT',
  PAGE_CONTENT_CHANGED: 'PAGE_CONTENT_CHANGED',
  
  // 文件上传相关
  UPLOAD_FILE: 'UPLOAD_FILE',
};

// ========== 智能体ID常量 ==========
const AGENT_IDS = {
  // 内置智能体
  CHAT: 'ddf09cedfcbd4d188adc528461a91392',           // AI问答（默认）
  SUMMARIZE_PAGE: 'ac32fe9431b1444f8ac3cdf42901024e',  // 网页总结
  REWRITE: 'bbad433949b64fab8de7f1a26d6ab56c',       // 文本润色
  PROOFREAD: 'a03444b0e45d416fbc0a494b46a2c55b',     // 文本稽核
  SUMMARIZE_LEADER: '205a099ade6a4c4fb454e11f96ee6a18', // 公文批示总结
};

// ========== 右键菜单ID ==========
const MENU_IDS = {
  AI_ASK: 'ai-ask',
  AI_SUMMARIZE: 'ai-summarize',
  AI_REWRITE: 'ai-rewrite',
  AI_PROOFREAD: 'ai-proofread',
  AI_OPEN_PANEL: 'ai-open-panel',
  AI_SUMMARIZE_PAGE: 'ai-summarize-page',
  AI_SUMMARIZE_LEADER: 'ai-summarize-leader',
  AI_PAGE_REWRITE: 'ai-page-rewrite',
  AI_PAGE_PROOFREAD: 'ai-page-proofread',
  AI_PAGE_ASK: 'ai-page-ask',
};

// ========== 操作类型 ==========
const ACTION_TYPES = {
  ASK: 'ask',
  OPEN_PANEL: 'openPanel',
  SUMMARIZE_PAGE: 'summarizePage',
  SUMMARIZE_LEADER_COMMENTS: 'summarizeLeaderComments',
  PAGE_REWRITE: 'pageRewrite',
  PAGE_PROOFREAD: 'pageProofread',
  PAGE_ASK: 'pageAsk',
  REWRITE: 'rewrite',
  PROOFREAD: 'proofread',
  SUMMARIZE: 'summarize',
};

// ========== 流式内容类型 ==========
const STREAM_CONTENT_TYPES = {
  THINK_START: 'think_start',
  THINK: 'think',
  THINK_END: 'think_end',
  CONTENT: 'content',
};

// ========== 默认配置 ==========
const DEFAULT_CONFIG = {
  useContext: true,
  myName: '',
  otherInfo: '',
};

// ========== 特殊页面排除模式 ==========
const EXCLUDED_PAGE_PATTERNS = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'file://',
  'about:',
  'data:',
];

// ========== API端点 ==========
const API_ENDPOINTS = {
  AGENT: '/sxzypt/py_talkHub/agent/agent',
  UPLOAD: '/sxzypt/aistar_server/agent/upload',
};

// ========== 文件限制 ==========
const FILE_LIMITS = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_HISTORY_RESPONSE_LENGTH: 8000,
};

// ========== 错误消息常量 ==========
const ERROR_MESSAGES = {
  NO_APPROVAL_CONTENT: '未在当前页面找到公文正文或领导批示内容，请确保您正在浏览OA审批页面。',
  NO_PAGE_CONTENT: '无法获取当前网页内容，请确保您正在浏览一个可访问的网页。',
};

// ========== 导出（如果支持模块化） ==========
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MESSAGE_TYPES,
    AGENT_IDS,
    MENU_IDS,
    ACTION_TYPES,
    STREAM_CONTENT_TYPES,
    DEFAULT_CONFIG,
    EXCLUDED_PAGE_PATTERNS,
    API_ENDPOINTS,
    FILE_LIMITS,
  };
}
