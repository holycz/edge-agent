/**
 * 工具函数模块
 * 提供通用的辅助函数
 * @module utils
 */

/**
 * 生成请求流水号：时间戳 + 6位随机数
 * 格式：1738675432101 + 123456
 * @returns {string} 请求ID
 */
function generateRequestId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `${timestamp}${random}`;
}

/**
 * 生成对话ID：(yyyyMMddHHmmssSSS) + 6位随机数
 * 格式：20250204091532123 + 123456
 * @returns {string} 对话ID
 */
function generateDialogId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}${ms}${random}`;
}

/**
 * 获取后端服务URL
 * @returns {Promise<string>} 后端URL
 */
async function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_BACKEND_URL }, (response) => {
      resolve(response?.url || "http://localhost:8765");
    });
  });
}

/**
 * 初始化Markdown解析器
 */
let md = null;
function initMarkdownParser() {
  if (typeof window.markdownit !== 'undefined') {
    md = window.markdownit({
      html: true,
      linkify: true,
      typographer: false,
      breaks: true,
      highlight: function (str, lang) {
        if (typeof hljs !== 'undefined') {
          try {
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(str, { language: lang }).value;
            }
            return hljs.highlightAuto(str).value;
          } catch (e) {}
        }
        return '';
      }
    });
  }
}

/**
 * 解析Markdown文本
 * @param {string} text - 原始文本
 * @returns {string} 解析后的HTML
 */
function parseMarkdown(text) {
  if (!text) return '';

  if (md) {
    try {
      // 后端将 \n 转为 <br />，需还原为 \n 让 markdown-it 正确解析列表/标题等块级元素
      const normalized = text.replace(/<br\s*\/?>/gi, '\n');
      return md.render(normalized);
    } catch (e) {
      console.log('markdown-it parsing failed:', e);
    }
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/**
 * 显示Toast提示
 * @param {string} message - 提示消息
 * @param {number} duration - 显示时长（毫秒）
 * @param {string} type - 提示类型
 */
function showToast(message, duration = 2000, type = '') {
  const toast = document.createElement('div');
  toast.className = 'ai-toast';
  if (type) toast.classList.add(type);
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
