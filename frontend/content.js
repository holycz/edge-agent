/**
 * Content Script
 * 注入到网页中，负责提取页面内容、处理选中文本、监听页面变化等
 * @module content
 */

// ========== 消息类型常量 ==========
const MESSAGE_TYPES = {
  GET_SELECTED_TEXT: 'GET_SELECTED_TEXT',
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  GET_APPROVAL_PAGE_CONTENT: 'GET_APPROVAL_PAGE_CONTENT',
  PAGE_CONTENT_CHANGED: 'PAGE_CONTENT_CHANGED',
  OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
};

const EXCLUDED_PAGE_PATTERNS = [
  'chrome://', 'chrome-extension://', 'edge://', 'file://', 'about:', 'data:'
];

// ========== CSS选择器常量 ==========

/** OA系统正文内容选择器 */
const OA_BODY_SELECTORS = [
  '.wf-req-content', '.req-content', '.doc-content',
  '.document-content', '.doc-body', '.document-body',
  '[class*="req-content"]', '[class*="doc-content"]',
  '[class*="document-body"]', '[class*="main-content"]',
  '.wf-detail-content', '.detail-content',
  '.form-content', '.form-body',
  '.jdf-doc-editor', '.doc-editor-body',
  '.edoc-body', '.edoc-content',
  '#contentBody', '#docBody', '#mainBody',
  '.km-doc-content', '.km-document-body',
  '[class*="body-text"]', '[class*="content-text"]',
  '.rich-text-content', '.text-content', '.article-content'
];

/** OA系统审批意见相关选择器 */
const APPROVAL_COMMENT_SELECTORS = [
  '.opinion-item',
  '.wf-reqcomments-detail', '.req-comments-detail',
  '[class*="comment"][class*="detail"]', '[class*="approval"][class*="comment"]',
  '.sign-input-content', '.sign-content',
  '.workflow-comments', '.approval-comments',
  '[class*="workflow"][class*="comment"]', '[class*="opinion"][class*="content"]',
  '.km-comment-content', '.km-approval-opinion',
  '[class*="approval"][class*="opinion"]', '[class*="audit"][class*="comment"]'
];

/** 折叠/手风琴面板选择器 */
const COLLAPSIBLE_SELECTORS = [
  '.ant-collapse', '.ant-collapse-item', '.ant-collapse-content',
  '.el-collapse', '.el-collapse-item', '.el-collapse-item__content',
  '.accordion', '.accordion-item', '.accordion-collapse', '.collapse',
  '.MuiAccordion-root', '.MuiAccordionDetails-root',
  '[class*="collapse"]', '[class*="accordion"]',
  '[class*="expandable"]', '[class*="collapsible"]',
  '[role="region"][aria-expanded]', '[aria-expanded]',
  'details', 'details > summary',
  '.wf-panel', '.wf-section', '.req-detail-panel',
  '.flow-panel', '.process-panel', '.detail-panel'
];

/** 工作流/审批流程选择器 */
const WORKFLOW_SELECTORS = [
  '.workflow-node', '.process-node', '.approval-node',
  '.flow-node', '[class*="workflow"][class*="node"]',
  '[class*="process"][class*="step"]', '[class*="approval"][class*="step"]',
  '.flow-chart', '.process-chart', '.workflow-chart',
  '.ant-steps', '.el-steps', '[class*="step"][class*="list"]',
  '.ant-timeline', '.el-timeline', '.timeline'
];

/** 富文本编辑器内容选择器 */
const RICH_EDITOR_SELECTORS = [
  '.cke_editable', '.cke_contents',
  '.ql-editor', '.ql-container',
  '.tox-edit-area', '.mce-content-body',
  '.edui-editor-iframeholder', '.edui-body',
  '.w-e-text-container', '.w-e-text',
  '[contenteditable="true"]'
];

/** 需要过滤移除的 UI 组件选择器 */
const UI_COMPONENTS_TO_REMOVE = [
  '.ant-picker-dropdown', '.ant-calendar-picker',
  '.el-picker-dropdown', '.el-date-picker',
  '.ant-select-dropdown', '.el-select-dropdown',
  '.ant-spin', '.el-loading-spinner',
  '.ant-empty', '.el-empty',
  '.ant-tooltip', '.el-tooltip'
];

// ========== 全局状态 ==========

/** 双击功能状态 */
let doubleClickEnabled = false;

/** 页面变化检测相关状态 */
let pageChangeObserver = null;
let pageChangeTimeout = null;
let lastPageContent = '';
let isObserving = false;

// ========== 工具函数 ==========

/**
 * 获取选中的文本
 * @returns {string} 选中的文本内容
 */
function getSelectedText() {
  try {
    const selection = window.getSelection();
    if (!selection) return '';
    const selectedText = selection.toString().trim();
    if (selectedText) {
      console.log('[Content] 获取选中文本:', selectedText.length, '字符');
    }
    return selectedText;
  } catch (e) {
    console.error("[Content] 获取选中文本失败:", e.message);
    return '';
  }
}

/**
 * 判断元素是否可见
 * @param {Element} element - DOM元素
 * @returns {boolean} 是否可见
 */
function isVisible(element) {
  if (!element) return true;
  return true; // 取消可见性拦截，全部放行
}

/**
 * 判断元素是否包含 Tab 结构
 * @param {Element} element - DOM元素
 * @returns {boolean} 是否包含Tab结构
 */
function hasTabStructure(element) {
  if (!element || !element.querySelector) return false;

  const tabSelectors = [
    '[role="tablist"]', '[role="tab"]',
    '.nav-tabs', '.tab-list', '.tabs', '[class*="tab"]',
    '.ant-tabs', '.el-tabs', '.v-tabs',
    '.ant-steps', '[class*="steps"]',
    '.stepper', '.step-list', '[class*="step-"]'
  ];

  return tabSelectors.some(selector => {
    try {
      return element.querySelector(selector) !== null;
    } catch (e) {
      return false;
    }
  });
}

/**
 * 清理内容中的CSS和脚本
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanContentFromStyleAndScript(text) {
  if (!text) return text;
  return text
    .replace(/@\w+\s+\w+\s*\{[^}]*\}/gs, '')
    .replace(/[.#][\w-]+\s*\{[^}]*\}/gs, '')
    .replace(/\[[\w-]+[^\]]*\]\s*\{[^}]*\}/gs, '')
    .replace(/^\s*[\w-]+:\s*[^;]+;?\s*$/gmi, '')
    .replace(/\.[\w-]+[\w\s.,:>\-]*\{[^}]*\}/gs, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

// ========== 内容提取函数 ==========

/**
 * 从 Shadow DOM 中提取内容
 * @param {Element} element - 起始元素
 * @param {Array} collectedContent - 收集的内容数组
 * @returns {Array} 收集的内容数组
 */
function extractShadowDOMContent(element, collectedContent = []) {
  if (!element) return collectedContent;

  try {
    if (element.shadowRoot) {
      const shadowContent = element.shadowRoot.textContent?.trim();
      if (shadowContent && shadowContent.length > 10) {
        let filteredContent = shadowContent
          .replace(/--[a-z0-9-]+:\s*[^;]+;/gi, '')
          .replace(/\.[a-z0-9_-]+\s*\{[^}]*\}/gi, '')
          .replace(/body\s*\{[^}]*\}/gi, '')
          .replace(/rgba\(var\([^)]+\),[^)]+\)/gi, '')
          .replace(/#[a-f0-9]{6}/gi, '')
          .replace(/[\d,\s;]{10,}/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const hasChinese = /[\u4e00-\u9fa5]/.test(filteredContent);
        const hasWords = /\b[a-z]{4,}\b/i.test(filteredContent);
        const hasSentences = filteredContent.split(/[.!?。！？]\s*/).filter(s => s.trim().length > 10).length > 0;

        if ((hasChinese || (hasWords && hasSentences)) && filteredContent.length > 50) {
          collectedContent.push(`[Shadow DOM内容]: ${filteredContent}`);
          console.log('[Content] 提取 Shadow DOM 内容:', filteredContent.length, '字符');
        }
      }

      element.shadowRoot.querySelectorAll('*').forEach(child => {
        extractShadowDOMContent(child, collectedContent);
      });
    }

    element.querySelectorAll('*').forEach(child => {
      if (child.shadowRoot) {
        extractShadowDOMContent(child, collectedContent);
      }
    });
  } catch (e) {
    console.warn('[Content] 访问 Shadow DOM 失败:', e.message);
  }

  return collectedContent;
}

/**
 * 从 iframe 中提取内容
 * @param {Array} collectedContent - 收集的内容数组
 * @returns {Array} 收集的内容数组
 */
function extractIframeContent(collectedContent = []) {
  const iframes = document.querySelectorAll('iframe');

  iframes.forEach(iframe => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const iframeBody = iframeDoc.body;
        if (iframeBody) {
          const content = iframeBody.innerText?.trim();
          if (content && content.length > 20) {
            collectedContent.push(`[iframe内容]: ${content}`);
            console.log('[Content] 提取 iframe 内容:', content.length, '字符');
          }
        }
      }
    } catch (e) {
      console.log('[Content] 无法访问 iframe (跨域忽略):', e.message);
    }
  });

  return collectedContent;
}

/**
 * 从折叠面板提取内容
 * @param {Array} collectedContent - 收集的内容数组
 * @returns {Array} 收集的内容数组
 */
function extractCollapsibleContent(collectedContent = []) {
  const processedElements = new Set();
  const extractedTexts = [];

  function isDuplicateOrSubset(newText) {
    for (const existing of extractedTexts) {
      if (newText.length < 30) return false;
      if (Math.abs(newText.length - existing.length) < 20 &&
          newText.includes(existing.substring(0, 50))) {
        return true;
      }
    }
    return false;
  }

  COLLAPSIBLE_SELECTORS.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        try {
          if (processedElements.has(el)) return;
          const text = el.innerText?.trim() || '';

          let parent = el.parentElement;
          while (parent) {
            if (processedElements.has(parent)) return;
            parent = parent.parentElement;
          }

          const clone = el.cloneNode(true);
          clone.querySelectorAll('style, script, noscript, link[rel="stylesheet"]').forEach(el2 => el2.remove());

          // 强制展开所有折叠隐藏内容
          clone.querySelectorAll('[style*="display: none"],.hidden,.collapsed,[aria-hidden="true"],[hidden]').forEach(collapsed => {
            collapsed.style.display = 'block';
            collapsed.style.visibility = 'visible';
            collapsed.removeAttribute('hidden');
            collapsed.removeAttribute('aria-hidden');
          });

          let expandedContent = clone.innerText?.trim() || text;
          expandedContent = cleanContentFromStyleAndScript(expandedContent);

          if (isDuplicateOrSubset(expandedContent)) return;

          let title = '折叠面板';
          const header = el.querySelector('.ant-collapse-header, .el-collapse-item__header, summary');
          if (header) title = header.innerText.trim().substring(0, 50);

          collectedContent.push({
            type: 'collapsible', title, content: expandedContent
          });
          extractedTexts.push(expandedContent);
          processedElements.add(el);
        } catch (e) {
          // 忽略单个元素处理错误
        }
      });
    } catch (e) {
      // 忽略选择器查询错误
    }
  });
  return collectedContent;
}

/**
 * 提取审批意见
 * @param {Array} collectedContent - 收集的内容数组
 * @returns {Array} 收集的内容数组
 */
function extractApprovalComments(collectedContent = []) {
  const TRIVIAL_PATTERNS = /^(已学习[。！]?|已阅[，。！、]?|已阅读[。！]?|已办[。！]?|已收到[。！]?|请阅|请查收|已收悉|已收|已看|已知悉|同意|收到|已阅读|已办|按要求办理|按要求执行|请相关同事阅|已阅，学习[。！]?|已阅，请相关同事阅|已阅，按要求办理|已阅，按要求执行)$/i;
  const approvalItems = [];
  const processed = new Set();

  function parseSignText(signText) {
    signText = signText.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const match = signText.match(/([\u4e00-\u9fa5]{2,4})(?:\s*[\(（]([\s\S]*?)[\)）]\s*)?\s+(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?)/);
    if (match) {
      let dept = (match[2] || '').replace(/^[\(（]/, '');
      const innerClose = dept.lastIndexOf('）');
      if (innerClose >= 0 && innerClose === dept.length - 1) {
        dept = dept.substring(0, innerClose);
      }
      return { name: match[1], dept, date: match[3] };
    }
    const simpleMatch = signText.match(/([\u4e00-\u9fa5]{2,4})\s+(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
    if (simpleMatch) {
      return { name: simpleMatch[1], dept: '', date: simpleMatch[2] };
    }
    return null;
  }

  function getCategoryLabel(opinionItem) {
    let el = opinionItem.parentElement;
    while (el) {
      const label = el.querySelector('.opinion-label');
      if (label) {
        const text = label.innerText.trim();
        if (text) return text;
      }
      el = el.parentElement;
    }
    return '';
  }

  // 优先抓取标准 .opinion-item 审批块
  const opinionItems = document.querySelectorAll('.opinion-item');
  if (opinionItems.length > 0) {
    opinionItems.forEach(item => {
      if (processed.has(item)) return;
      processed.add(item);

      const contentEl = item.querySelector('.opinion-content');
      const signEl = item.querySelector('.opinion-sign-text');

      const comment = (contentEl ? contentEl.innerText : '').trim();
      const signText = signEl ? signEl.innerText : '';

      const parsed = parseSignText(signText);
      const category = getCategoryLabel(item);

      if (parsed) {
        if (TRIVIAL_PATTERNS.test(comment)) return;
        approvalItems.push({
          name: parsed.name,
          dept: parsed.dept,
          date: parsed.date,
          comment,
          category,
        });
      } else {
        if (TRIVIAL_PATTERNS.test(comment)) return;
        approvalItems.push({
          name: '',
          dept: '',
          date: '',
          comment: comment || signText,
          category,
          raw: true,
        });
      }
    });
  }

  const extractedTexts = [];
  const processedTextHashes = new Set();
  for (const item of approvalItems) {
    const h = item.comment.trim();
    if (h.length >= 5) processedTextHashes.add(h);
  }

  function isDuplicateOrSubset(newText) {
    const trimmed = newText.trim();
    if (trimmed.length < 20) return false;
    for (const existing of extractedTexts) {
      if (existing.includes(trimmed.substring(0, 60))) return true;
    }
    for (const h of processedTextHashes) {
      if (trimmed.includes(h) || h.includes(trimmed.substring(0, 40))) return true;
    }
    return false;
  }

  // 兜底抓取所有审批相关容器
  APPROVAL_COMMENT_SELECTORS.forEach(selector => {
    if (selector === '.opinion-item') return;
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (processed.has(el)) return;
        if (el.querySelector('.opinion-item')) return;
        if (el.closest('.opinion-item')) return;
        if (el.tagName === 'IFRAME') return;

        let content = '';
        const category = getCategoryLabel(el);

        const clone = el.cloneNode(true);
        clone.querySelectorAll('style, script, noscript, link[rel="stylesheet"]').forEach(el2 => el2.remove());
        clone.querySelectorAll('[style*="display: none"],.hidden,[aria-hidden="true"]').forEach(c => {
          c.style.display = 'block';
          c.removeAttribute('hidden');
        });

        content = clone.innerText?.trim() || '';
        content = cleanContentFromStyleAndScript(content);
        if (content.length < 3) return;
        if (isDuplicateOrSubset(content)) return;

        const lines = content.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        let dateIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(lines[i])) {
            dateIndex = i;
            break;
          }
        }

        if (dateIndex >= 0) {
          const dateLine = lines[dateIndex];
          const dateMatch = dateLine.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[\s:]\d{1,2}:\d{1,2})?)?/);
          const date = dateMatch ? dateMatch[1] : dateLine;
          let name = '', dept = '';
          const sameLineMatch = dateLine.match(/([\u4e00-\u9fa5]{2,4})[\s\（]([^\）]*)/);
          if (sameLineMatch) {
            name = sameLineMatch[1];
            dept = sameLineMatch[2].replace(/^[\(（]/, '');
          } else if (dateIndex > 0) {
            const prevLine = lines[dateIndex - 1];
            if (/^[\u4e00-\u9fa5]{2,4}$/.test(prevLine)) name = prevLine;
          }

          let commentLines = [];
          for (let i = 0; i < dateIndex; i++) {
            const line = lines[i];
            if (line !== name) commentLines.push(line);
          }
          const comment = commentLines.join('\n').trim();
          if (TRIVIAL_PATTERNS.test(comment)) return;

          approvalItems.push({ name, dept, date, comment, category });
          extractedTexts.push(content);
        } else {
          if (!TRIVIAL_PATTERNS.test(content)) {
            approvalItems.push({ name: '', dept: '', date: '', comment: content, category, raw: true });
            extractedTexts.push(content);
          }
        }
        processed.add(el);
      });
    } catch (e) {
      // 忽略选择器查询错误
    }
  });

  // 全局去重
  const seen = new Set();
  const seenComments = new Set();
  const uniqueItems = [];
  for (const item of approvalItems) {
    if (item.raw) {
      const rawLines = item.comment.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
      const allAlreadySeen = rawLines.every(line => {
        for (const sc of seenComments) {
          if (sc.includes(line) || line.includes(sc)) return true;
        }
        return false;
      });
      if (allAlreadySeen) continue;
    }
    const key = (item.name + '_' + item.comment.substring(0, 30)).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      const commentTrim = item.comment.trim();
      if (commentTrim.length >= 4) seenComments.add(commentTrim);
      uniqueItems.push(item);
    }
  }

  // 分类+分组格式化
  const categoryGroups = new Map();
  const categoryOrder = [];
  for (const item of uniqueItems) {
    const cat = item.category || '其他审批';
    if (!categoryGroups.has(cat)) {
      categoryGroups.set(cat, []);
      categoryOrder.push(cat);
    }
    categoryGroups.get(cat).push(item);
  }

  const SKIP_CATEGORIES = ['其他审批', '承办部门员工办理'];
  for (const cat of categoryOrder) {
    if (SKIP_CATEGORIES.includes(cat)) continue;
    const items = categoryGroups.get(cat);
    items.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return b.date.localeCompare(a.date);
    });
    
    const personMap = new Map();
    const personOrder = [];
    for (const item of items) {
      const personKey = item.name || ('_raw_' + item.comment.substring(0, 20));
      if (!personMap.has(personKey)) {
        personMap.set(personKey, { name: item.name, dept: item.dept, comments: [] });
        personOrder.push(personKey);
      }
      const entry = personMap.get(personKey);
      if (item.dept && !entry.dept) entry.dept = item.dept;
      entry.comments.push({ date: item.date, comment: item.comment });
    }

    let formatted = `【${cat}】\n`;
    for (const personKey of personOrder) {
      const entry = personMap.get(personKey);
      if (entry.name) {
        formatted += `  👤 ${entry.name}`;
        if (entry.dept) formatted += ` | ${entry.dept}`;
        formatted += '\n';
      }
      entry.comments.forEach(c => {
        if (c.date) formatted += `    [${c.date}] `;
        formatted += c.comment + '\n';
      });
    }

    collectedContent.push({ type: 'approval_comment', content: formatted.trim() });
  }

  console.log('[Content] 提取审批意见总计:', uniqueItems.length, '条');
  return collectedContent;
}

/**
 * 提取工作流信息
 * @param {Array} collectedContent - 收集的内容数组
 * @returns {Array} 收集的内容数组
 */
function extractWorkflowInfo(collectedContent = []) {
  const nodes = [];
  WORKFLOW_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.innerText.trim();
        if (text && /审批|审核|同意|驳回|待处理/.test(text)) nodes.push(text);
      });
    } catch (e) {
      // 忽略选择器查询错误
    }
  });

  if (nodes.length) {
    const uniqueNodes = [...new Set(nodes)];
    collectedContent.push({
      type: 'workflow_nodes', nodes: uniqueNodes
    });
  }
  return collectedContent;
}

/**
 * 提取Steps/Tab内容
 * @param {Element} clone - 克隆的DOM元素
 * @returns {string|null} 步骤内容
 */
function extractStepsContent(clone) {
  const steps = clone.querySelector('.ant-steps, [class*="steps"]');
  if (!steps) return null;
  const titles = Array.from(steps.querySelectorAll('.ant-steps-item-title, [class*="step-title"]'))
    .map(el => el.innerText.trim());
  return `[步骤组件] ${titles.join(' → ')}\n${clone.innerText.trim()}`;
}

/**
 * 获取元素完整内容（强制展开隐藏/折叠）
 * @param {Element} element - DOM元素
 * @returns {string} 清理后的内容
 */
function getAllContentFromElement(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('style, script, noscript, link[rel="stylesheet"]').forEach(el => el.remove());
  
  UI_COMPONENTS_TO_REMOVE.forEach(selector => {
    try {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {
      // 忽略选择器查询错误
    }
  });

  // 强制展开所有折叠、隐藏、display:none 审批区域
  clone.querySelectorAll('[style*="display:none"],[hidden],.hidden,.collapsed,[aria-hidden="true"]').forEach(el => {
    el.style.display = 'block';
    el.style.visibility = 'visible';
    el.removeAttribute('hidden');
    el.removeAttribute('aria-hidden');
  });

  if (hasTabStructure(element)) {
    const steps = extractStepsContent(clone);
    if (steps) return cleanContentFromStyleAndScript(steps);
  }

  const rawText = clone.innerText?.trim() || '';
  return cleanContentFromStyleAndScript(rawText);
}

/**
 * 获取弹窗内容
 * @returns {Array} 弹窗内容数组
 */
function getModalContent() {
  const modals = [];
  const processedElements = new Set();
  const extractedTexts = [];

  function isDuplicateOrSubset(newText) {
    for (const existing of extractedTexts) {
      if (existing.includes(newText.substring(0, 80))) return true;
    }
    return false;
  }

  const selectors = ['dialog', '[role="dialog"]', '.modal', '.popup'];
  selectors.forEach(s => {
    document.querySelectorAll(s).forEach(el => {
      if (processedElements.has(el)) return;
      const content = getAllContentFromElement(el);
      if (content.length > 20 && !isDuplicateOrSubset(content)) {
        modals.push({ content });
        extractedTexts.push(content);
        processedElements.add(el);
      }
    });
  });
  return modals;
}

// ========== 特殊站点内容提取 ==========

/**
 * 清理特殊站点内容
 * @param {string} content - 原始内容
 * @returns {string} 清理后的内容
 */
function cleanSpecialSiteContent(content) {
  return content.replace(/^\s*--[a-z0-9-]+:.+/gm, '').replace(/[\d,\s;]{10,}/g, '').trim();
}

/**
 * 提取特殊站点（如知乎）的智能内容
 * @returns {string} 提取的内容
 */
function extractSpecialSiteSmartContent() {
  const selectors = ['.RichContent-inner', '.Post-content', '[itemprop="articleBody"]'];
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el && el.textContent.length > 500) return el.textContent;
  }
  return '';
}

// ========== 主要内容提取函数 ==========

/**
 * 获取公文批示专用内容
 * @returns {string} 格式化的公文批示内容
 */
function getApprovalPageContent() {
  console.log('[Content] ========== 开始获取公文批示专用内容 ==========');
  const parts = [];

  // 1. 提取正文
  let bodyContent = '';
  for (const selector of OA_BODY_SELECTORS) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        bodyContent = getAllContentFromElement(el);
        if (bodyContent.length > 20) break;
      }
    } catch (e) {
      // 忽略选择器查询错误
    }
  }

  if (!bodyContent) {
    for (const selector of RICH_EDITOR_SELECTORS) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          bodyContent = getAllContentFromElement(el);
          if (bodyContent.length > 20) break;
        }
      } catch (e) {
        // 忽略选择器查询错误
      }
    }
  }

  if (bodyContent) {
    parts.push('【正文内容】\n' + bodyContent);
  }

  // 2. 提取审批意见
  const approvalComments = [];
  extractApprovalComments(approvalComments);
  const approvalTextSet = new Set();
  if (approvalComments.length > 0) {
    const commentsText = approvalComments.map(c => c.content).join('\n\n');
    parts.push('【审批意见】\n' + commentsText);
    approvalComments.forEach(c => {
      const lines = c.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      lines.forEach(l => {
        const cleaned = l.replace(/^[👤\s\[\]（）\(\)]+/g, '').replace(/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[\s:]\d{1,2}:\d{1,2}(:\d{1,2})?\s*/, '').trim();
        if (cleaned.length >= 4) approvalTextSet.add(cleaned);
      });
    });
  }

  // 3. 提取折叠面板审批相关（去重）
  const collapsibleContent = [];
  extractCollapsibleContent(collapsibleContent);
  const approvalCollapsible = collapsibleContent.filter(c =>
    c.title && /审批|意见|批示|签批|审核/.test(c.title)
  );
  if (approvalCollapsible.length > 0) {
    const filteredCollapsible = approvalCollapsible.filter(c => {
      const lines = c.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const newLines = lines.filter(l => {
        for (const existing of approvalTextSet) {
          if (l.includes(existing) || existing.includes(l)) return false;
        }
        return true;
      });
      c.content = newLines.join('\n');
      return newLines.length > 0;
    });
    if (filteredCollapsible.length > 0) {
      const collapsibleText = filteredCollapsible.map(c => `[${c.title}]\n${c.content}`).join('\n---\n');
      parts.push('【审批相关面板】\n' + collapsibleText);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join('\n\n');
}

/**
 * 获取页面内容
 * @returns {string} 页面主要文本内容
 */
function getPageContent() {
  const isZhihu = location.hostname.includes('zhihu.com');
  let mainContent = '';
  
  if (isZhihu) {
    const main = extractSpecialSiteSmartContent();
    if (main) {
      mainContent = cleanSpecialSiteContent(main);
    }
  } else {
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    mainContent = getAllContentFromElement(main);
  }
  
  return mainContent;
}

/**
 * 获取页面元信息
 * @returns {Object} 页面元信息对象
 */
function getPageMetadata() {
  return {
    title: document.title,
    url: location.href,
    description: document.querySelector('meta[name="description"]')?.content || ''
  };
}

// ========== 双击功能 ==========

/**
 * 处理双击事件
 */
async function handleDoubleClick() {
  if (!doubleClickEnabled) return;
  if (!getSelectedText()) chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_SIDEPANEL });
}

/**
 * 更新双击状态
 */
function updateDoubleClickState() {
  if (doubleClickEnabled) {
    document.addEventListener('dblclick', handleDoubleClick);
  } else {
    document.removeEventListener('dblclick', handleDoubleClick);
  }
}

/**
 * 初始化双击设置
 */
async function initDoubleClickSetting() {
  const res = await chrome.storage.sync.get('enableDoubleClick');
  doubleClickEnabled = res.enableDoubleClick === true;
  updateDoubleClickState();
}

// ========== 页面变化监听 ==========

/**
 * 生成内容哈希
 * @param {string} content - 内容
 * @returns {string} 哈希值
 */
function generateContentHash(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
  }
  return hash + '_' + content.length;
}

/**
 * 通知页面内容变化
 */
function notifyPageChanged() {
  const content = getPageContent();
  const hash = generateContentHash(content);
  if (hash !== lastPageContent) {
    lastPageContent = hash;
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.PAGE_CONTENT_CHANGED }).catch(() => {});
  }
}

/**
 * 启动页面变化检测
 */
function startPageChangeDetection() {
  if (isObserving) return;
  isObserving = true;
  
  pageChangeObserver = new MutationObserver(mutations => {
    const hasChange = mutations.some(mutation =>
      (mutation.addedNodes.length || mutation.removedNodes.length) &&
      [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
        node.nodeType === 1 && !['script', 'style'].includes(node.tagName.toLowerCase())
      )
    );
    
    if (hasChange) {
      clearTimeout(pageChangeTimeout);
      pageChangeTimeout = setTimeout(notifyPageChanged, 1000);
    }
  });
  
  pageChangeObserver.observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(notifyPageChanged, 500);
    }
  }).observe(document, { subtree: true, childList: true });
}

// ========== 消息监听 ==========

chrome.runtime.onMessage.addListener((msg, _, res) => {
  if (msg.type === MESSAGE_TYPES.GET_SELECTED_TEXT) {
    const text = getSelectedText();
    res({ text: text });
    return true;
  }
  
  if (msg.type === MESSAGE_TYPES.GET_PAGE_CONTEXT) {
    try {
      const content = getPageContent();
      const metadata = getPageMetadata();
      res({ content: content, metadata: metadata });
    } catch (e) {
      console.error('[Content] 获取页面内容失败:', e);
      res({ content: '', metadata: {} });
    }
    return true;
  }
  
  if (msg.type === MESSAGE_TYPES.GET_APPROVAL_PAGE_CONTENT) {
    try {
      const content = getApprovalPageContent();
      const metadata = getPageMetadata();
      res({ content: content, metadata: metadata });
    } catch (e) {
      console.error('[Content] 获取审批页面内容失败:', e);
      res({ content: '', metadata: {} });
    }
    return true;
  }
});

// ========== 设置监听 ==========

chrome.storage.onChanged.addListener(changes => {
  if (changes.enableDoubleClick) {
    doubleClickEnabled = changes.enableDoubleClick.newValue === true;
    updateDoubleClickState();
  }
});

// ========== 初始化 ==========

initDoubleClickSetting();
startPageChangeDetection();
