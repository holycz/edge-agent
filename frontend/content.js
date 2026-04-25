// 双击功能状态
let doubleClickEnabled = false;

// 页面变化检测
let pageChangeObserver = null;
let pageChangeTimeout = null;
let lastPageContent = '';
let isObserving = false;

// 获取选中的文本
function getSelectedText() {
  try {
    const selection = window.getSelection();
    if (!selection) return '';
    const selectedText = selection.toString().trim();
    if (selectedText) {
      console.log('[Content] 获取选中文本:', selectedText.length, '字符:', selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : ''));
    }
    return selectedText;
  } catch (e) {
    console.error("[Content] 获取选中文本失败:", e.message);
    return '';
  }
}

// 判断元素是否可见
function isVisible(element) {
  if (!element) return false;

  if (element.hasAttribute('hidden') || element.hidden) return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const hasVisibleChildren = element.children.length > 0 &&
      Array.from(element.children).some(child => isVisible(child));
    if (!hasVisibleChildren) {
      return false;
    }
  }

  return true;
}

// 判断元素是否包含 Tab 结构
function hasTabStructure(element) {
  if (!element || !element.querySelector) return false;

  const tabSelectors = [
    '[role="tablist"]', '[role="tab"]',
    '.nav-tabs', '.tab-list', '.tabs', '[class*="tab"]',
    '.ant-tabs', '.el-tabs', '.v-tabs',
    '.ant-steps', '[class*="steps"]',
    '.stepper', '.step-list', '[class*="step-"]'
  ];

  for (const selector of tabSelectors) {
    try {
      if (element.querySelector(selector)) {
        return true;
      }
    } catch (e) {}
  }
  return false;
}

// 从 Shadow DOM 中提取内容
function extractShadowDOMContent(element, collectedContent = []) {
  if (!element) return;

  try {
    if (element.shadowRoot) {
      const shadowContent = element.shadowRoot.textContent?.trim();
      if (shadowContent && shadowContent.length > 10) {
        let filteredContent = shadowContent;
        filteredContent = filteredContent.replace(/--[a-z0-9-]+:\s*[^;]+;/gi, '');
        filteredContent = filteredContent.replace(/\.[a-z0-9_-]+\s*\{[^}]*\}/gi, '');
        filteredContent = filteredContent.replace(/body\s*\{[^}]*\}/gi, '');
        filteredContent = filteredContent.replace(/rgba\(var\([^)]+\),[^)]+\)/gi, '');
        filteredContent = filteredContent.replace(/#[a-f0-9]{6}/gi, '');
        filteredContent = filteredContent.replace(/[\d,\s;]{10,}/g, ' ');
        filteredContent = filteredContent.replace(/\s+/g, ' ').trim();

        const hasChinese = /[\u4e00-\u9fa5]/.test(filteredContent);
        const hasWords = /\b[a-z]{4,}\b/i.test(filteredContent);
        const hasSentences = filteredContent.split(/[.!?。！？]\s*/).filter(s => s.trim().length > 10).length > 0;

        if ((hasChinese || (hasWords && hasSentences)) && filteredContent.length > 50) {
          collectedContent.push(`[Shadow DOM内容]: ${filteredContent}`);
          console.log('[Content] 提取 Shadow DOM 内容:', filteredContent.length, '字符:', filteredContent.substring(0, 100) + (filteredContent.length > 100 ? '...' : ''));
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

// 从 iframe 中提取内容
function extractIframeContent(collectedContent = []) {
  const iframes = document.querySelectorAll('iframe');

  iframes.forEach(iframe => {
    try {
      if (!isVisible(iframe)) return;

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const iframeBody = iframeDoc.body;
        if (iframeBody) {
        const content = iframeBody.innerText?.trim();
        if (content && content.length > 50) {
          collectedContent.push(`[iframe内容]: ${content}`);
          console.log('[Content] 提取 iframe 内容:', content.length, '字符:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
        }
        }
      }
    } catch (e) {
      console.log('[Content] 无法访问 iframe (可能是跨域):', e.message);
    }
  });

  return collectedContent;
}

// OA系统审批意见相关选择器
const APPROVAL_COMMENT_SELECTORS = [
  '.wf-reqcomments-detail', '.req-comments-detail',
  '[class*="comment"][class*="detail"]', '[class*="approval"][class*="comment"]',
  '.sign-input-content', '.sign-content',
  '.workflow-comments', '.approval-comments',
  '[class*="workflow"][class*="comment"]', '[class*="opinion"][class*="content"]',
  '.km-comment-content', '.km-approval-opinion',
  '[class*="approval"][class*="opinion"]', '[class*="audit"][class*="comment"]'
];

// 折叠/手风琴面板选择器
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

// 工作流/审批流程选择器
const WORKFLOW_SELECTORS = [
  '.workflow-node', '.process-node', '.approval-node',
  '.flow-node', '[class*="workflow"][class*="node"]',
  '[class*="process"][class*="step"]', '[class*="approval"][class*="step"]',
  '.flow-chart', '.process-chart', '.workflow-chart',
  '.ant-steps', '.el-steps', '[class*="step"][class*="list"]',
  '.ant-timeline', '.el-timeline', '.timeline'
];

// 富文本编辑器内容选择器
const RICH_EDITOR_SELECTORS = [
  '.cke_editable', '.cke_contents',
  '.ql-editor', '.ql-container',
  '.tox-edit-area', '.mce-content-body',
  '.edui-editor-iframeholder', '.edui-body',
  '.w-e-text-container', '.w-e-text',
  '[contenteditable="true"]'
];



// 从折叠面板提取内容（去重版本）
function extractCollapsibleContent(collectedContent = []) {
  const processedElements = new Set();
  const extractedTexts = []; // 存储已提取的文本内容用于子串检查

  // 辅助函数：检查内容是否是已提取内容的子集或重复
  function isDuplicateOrSubset(newText) {
    for (const existing of extractedTexts) {
      // 如果新内容几乎与已有内容相同
      if (Math.abs(newText.length - existing.length) < 50 &&
          (newText.includes(existing.substring(0, 100)) || existing.includes(newText.substring(0, 100)))) {
        return true;
      }
      // 如果新内容明显是已有内容的子集（长度差距很大但内容包含）
      if (newText.length < existing.length * 0.9 && existing.includes(newText.substring(0, Math.min(newText.length, 200)))) {
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
          if (text.length < 20) return;

          // 跳过已经被父元素处理的元素（通过选择器重叠）
          let parent = el.parentElement;
          while (parent) {
            if (processedElements.has(parent)) return;
            parent = parent.parentElement;
          }

          const clone = el.cloneNode(true);

          // 移除 style 和 script 标签
          clone.querySelectorAll('style, script, noscript, link[rel="stylesheet"]').forEach(el2 => el2.remove());

          const collapsedElements = clone.querySelectorAll([
            '[style*="display: none"]',
            '.hidden', '.collapsed', '[aria-hidden="true"]', '[hidden]'
          ].join(','));

          collapsedElements.forEach(collapsed => {
            collapsed.style.display = 'block';
            collapsed.style.visibility = 'visible';
            collapsed.removeAttribute('hidden');
            collapsed.removeAttribute('aria-hidden');
          });

          let expandedContent = clone.innerText?.trim() || text;
          // 清理 CSS 内容
          expandedContent = cleanContentFromStyleAndScript(expandedContent);

          // 检查是否是重复或子集内容
          if (isDuplicateOrSubset(expandedContent)) {
            return;
          }

          let title = '折叠面板';
          const header = el.querySelector('.ant-collapse-header, .el-collapse-item__header, summary');
          if (header) title = header.innerText.trim().substring(0, 50);

          collectedContent.push({
            type: 'collapsible', title, content: expandedContent
          });
          extractedTexts.push(expandedContent); // 记录已提取的文本
          console.log('[Content] 提取折叠面板内容:', title, expandedContent.length, '字符:', expandedContent.substring(0, 100) + (expandedContent.length > 100 ? '...' : ''));
          processedElements.add(el);
        } catch (e) {}
      });
    } catch (e) {}
  });
  return collectedContent;
}

// 提取审批意见（去重版本）
function extractApprovalComments(collectedContent = []) {
  const processed = new Set();
  const extractedTexts = []; // 存储已提取的文本用于去重

  // 辅助函数：检查内容是否是已提取内容的子集或重复
  function isDuplicateOrSubset(newText) {
    for (const existing of extractedTexts) {
      // 如果内容几乎相同
      if (Math.abs(newText.length - existing.length) < 30 &&
          (newText.includes(existing.substring(0, 80)) || existing.includes(newText.substring(0, 80)))) {
        return true;
      }
      // 如果新内容是已有内容的子集
      if (newText.length < existing.length * 0.85 && existing.includes(newText.substring(0, Math.min(newText.length, 150)))) {
        return true;
      }
    }
    return false;
  }

  APPROVAL_COMMENT_SELECTORS.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (processed.has(el)) return;
        let content = '';

        if (el.tagName === 'IFRAME') {
          try {
            const doc = el.contentDocument || el.contentWindow?.document;
            content = doc?.body?.innerText?.trim() || '';
          } catch (e) {}
        } else {
          const clone = el.cloneNode(true);
          // 移除 style 和 script 标签
          clone.querySelectorAll('style, script, noscript, link[rel="stylesheet"]').forEach(el2 => el2.remove());
          content = clone.innerText?.trim() || '';
        }

        // 清理 CSS 内容
        content = cleanContentFromStyleAndScript(content);

        if (content.length < 5) return;

        // 检查是否是重复或子集内容
        if (isDuplicateOrSubset(content)) {
          return;
        }

        collectedContent.push({ type: 'approval_comment', content });
        extractedTexts.push(content); // 记录已提取的文本
        console.log('[Content] 提取审批意见:', content.length, '字符:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
        processed.add(el);
      });
    } catch (e) {}
  });
  return collectedContent;
}

// 提取工作流信息
function extractWorkflowInfo(collectedContent = []) {
  const nodes = [];
  WORKFLOW_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.innerText.trim();
        if (text && /审批|审核|同意|驳回|待处理/.test(text)) nodes.push(text);
      });
    } catch (e) {}
  });

  if (nodes.length) {
    const uniqueNodes = [...new Set(nodes)];
    collectedContent.push({
      type: 'workflow_nodes', nodes: uniqueNodes
    });
    console.log('[Content] 提取工作流信息:', uniqueNodes.length, '个节点:', uniqueNodes.slice(0, 3).join(', ') + (uniqueNodes.length > 3 ? '...' : ''));
  }
  return collectedContent;
}

// 提取Steps/Tab内容
function extractStepsContent(clone) {
  const steps = clone.querySelector('.ant-steps, [class*="steps"]');
  if (!steps) return null;

  const titles = Array.from(steps.querySelectorAll('.ant-steps-item-title, [class*="step-title"]'))
    .map(el => el.innerText.trim());
  return `[步骤组件] ${titles.join(' → ')}\n${clone.innerText.trim()}`;
}

// 清理内容中的CSS和脚本
function cleanContentFromStyleAndScript(text) {
  if (!text) return text;
  // 移除 CSS 规则块（@page, .class, #id 等）
  let cleaned = text
    // 移除 @page, @media 等 CSS at-rules
    .replace(/@\w+\s+\w+\s*\{[^}]*\}/gs, '')
    // 移除 CSS 选择器规则块
    .replace(/[.#][\w-]+\s*\{[^}]*\}/gs, '')
    // 移除 [attribute] 选择器规则块
    .replace(/\[[\w-]+[^\]]*\]\s*\{[^}]*\}/gs, '')
    // 移除 CSS 属性行（mso-开头，font-family等）
    .replace(/^\s*[\w-]+:\s*[^;]+;?\s*$/gmi, '')
    // 移除 CSS 类定义（如 .jdf-doc-editor, .enlarge-main-text 等）
    .replace(/\.[\w-]+[\w\s.,:>\-]*\{[^}]*\}/gs, '')
    // 移除 /* 注释 */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 清理连续空行
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  return cleaned;
}

// 需要过滤移除的 UI 组件选择器
const UI_COMPONENTS_TO_REMOVE = [
  // 日期/时间选择器相关
  '.ant-picker-dropdown', '.ant-calendar-picker', '.ant-calendar',
  '.ant-picker-panel', '.ant-picker-date-panel', '.ant-picker-time-panel',
  '.ant-picker-range-arrow', '.ant-picker-header',
  '.el-picker-dropdown', '.el-date-picker', '.el-time-picker',
  '.el-date-table', '.el-year-table', '.el-month-table',
  // 下拉菜单/选择器
  '.ant-select-dropdown', '.ant-select-dropdown-menu',
  '.el-select-dropdown', '.el-dropdown-menu',
  // 加载状态
  '.ant-spin', '.ant-spin-container', '.el-loading-spinner',
  '[class*="loading"]', '[class*="spinner"]',
  // 空状态/无数据
  '.ant-empty', '.el-empty', '.ant-select-item-empty',
  '[class*="empty"][class*="no-data"]', '[class*="no-match"]',
  // 弹窗/浮层（非内容区域）
  '.ant-tooltip', '.ant-popover', '.el-tooltip', '.el-popover',
  '.ant-modal-wrap', '.ant-modal-mask', '.el-dialog__wrapper'
];

// 获取元素完整内容（含隐藏）
function getAllContentFromElement(element) {
  const clone = element.cloneNode(true);

  // 移除 style 和 script 标签
  clone.querySelectorAll('style, script, noscript, link[rel="stylesheet"]').forEach(el => el.remove());

  // 移除 UI 组件（日历、下拉框、加载状态等）
  UI_COMPONENTS_TO_REMOVE.forEach(selector => {
    try {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {}
  });

  if (hasTabStructure(element)) {
    const steps = extractStepsContent(clone);
    if (steps) return cleanContentFromStyleAndScript(steps);
  }

  clone.querySelectorAll('[style*="display:none"], [hidden], .hidden, .collapsed').forEach(el => {
    el.style.display = 'block';
    el.removeAttribute('hidden');
  });

  const rawText = clone.innerText?.trim() || '';
  let cleanedText = cleanContentFromStyleAndScript(rawText);

  // 过滤纯数字列表（如日历日期、时间选择器数字等）
  cleanedText = cleanedText
    // 移除纯数字行（1-99 的单个数字或连续数字列表）
    .replace(/\n\s*(\d{1,2}\s+){10,}/g, '\n')  // 连续10个以上短数字
    .replace(/\n\s*\d{1,2}(\s+\d{1,2}){5,}\s*\n/g, '\n')  // 6个以上的数字序列
    // 移除 "00010203...59" 这类时间选择器数字
    .replace(/\d{2}(\d{2}){20,}/g, '')
    // 移除 "202020212022..." 年份列表
    .replace(/(20|19)\d{2}(\s+(20|19)\d{2}){3,}/g, '')
    // 移除 "一月二月三月...十二月" 月份列表
    .replace(/(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)(\s+\1){2,}/g, '')
    // 移除 "日一二三四五六" 星期列表
    .replace(/日\s+一\s+二\s+三\s+四\s+五\s+六/g, '')
    .replace(/[日月火水木金土]\s+[日月火水木金土](\s+[日月火水木金土]){4,}/g, '')
    // 移除 "上午 下午" 的重复选项
    .replace(/(上午|下午)(\s+\1){2,}/g, '$1')
    .replace(/(上午|下午)\s+无匹配数据(\s+\1\s+无匹配数据)+/gi, '')
    // 移除 "请选择..." 下拉提示
    .replace(/请选择[^\n]*\n\s*无匹配数据/gi, '')
    // 移除 "正在加载..." 提示
    .replace(/正在加载\.{0,3}/g, '')
    // 移除 "加载中..."
    .replace(/加载中\.{0,3}/g, '')
    // 清理多余空行
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  return cleanedText;
}

// 获取弹窗内容（去重版本）
function getModalContent() {
  const modals = [];
  const processedElements = new Set();
  const extractedTexts = []; // 存储已提取的文本用于去重

  console.log('[Content] 开始获取弹窗内容...');
  const selectors = ['dialog', '[role="dialog"]', '[role="alertdialog"]', '.modal', '.popup', '.layer'];

  // 辅助函数：检查内容是否是已提取内容的子集或重复
  function isDuplicateOrSubset(newText) {
    for (const existing of extractedTexts) {
      // 如果内容几乎相同
      if (Math.abs(newText.length - existing.length) < 50 &&
          (newText.includes(existing.substring(0, 100)) || existing.includes(newText.substring(0, 100)))) {
        return true;
      }
      // 如果新内容是已有内容的子集
      if (newText.length < existing.length * 0.9 && existing.includes(newText.substring(0, Math.min(newText.length, 200)))) {
        return true;
      }
    }
    return false;
  }

  selectors.forEach(s => {
    document.querySelectorAll(s).forEach(el => {
      if (processedElements.has(el)) return;
      if (isVisible(el)) {
        const content = getAllContentFromElement(el);
        if (content.length > 20 && !isDuplicateOrSubset(content)) {
          modals.push({ content });
          extractedTexts.push(content);
          console.log('[Content] 提取弹窗内容:', content.length, '字符:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
          processedElements.add(el);
        }
      }
    });
  });

  // 高层级浮动元素
  document.querySelectorAll('div, section').forEach(el => {
    if (processedElements.has(el)) return;
    const style = getComputedStyle(el);
    if (['fixed', 'sticky'].includes(style.position) && +style.zIndex > 100) {
      const content = getAllContentFromElement(el);
      if (content.length > 50 && !isDuplicateOrSubset(content)) {
        modals.push({ content });
        extractedTexts.push(content);
        console.log('[Content] 提取高层级浮动元素:', content.length, '字符:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
        processedElements.add(el);
      }
    }
  });

  if (modals.length) {
    console.log('[Content] 总共提取到', modals.length, '个弹窗/浮动层内容');
  }
  return modals;
}

// 内容提取（不再截断，保留完整内容）
function truncateContent(content) {
  return content;
}

// 特定网站内容提取
function cleanSpecialSiteContent(c) {
  return c.replace(/^\s*--[a-z0-9-]+:.+/gm, '').replace(/[\d,\s;]{10,}/g, '').trim();
}

function extractSpecialSiteSmartContent() {
  const selectors = ['.RichContent-inner', '.Post-content', '.QuestionRichText-content', '[itemprop="articleBody"]'];
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el && el.textContent.length > 500) return el.textContent;
  }
  return '';
}

// 获取页面内容（简化版 - 只提取主体内容）
function getPageContent() {
  console.log('[Content] ========== 开始获取页面内容（简化模式 - 只提取主体） ==========');
  console.log('[Content] 当前页面URL:', location.href);
  const isZhihu = location.hostname.includes('zhihu.com');

  // 主体内容
  let mainContent = '';
  if (isZhihu) {
    const main = extractSpecialSiteSmartContent();
    if (main) {
      const cleaned = cleanSpecialSiteContent(main);
      mainContent = cleaned;
      console.log('[Content] 提取知乎主体内容:', cleaned.length, '字符');
    }
  } else {
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    mainContent = getAllContentFromElement(main);
    console.log('[Content] 提取页面主体内容:', mainContent.length, '字符');
  }

  return mainContent;
}

// 元信息
function getPageMetadata() {
  const metadata = {
    title: document.title,
    url: location.href,
    description: document.querySelector('meta[name="description"]')?.content || ''
  };
  console.log('[Content] 获取页面元信息:', metadata);
  return metadata;
}

// 双击事件
async function handleDoubleClick() {
  if (!doubleClickEnabled) return;
  if (!getSelectedText()) chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
}

function updateDoubleClickState() {
  doubleClickEnabled ?
    document.addEventListener('dblclick', handleDoubleClick) :
    document.removeEventListener('dblclick', handleDoubleClick);
}

async function initDoubleClickSetting() {
  const res = await chrome.storage.sync.get('enableDoubleClick');
  doubleClickEnabled = res.enableDoubleClick === true;
  updateDoubleClickState();
}

// 页面变化监听
function generateContentHash(c) {
  let h = 0;
  for (let i=0; i<c.length; i++) h = (h<<5) - h + c.charCodeAt(i);
  return h + '_' + c.length;
}

function notifyPageChanged() {
  const c = getPageContent();
  const hash = generateContentHash(c);
  if (hash !== lastPageContent) {
    lastPageContent = hash;
    chrome.runtime.sendMessage({ type: "PAGE_CONTENT_CHANGED" }).catch(()=>{});
  }
}

function startPageChangeDetection() {
  if (isObserving) return;
  isObserving = true;

  // DOM变化
  pageChangeObserver = new MutationObserver(m => {
    const change = m.some(x =>
      (x.addedNodes.length || x.removedNodes.length) &&
      [...x.addedNodes, ...x.removedNodes].some(n =>
        n.nodeType === 1 && !['script','style'].includes(n.tagName.toLowerCase())
      )
    );
    if (change) {
      clearTimeout(pageChangeTimeout);
      pageChangeTimeout = setTimeout(notifyPageChanged, 1000);
    }
  });
  pageChangeObserver.observe(document.body, { childList: true, subtree: true });

  // URL变化
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(notifyPageChanged, 500);
    }
  }).observe(document, { subtree: true, childList: true });
}

// 消息监听
chrome.runtime.onMessage.addListener((msg, _, res) => {
  if (msg.type === "GET_SELECTED_TEXT") {
    const text = getSelectedText();
    console.log('[Content] 收到 GET_SELECTED_TEXT 请求，返回文本长度:', text.length);
    return res({ text: text });
  }
  if (msg.type === "GET_PAGE_CONTEXT") {
    console.log('[Content] 收到 GET_PAGE_CONTEXT 请求，开始获取页面内容...');
    const content = getPageContent();
    const metadata = getPageMetadata();
    console.log('[Content] 返回页面内容，长度:', content.length, '字符，元信息:', metadata);
    return res({ content: content, metadata: metadata });
  }
});

// 设置监听
chrome.storage.onChanged.addListener(c => {
  if (c.enableDoubleClick) {
    doubleClickEnabled = c.enableDoubleClick.newValue === true;
    updateDoubleClickState();
  }
});

// 初始化
initDoubleClickSetting();
startPageChangeDetection();