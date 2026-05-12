/**
 * 全局变量管理模块
 * 所有跨模块共享的全局变量在此统一声明
 * @module globals
 */

// ========== 常量定义 ==========
const MESSAGE_TYPES = {
  OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
  TOGGLE_SIDEPANEL: 'TOGGLE_SIDEPANEL',
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  GET_APPROVAL_PAGE_CONTENT: 'GET_APPROVAL_PAGE_CONTENT',
  PAGE_CONTENT_CHANGED: 'PAGE_CONTENT_CHANGED',
  GET_BACKEND_URL: 'GET_BACKEND_URL',
  API_STREAM_REQUEST: 'API_STREAM_REQUEST',
  ABORT_STREAM: 'ABORT_STREAM',
  STREAM_CHUNK: 'STREAM_CHUNK',
  STREAM_DONE: 'STREAM_DONE',
  STREAM_ABORTED: 'STREAM_ABORTED',
  STREAM_ERROR: 'STREAM_ERROR',
  UPLOAD_FILE: 'UPLOAD_FILE',
};

const STREAM_CONTENT_TYPES = {
  THINK_START: 'think_start',
  THINK: 'think',
  THINK_END: 'think_end',
  CONTENT: 'content',
};

const API_ENDPOINTS = {
  AGENT: '/sxzypt/py_talkHub/agent/agent',
  WORKFLOW: '/sxzypt/scene_gateway', // 工作流端点前缀
  WORKFLOW_SSE: '/sxzypt/scene_gateway/sse', // 工作流SSE端点前缀
};

const EXCLUDED_PAGE_PATTERNS = [
  'chrome://', 'chrome-extension://', 'edge://', 'file://', 'about:', 'data:'
];

const FILE_LIMITS = {
  MAX_SIZE: 50 * 1024 * 1024,
  MAX_HISTORY_RESPONSE_LENGTH: 8000,
};

const ERROR_MESSAGES = {
  NO_APPROVAL_CONTENT: '未在当前页面找到公文正文或领导批示内容，请确保您正在浏览OA审批页面。',
  NO_PAGE_CONTENT: '无法获取当前网页内容，请确保您正在浏览一个可访问的网页。',
};

// ========== DOM元素引用 ==========
let messagesContainer = null;
let inputTextarea = null;
let sendButton = null;
let configPanel = null;

// ========== 会话状态 ==========
let sessions = [];
let currentSessionId = null;
let conversationHistory = [];
let isProcessingPending = false;

// ========== 流式请求状态 ==========
let isStreaming = false;
let currentStreamSessionId = null;
let currentBotBubble = null;
let currentThinkBubble = null;
let currentThinkContainer = null;
let accumulatedText = '';
let accumulatedThinkText = '';
let isInThinkBlock = false;
let streamStartTime = 0;

// ========== 文件上传状态 ==========
let uploadedFiles = [];
let isUploading = false;

// ========== 页面上下文缓存 ==========
let pageContextCache = null;

// ========== 自定义智能体状态 ==========
let customAgents = [];

// ========== 自定义工作流状态 ==========
let customWorkflows = [];

// ========== 搜索状态 ==========
let searchResults = [];
let currentSearchQuery = '';
