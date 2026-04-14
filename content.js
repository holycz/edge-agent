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
    return selection.toString().trim();
  } catch (e) {
    console.error("[Content] 获取选中文本失败:", e.message);
    return '';
  }
}

// 判断元素是否可见
function isVisible(element) {
  if (!element) return false;

  // 检查 hidden 属性
  if (element.hasAttribute('hidden') || element.hidden) return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0') {
    return false;
  }

  // 检查元素是否在视口内（对于 fixed/sticky 元素）
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // 元素没有尺寸，但可能是 visibility: hidden 或者有子元素
    // 如果 overflow 被裁剪，也可能是不可见的
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
    } catch (e) {
      // 忽略无效选择器
    }
  }
  return false;
}

// 从 Shadow DOM 中提取内容
function extractShadowDOMContent(element, collectedContent = []) {
  if (!element) return;

  try {
    // 检查元素是否有 Shadow Root
    if (element.shadowRoot) {
      const shadowContent = element.shadowRoot.textContent?.trim();
      if (shadowContent && shadowContent.length > 10) {
        collectedContent.push(`[Shadow DOM内容]: ${shadowContent}`);
      }

      // 递归检查 Shadow DOM 中的子元素
      element.shadowRoot.querySelectorAll('*').forEach(child => {
        extractShadowDOMContent(child, collectedContent);
      });
    }

    // 递归检查普通子元素
    element.querySelectorAll('*').forEach(child => {
      if (child.shadowRoot) {
        extractShadowDOMContent(child, collectedContent);
      }
    });
  } catch (e) {
    // 忽略 Shadow DOM 访问错误
    console.warn('[Content] 访问 Shadow DOM 失败:', e.message);
  }

  return collectedContent;
}

// 从 iframe 中提取内容
function extractIframeContent(collectedContent = []) {
  const iframes = document.querySelectorAll('iframe');

  iframes.forEach(iframe => {
    try {
      // 检查 iframe 是否可见
      if (!isVisible(iframe)) return;

      // 尝试访问 iframe 内容
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const iframeBody = iframeDoc.body;
        if (iframeBody) {
          const content = iframeBody.innerText?.trim();
          if (content && content.length > 50) {
            collectedContent.push(`[iframe内容]: ${content.substring(0, 2000)}...`);
          }
        }
      }
    } catch (e) {
      // 跨域 iframe 无法访问，忽略
      console.log('[Content] 无法访问 iframe (可能是跨域):', e.message);
    }
  });

  return collectedContent;
}

// OA系统审批意见相关选择器
const APPROVAL_COMMENT_SELECTORS = [
  // 泛微 OA
  '.wf-reqcomments-detail', '.req-comments-detail',
  '[class*="comment"][class*="detail"]', '[class*="approval"][class*="comment"]',
  '.sign-input-content', '.sign-content',
  // 致远 OA
  '.workflow-comments', '.approval-comments',
  '[class*="workflow"][class*="comment"]', '[class*="opinion"][class*="content"]',
  // 蓝凌 OA
  '.km-comment-content', '.km-approval-opinion',
  '[class*="km"][class*="opinion"]', '.lui-flowcomment-content',
  // 钉钉/宜搭
  '.dingtalk-comment', '.approval-node-comment',
  '[data-mark="comment"]', '[data-spm="comment"]',
  // 企业微信
  '.ww-comment', '.ww-approval-opinion',
  // 飞书
  '.lark-comment', '.lark-approval-opinion',
  // 通用审批相关
  '[class*="approval"][class*="opinion"]', '[class*="audit"][class*="comment"]',
  '[class*="review"][class*="comment"]', '[class*="check"][class*="opinion"]',
  // 富文本编辑器的审批意见
  '.cke_editable', '.ql-editor', '.tox-edit-area__iframe',
  // 表格中的审批列
  'td[class*="comment"]', 'td[class*="opinion"]',
  // 手风琴/折叠面板内的审批意见
  '.ant-collapse-content-box [class*="comment"]',
  '.el-collapse-item__content [class*="comment"]'
];

// 折叠/手风琴面板选择器
const COLLAPSIBLE_SELECTORS = [
  // Ant Design
  '.ant-collapse', '.ant-collapse-item', '.ant-collapse-content',
  // Element UI
  '.el-collapse', '.el-collapse-item', '.el-collapse-item__content',
  // Bootstrap
  '.accordion', '.accordion-item', '.accordion-collapse', '.collapse',
  // Material UI
  '.MuiAccordion-root', '.MuiAccordionDetails-root',
  // 通用
  '[class*="collapse"]:not([class*="bootstrap"])', '[class*="accordion"]',
  '[class*="expandable"]', '[class*="collapsible"]',
  // 自定义折叠面板
  '[role="region"][aria-expanded]', '[aria-expanded]',
  // 折叠详情
  'details', 'details > summary',
  // OA系统常用
  '.wf-panel', '.wf-section', '.req-detail-panel',
  '.flow-panel', '.process-panel', '.detail-panel',
  '[class*="panel"][class*="collapse"]', '[class*="section"][class*="collapse"]'
];

// 工作流/审批流程选择器
const WORKFLOW_SELECTORS = [
  // 流程节点
  '.workflow-node', '.process-node', '.approval-node',
  '.flow-node', '[class*="workflow"][class*="node"]',
  '[class*="process"][class*="step"]', '[class*="approval"][class*="step"]',
  // 流程图
  '.flow-chart', '.process-chart', '.workflow-chart',
  '.flow-diagram', '.process-diagram',
  // 步骤条
  '.ant-steps', '.el-steps', '[class*="step"][class*="list"]',
  // 时间线
  '.ant-timeline', '.el-timeline', '.timeline',
  '[class*="timeline"]', '[class*="time-line"]'
];

// 富文本编辑器内容选择器
const RICH_EDITOR_SELECTORS = [
  // CKEditor
  '.cke_editable', '.cke_contents',
  // Quill
  '.ql-editor', '.ql-container',
  // TinyMCE
  '.tox-edit-area', '.mce-content-body',
  // UEditor
  '.edui-editor-iframeholder', '.edui-body',
  // WangEditor
  '.w-e-text-container', '.w-e-text',
  // Draft.js
  '.DraftEditor-editorContainer',
  // Slate
  '[data-slate-editor]',
  // 通用 contenteditable
  '[contenteditable="true"]',
  // 设计器/表单编辑器
  '.form-designer', '.form-builder', '.form-render'
];

// 数据表格选择器（表单数据）
const DATA_TABLE_SELECTORS = [
  // Ant Design
  '.ant-table', '.ant-table-body',
  // Element UI
  '.el-table', '.el-table__body',
  // Bootstrap
  '.table', '.table-responsive',
  // Material UI
  '.MuiTable-root', '.MuiTableBody-root',
  // 数据网格
  '.data-grid', '.datagrid', '.data-table',
  // 明细表/子表
  '.detail-table', '.sub-table', '[class*="detail"][class*="table"]',
  '[class*="sub"][class*="table"]', '.child-table',
  // OA表单
  '.wf-field-table', '.req-detail-table',
  '.form-detail-table', '.main-table'
];

// 从折叠面板提取内容
function extractCollapsibleContent(collectedContent = []) {
  console.log("[Content] 开始提取折叠面板内容");

  const processed = new Set(); // 避免重复

  COLLAPSIBLE_SELECTORS.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, idx) => {
        try {
          // 跳过已处理的元素
          if (processed.has(el)) return;

          // 检查元素是否包含有效内容
          const text = el.innerText?.trim() || '';
          if (text.length < 20) return;

          // 尝试展开折叠面板以获取完整内容
          const clone = el.cloneNode(true);

          // 查找并展开所有折叠的内容
          const collapsedElements = clone.querySelectorAll([
            '[style*="display: none"]',
            '[style*="display:none"]',
            '.hidden', '.collapsed', '[aria-hidden="true"]',
            '[hidden]'
          ].join(','));

          collapsedElements.forEach(collapsed => {
            collapsed.style.display = 'block';
            collapsed.style.visibility = 'visible';
            collapsed.removeAttribute('hidden');
            collapsed.removeAttribute('aria-hidden');
          });

          const expandedContent = clone.innerText?.trim() || text;

          // 获取面板标题
          let title = '';
          const headerSelectors = [
            '.ant-collapse-header', '.el-collapse-item__header',
            '.accordion-header', 'summary', '[class*="header"][class*="collapse"]',
            '[role="button"][aria-expanded]'
          ];

          for (const headerSel of headerSelectors) {
            const header = el.querySelector(headerSel);
            if (header) {
              title = header.innerText?.trim()?.substring(0, 50);
              break;
            }
          }

          if (!title) {
            title = `折叠面板 ${idx + 1}`;
          }

          collectedContent.push({
            type: 'collapsible',
            title: title,
            content: expandedContent,
            selector: selector,
            length: expandedContent.length
          });

          processed.add(el);

          console.log(`[Content] 提取折叠面板 "${title}"，内容长度:`, expandedContent.length);
        } catch (e) {
          console.warn('[Content] 处理折叠面板元素失败:', e.message);
        }
      });
    } catch (e) {
      // 忽略无效选择器
    }
  });

  return collectedContent;
}

// 提取审批意见和评论
function extractApprovalComments(collectedContent = []) {
  console.log("[Content] 开始提取审批意见");

  const processed = new Set();

  APPROVAL_COMMENT_SELECTORS.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, idx) => {
        try {
          if (processed.has(el)) return;

          // 获取审批意见内容
          let content = '';

          // 如果是富文本编辑器，尝试获取 iframe 内容
          if (el.tagName === 'IFRAME') {
            try {
              const doc = el.contentDocument || el.contentWindow?.document;
              if (doc && doc.body) {
                content = doc.body.innerText?.trim() || doc.body.textContent?.trim() || '';
              }
            } catch (e) {
              // 跨域 iframe，尝试获取其他属性
              content = el.textContent?.trim() || '';
            }
          } else {
            content = el.innerText?.trim() || el.textContent?.trim() || '';
          }

          if (content.length < 5) return;

          // 获取审批人信息
          let approver = '';
          let time = '';
          let action = '';

          // 向上查找审批人信息
          let parent = el.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            // 查找审批人姓名
            const nameSelectors = [
              '[class*="name"]', '[class*="user"]', '[class*="approver"]',
              '[class*="operator"]', '[class*="handler"]',
              'strong', 'b', '.username', '.user-name'
            ];

            for (const nameSel of nameSelectors) {
              const nameEl = parent.querySelector(nameSel);
              if (nameEl && !approver) {
                approver = nameEl.innerText?.trim();
                if (approver.length > 20) approver = approver.substring(0, 20);
              }
            }

            // 查找时间
            const timeSelectors = [
              '[class*="time"]', '[class*="date"]', '[class*="datetime"]',
              'time', '[datetime]'
            ];

            for (const timeSel of timeSelectors) {
              const timeEl = parent.querySelector(timeSel);
              if (timeEl && !time) {
                time = timeEl.innerText?.trim() || timeEl.getAttribute('datetime');
              }
            }

            // 查找审批动作（同意、驳回等）
            const actionSelectors = [
              '[class*="action"]', '[class*="result"]', '[class*="status"]',
              '[class*="opinion"]', '.approval-result', '.flow-result'
            ];

            for (const actionSel of actionSelectors) {
              const actionEl = parent.querySelector(actionSel);
              if (actionEl && !action) {
                action = actionEl.innerText?.trim();
                if (action.length > 10) action = action.substring(0, 10);
              }
            }

            parent = parent.parentElement;
          }

          // 构建审批意见对象
          const comment = {
            type: 'approval_comment',
            approver: approver || '未知审批人',
            time: time || '',
            action: action || '',
            content: content,
            selector: selector
          };

          // 避免重复内容（检查是否已存在相似内容）
          const isDuplicate = collectedContent.some(c =>
            c.type === 'approval_comment' &&
            c.content.substring(0, 100) === content.substring(0, 100)
          );

          if (!isDuplicate) {
            collectedContent.push(comment);
            console.log(`[Content] 提取审批意见: ${approver} [${action}]，长度:`, content.length);
          }

          processed.add(el);
        } catch (e) {
          console.warn('[Content] 处理审批意见元素失败:', e.message);
        }
      });
    } catch (e) {
      // 忽略无效选择器
    }
  });

  return collectedContent;
}

// 提取工作流/审批流程信息
function extractWorkflowInfo(collectedContent = []) {
  console.log("[Content] 开始提取工作流信息");

  // 提取流程节点
  const nodes = [];
  WORKFLOW_SELECTORS.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        try {
          const text = el.innerText?.trim();
          if (text && text.length > 0 && text.length < 500) {
            // 检查是否包含节点信息
            if (text.includes('审批') || text.includes('审核') ||
                text.includes('同意') || text.includes('驳回') ||
                text.includes('待') || text.includes('处理') ||
                text.includes('已') || text.includes('通过')) {
              nodes.push(text);
            }
          }
        } catch (e) {}
      });
    } catch (e) {}
  });

  if (nodes.length > 0) {
    // 去重
    const uniqueNodes = [...new Set(nodes)];
    collectedContent.push({
      type: 'workflow_nodes',
      nodes: uniqueNodes.slice(0, 20), // 限制节点数量
      count: uniqueNodes.length
    });
    console.log('[Content] 提取工作流节点:', uniqueNodes.length, '个');
  }

  // 提取当前审批状态
  const statusSelectors = [
    '[class*="current"][class*="status"]', '[class*="active"][class*="step"]',
    '.current-node', '.active-node', '.current-status',
    '[class*="审批中"]', '[class*="进行中"]'
  ];

  for (const selector of statusSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const status = el.innerText?.trim();
        if (status) {
          collectedContent.push({
            type: 'current_status',
            status: status
          });
          console.log('[Content] 提取当前状态:', status);
          break;
        }
      }
    } catch (e) {}
  }

  return collectedContent;
}

// 提取数据表格内容
function extractDataTables(collectedContent = []) {
  console.log("[Content] 开始提取数据表格");

  DATA_TABLE_SELECTORS.forEach(selector => {
    try {
      const tables = document.querySelectorAll(selector);
      tables.forEach((table, idx) => {
        try {
          // 获取表头
          const headers = [];
          const headerSelectors = ['thead th', 'th', '[role="columnheader"]', '[class*="header"]', 'tr:first-child td'];

          for (const hSel of headerSelectors) {
            const headerCells = table.querySelectorAll(hSel);
            if (headerCells.length > 0) {
              headerCells.forEach(cell => {
                const text = cell.innerText?.trim();
                if (text) headers.push(text);
              });
              if (headers.length > 0) break;
            }
          }

          // 获取表格内容
          const rows = [];
          const rowSelectors = ['tbody tr', 'tr'];

          for (const rSel of rowSelectors) {
            const rowElements = table.querySelectorAll(rSel);
            if (rowElements.length > 0) {
              rowElements.forEach((row, rowIdx) => {
                if (rowIdx === 0 && headers.length > 0) return; // 跳过表头行

                const cells = row.querySelectorAll('td, th');
                const rowData = [];
                cells.forEach(cell => {
                  const text = cell.innerText?.trim();
                  if (text) rowData.push(text);
                });

                if (rowData.length > 0) {
                  rows.push(rowData);
                }
              });
              if (rows.length > 0) break;
            }
          }

          if (rows.length > 0) {
            const title = headers.length > 0 ? `表格: ${headers.join(', ').substring(0, 50)}` : `数据表 ${idx + 1}`;

            collectedContent.push({
              type: 'data_table',
              title: title,
              headers: headers.slice(0, 10),
              rows: rows.slice(0, 50), // 限制行数
              totalRows: rows.length
            });

            console.log(`[Content] 提取数据表 "${title}"，${rows.length} 行`);
          }
        } catch (e) {
          console.warn('[Content] 处理数据表失败:', e.message);
        }
      });
    } catch (e) {}
  });

  return collectedContent;
}

// 提取 Steps 组件的内容
function extractStepsContent(clone, original) {
  if (!clone || !clone.querySelector) return null;

  const stepsContainer = clone.querySelector('.ant-steps, [class*="steps"]');
  if (!stepsContainer) {
    return null;
  }

  console.log("[Content] 检测到 Steps 组件");

  const stepTitles = [];
  const stepElements = stepsContainer.querySelectorAll('.ant-steps-item, [class*="step-item"]');

  stepElements.forEach((step, idx) => {
    const titleEl = step.querySelector('.ant-steps-item-title, [class*="step-title"]');
    if (titleEl) {
      stepTitles.push(titleEl.innerText.trim() || `步骤 ${idx + 1}`);
    } else {
      const text = step.innerText.trim().split('\n')[0];
      stepTitles.push(text || `步骤 ${idx + 1}`);
    }
  });

  console.log("[Content] 发现 Steps 标题:", stepTitles);

  const allContent = [];
  const contentAreas = clone.querySelectorAll('.ant-card-body, .ant-card, [class*="card"]');
  contentAreas.forEach((area, idx) => {
    const content = area.innerText.trim();
    if (content.length > 50) {
      const title = stepTitles[idx] || `步骤 ${idx + 1}`;
      allContent.push({
        title: title,
        content: content
      });
    }
  });

  if (allContent.length > 0) {
    let result = `[包含 ${stepTitles.length} 个步骤/阶段]\n`;
    const seen = new Set();
    allContent.forEach(item => {
      const key = item.content.substring(0, 100);
      if (!seen.has(key)) {
        seen.add(key);
        result += `\n=== ${item.title} ===\n${item.content}\n`;
      }
    });
    return result.trim();
  }

  const fullContent = clone.innerText.trim();
  if (fullContent.length > 0) {
    const activeStep = stepTitles.find(title => fullContent.includes(title)) || stepTitles[0] || '当前步骤';

    let result = `[Steps 组件: ${stepTitles.length} 个步骤]\n`;
    result += `步骤列表: ${stepTitles.join(' → ')}\n`;
    result += `\n=== 当前显示: ${activeStep} ===\n${fullContent}\n`;

    if (stepTitles.length > 1) {
      result += `\n[提示: 其他 ${stepTitles.length - 1} 个步骤内容未加载，切换到其他步骤可查看]`;
    }

    return result.trim();
  }

  return null;
}

// 获取元素中的所有内容，包括隐藏的 Tab 面板
function getAllContentFromElement(element, includeHidden = true) {
  if (!includeHidden) {
    return element.innerText.trim();
  }

  const clone = element.cloneNode(true);

  if (hasTabStructure(element)) {
    console.log("[Content] 检测到 Tab/Steps 结构，提取所有内容");

    const stepsContent = extractStepsContent(clone, element);
    if (stepsContent) {
      return stepsContent;
    }

    const tabPanelSelectors = [
      '[role="tabpanel"]',
      '.tab-pane', '.tab-panel', '.tab-content > *',
      '.ant-tabs-tabpane', '.el-tab-pane', '.v-tab-item',
      '[class*="tab-pane"]', '[class*="tab-panel"]',
      '.tabs-content > *', '.tab-body > *'
    ];

    const panelContents = [];
    let tabIndex = 1;

    for (const selector of tabPanelSelectors) {
      try {
        const panels = clone.querySelectorAll(selector);
        panels.forEach((panel, idx) => {
          const content = panel.innerText.trim();
          if (content.length > 10) {
          let tabTitle = '';
          const tabId = panel.getAttribute('aria-labelledby');
          if (tabId) {
            // aria-labelledby 可能包含多个 ID，取第一个
            const firstId = tabId.split(/\s+/)[0];
            const tabEl = element.ownerDocument.getElementById(firstId);
            if (tabEl) {
              tabTitle = tabEl.innerText.trim();
            }
          }

            panelContents.push({
              index: tabIndex++,
              title: tabTitle || `Tab ${idx + 1}`,
              content: content,
              selector: selector
            });
          }
        });
      } catch (e) {
        // 忽略无效选择器
      }
    }

    if (panelContents.length > 0) {
      let result = `[包含 ${panelContents.length} 个 Tab]\n`;
      panelContents.forEach(panel => {
        result += `\n--- ${panel.title} ---\n${panel.content}\n`;
      });
      return result.trim();
    }
  }

  const contentAreas = clone.querySelectorAll('*');
  let hasHiddenContent = false;

  // 扩展的隐藏类名列表，包括OA系统常用的
  const hiddenClasses = [
    'hidden', 'hide', 'd-none', 'invisible', 'collapsed',
    'ant-collapse-content-hidden', 'el-collapse-item__content',
    'ant-tabs-tabpane-inactive', 'tab-pane-hidden',
    'panel-collapse', 'panel-body-collapse',
    '[class*="collapse"][class*="content"]', '[class*="fold"]',
    'closed', 'close', 'fold', 'unfolded', 'wrapped'
  ];

  contentAreas.forEach(el => {
    // 处理 style 中的 display:none
    const style = el.getAttribute('style');
    if (style) {
      const displayMatch = style.match(/display\s*:\s*none/i);
      const visibilityMatch = style.match(/visibility\s*:\s*hidden/i);
      if (displayMatch || visibilityMatch) {
        el.style.display = 'block';
        el.style.visibility = 'visible';
        hasHiddenContent = true;
      }
    }

    // 处理 height: 0 或 max-height: 0 的折叠内容
    const computedStyle = el.style;
    if (computedStyle) {
      if (computedStyle.height === '0px' || computedStyle.height === '0') {
        el.style.height = 'auto';
        hasHiddenContent = true;
      }
      if (computedStyle.maxHeight === '0px' || computedStyle.maxHeight === '0') {
        el.style.maxHeight = 'none';
        hasHiddenContent = true;
      }
    }

    // 处理隐藏类名
    hiddenClasses.forEach(cls => {
      try {
        if (el.classList.contains(cls)) {
          el.classList.remove(cls);
          // 添加显示类名
          el.classList.add('show', 'active', 'open');
          hasHiddenContent = true;
        }
      } catch (e) {
        // 忽略类名操作错误
      }
    });

    // 移除影响显示的属性
    const hideAttrs = ['hidden', 'aria-hidden', 'data-collapsed', 'data-folded'];
    hideAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) {
        if (attr === 'hidden') {
          el.removeAttribute('hidden');
        } else {
          el.setAttribute(attr, 'false');
        }
        hasHiddenContent = true;
      }
    });

    // 处理 aria-expanded
    if (el.getAttribute('aria-expanded') === 'false') {
      el.setAttribute('aria-expanded', 'true');
    }
  });

  const content = clone.innerText?.trim() || '';

  if (hasHiddenContent) {
    console.log("[Content] 提取到包含隐藏区域的内容，长度:", content.length);
  }

  return content;
}

// 获取弹窗内容
function getModalContent() {
  console.log("[Content] 开始获取弹窗内容");
  const modalContents = [];

  try {
    const dialogs = document.querySelectorAll('dialog');
    dialogs.forEach(dialog => {
      try {
        if (isVisible(dialog)) {
          const content = getAllContentFromElement(dialog, true);
          if (content.length > 0) {
            modalContents.push({
              type: 'dialog',
              content: content,
              hasTabs: hasTabStructure(dialog),
              open: dialog.open || dialog.matches(':modal') || dialog.matches(':open')
            });
            console.log("[Content] 发现 <dialog> 元素，内容长度:", content.length, "包含Tab:", hasTabStructure(dialog));
          }
        }
      } catch (e) {
        console.warn("[Content] 处理 <dialog> 元素时出错:", e.message);
      }
    });
  } catch (e) {
    console.error("[Content] 查询 <dialog> 元素失败:", e.message);
  }

  try {
    const ariaDialogs = document.querySelectorAll('[role="dialog"]');
    ariaDialogs.forEach(dialog => {
      try {
        if (isVisible(dialog)) {
          const content = getAllContentFromElement(dialog, true);
          if (content.length > 0) {
            modalContents.push({
              type: 'aria-dialog',
              content: content,
              hasTabs: hasTabStructure(dialog)
            });
            console.log("[Content] 发现 role='dialog' 元素，内容长度:", content.length, "包含Tab:", hasTabStructure(dialog));
          }
        }
      } catch (e) {
        console.warn("[Content] 处理 role='dialog' 元素时出错:", e.message);
      }
    });
  } catch (e) {
    console.error("[Content] 查询 role='dialog' 元素失败:", e.message);
  }

  try {
    const alertDialogs = document.querySelectorAll('[role="alertdialog"]');
    alertDialogs.forEach(dialog => {
      try {
        if (isVisible(dialog)) {
          const content = getAllContentFromElement(dialog, true);
          if (content.length > 0) {
            modalContents.push({
              type: 'alertdialog',
              content: content,
              hasTabs: hasTabStructure(dialog)
            });
            console.log("[Content] 发现 role='alertdialog' 元素，内容长度:", content.length, "包含Tab:", hasTabStructure(dialog));
          }
        }
      } catch (e) {
        console.warn("[Content] 处理 role='alertdialog' 元素时出错:", e.message);
      }
    });
  } catch (e) {
    console.error("[Content] 查询 role='alertdialog' 元素失败:", e.message);
  }

  const modalSelectors = [
    '.modal', '.modal-dialog', '.modal-content',
    '[class*="modal"]', '[class*="dialog"]',
    '.popup', '.pop-up', '[class*="popup"]',
    '.overlay', '[class*="overlay"]',
    '.layer', '[class*="layer"]'
  ];

  modalSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        try {
          if (isVisible(el)) {
            const content = getAllContentFromElement(el, true);
            if (content.length > 20) {
              modalContents.push({
                type: 'class-modal',
                selector: selector,
                content: content,
                hasTabs: hasTabStructure(el)
              });
              console.log("[Content] 发现弹窗类元素 (", selector, ")，内容长度:", content.length, "包含Tab:", hasTabStructure(el));
            }
          }
        } catch (e) {
          // 忽略单个元素处理错误
        }
      });
    } catch (e) {
      // 忽略无效的选择器
    }
  });

  try {
    const popovers = document.querySelectorAll('[popover]');
    popovers.forEach(popover => {
      try {
        if (isVisible(popover)) {
          const content = getAllContentFromElement(popover, true);
          if (content.length > 0) {
        modalContents.push({
          type: 'popover',
          content: content,
          hasTabs: hasTabStructure(popover)
        });
            console.log("[Content] 发现 popover 元素，内容长度:", content.length, "包含Tab:", hasTabStructure(popover));
          }
        }
      } catch (e) {
        console.warn("[Content] 处理 popover 元素时出错:", e.message);
      }
    });
  } catch (e) {
    console.error("[Content] 查询 popover 元素失败:", e.message);
  }

  try {
    const allElements = document.querySelectorAll('div, section, aside');
    allElements.forEach(el => {
      try {
        const style = window.getComputedStyle(el);
        const zIndex = parseInt(style.zIndex);
        const position = style.position;

        if ((position === 'fixed' || position === 'sticky') && zIndex > 100) {
          const content = getAllContentFromElement(el, true);
          if (content.length > 50 && content.length < 5000) {
            const isAlreadyIncluded = modalContents.some(m =>
              m.content === content || content.includes(m.content)
            );
            if (!isAlreadyIncluded) {
              modalContents.push({
                type: 'floating',
                position: position,
                zIndex: zIndex,
                content: content,
                hasTabs: hasTabStructure(el)
              });
              console.log("[Content] 发现浮动弹窗元素 (z-index:", zIndex, ")，内容长度:", content.length, "包含Tab:", hasTabStructure(el));
            }
          }
        }
      } catch (e) {
        // 忽略单个元素处理错误
      }
    });
  } catch (e) {
    console.error("[Content] 查询浮动元素失败:", e.message);
  }

  console.log("[Content] 共发现", modalContents.length, "个弹窗/模态框");
  return modalContents;
}

// 内容长度限制（字符数），避免返回过长内容
// 注意：这个限制应该大于 sidepanel.js 中的 contextLength，以允许 sidepanel 有足够的空间进行后续截断
const MAX_CONTENT_LENGTH = 25000;

// 智能截断内容，优先保留重要部分
function truncateContent(content, maxLength) {
  if (!content || content.length <= maxLength) {
    return content;
  }

  console.log("[Content] 内容需要截断，原始长度:", content.length, "限制:", maxLength);

  // 定义关键内容区域标记（按优先级排序）
  const criticalSectionDefs = [
    { start: '=== 审批意见/评论 ===', end: '=== 审批意见结束 ===', priority: 1 },
    { start: '=== 当前弹窗/模态框内容 ===', end: '=== 弹窗内容结束 ===', priority: 2 },
    { start: '=== 审批流程信息 ===', end: '=== 审批流程信息结束 ===', priority: 3 },
    { start: '=== 数据表格 ===', end: '=== 数据表格结束 ===', priority: 4 },
    { start: '=== 折叠面板内容 ===', end: '=== 折叠面板内容结束 ===', priority: 5 }
  ];

  // 提取所有关键内容区域
  const extractedSections = [];
  let remainingContent = content;

  for (const def of criticalSectionDefs) {
    const startIdx = remainingContent.indexOf(def.start);
    const endIdx = remainingContent.indexOf(def.end);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      // 提取关键内容（包含标记）
      const sectionContent = remainingContent.substring(startIdx, endIdx + def.end.length);
      extractedSections.push({
        content: sectionContent,
        priority: def.priority,
        length: sectionContent.length,
        start: def.start,
        end: def.end
      });

      // 从剩余内容中移除这部分
      remainingContent = remainingContent.substring(0, startIdx) + remainingContent.substring(endIdx + def.end.length);
    }
  }

  // 计算关键内容的总长度
  const criticalTotalLength = extractedSections.reduce((sum, s) => sum + s.length, 0);

  // 如果关键内容本身就超过了限制，只保留关键内容（按优先级排序）
  if (criticalTotalLength > maxLength) {
    console.log("[Content] 关键内容超过限制，优先保留高优先级内容");

    // 按优先级排序
    extractedSections.sort((a, b) => a.priority - b.priority);

    let result = '';
    let currentLength = 0;

    for (const section of extractedSections) {
      if (currentLength + section.length <= maxLength) {
        result += section.content + '\n\n';
        currentLength += section.length + 2;
      } else {
        // 部分添加，保留最重要的审批意见
        if (section.priority === 1) { // 审批意见是最高优先级
          const availableLength = maxLength - currentLength - 50;
          if (availableLength > 200) {
            result += section.start + '\n';
            result += section.content.substring(section.start.length, section.start.length + availableLength);
            result += '\n...(审批意见已部分截断)...\n' + section.end + '\n\n';
          }
        }
        break;
      }
    }

    return result.trim() + '\n\n[注意：主体内容已被截断，仅保留关键信息]';
  }

  // 关键内容未超过限制，保留关键内容 + 部分主体内容
  const availableForBody = maxLength - criticalTotalLength - 100;

  // 提取主体内容（在关键内容标记之外的部分）
  let bodyContent = remainingContent.trim();
  if (bodyContent.length > availableForBody) {
    // 找到合适的截断点（尽量在段落边界）
    let truncatePoint = availableForBody;
    const paragraphBreak = bodyContent.lastIndexOf('\n\n', truncatePoint);
    const lineBreak = bodyContent.lastIndexOf('\n', truncatePoint);

    if (paragraphBreak > truncatePoint * 0.7) {
      truncatePoint = paragraphBreak;
    } else if (lineBreak > truncatePoint * 0.8) {
      truncatePoint = lineBreak;
    }

    bodyContent = bodyContent.substring(0, truncatePoint) + '\n\n...(主体内容已截断，保留 ' + Math.round(truncatePoint / bodyContent.length * 100) + '%)';
  }

  // 按原始顺序组装内容（审批意见 -> 弹窗 -> 流程信息 -> 数据表格 -> 折叠面板）
  extractedSections.sort((a, b) => {
    const aIndex = content.indexOf(a.content);
    const bIndex = content.indexOf(b.content);
    return aIndex - bIndex;
  });

  let result = '';

  // 先添加主体内容
  if (bodyContent) {
    result += '=== 页面主体内容 ===\n' + bodyContent + '\n\n';
  }

  // 再添加关键内容
  for (const section of extractedSections) {
    result += section.content + '\n\n';
  }

  return result.trim();
}

// 知乎特定内容提取选择器
const ZHIHU_CONTENT_SELECTORS = [
  // 知乎文章主内容区 - 文章详情页
  '.Post-RichTextContainer',
  '.Post-content',
  '.Post-NormalMain .RichText',
  '.Post-NormalMain',
  // 知乎回答内容区
  '.RichContent-inner',
  '.RichContent--unescapable',
  '.RichContent',
  '.RichText',
  '[class*="RichText"]',
  // 问题页面
  '.QuestionRichText-content',
  '.QuestionRichText',
  '.QuestionHeader-detail',
  // 回答列表项
  '.List-item .ContentItem-content',
  '.List-item .RichContent',
  '.List-item',
  '.AnswerCard-content',
  '.ContentItem-content',
  '.ContentItem-main',
  '.ContentItem',
  // 文章内容
  '.Article-content',
  '.Article-title',
  '[itemprop="articleBody"]',
  // 热榜/推荐
  '.TopstoryItem .ContentItem-content',
  '.TopstoryItem',
  // 通用内容容器
  '.Card .ContentItem',
  '.Card'
];

// 知乎内容过滤 - 移除 CSS 变量等无关内容
function cleanZhihuContent(content) {
  if (!content) return '';

  // 只过滤明显的 CSS 变量行（以 -- 开头，包含冒号和数字）
  // 保留其他所有内容，包括正文中的代码块
  let cleaned = content.split('\n').filter(line => {
    const trimmed = line.trim();

    // 保留非空行
    if (trimmed.length === 0) return true; // 保留空行作为段落分隔

    // 只过滤纯 CSS 变量行（如: --semi-grey-9:249,249,249;）
    if (/^--[a-z0-9-]+:\s*[\d,\s;]+$/.test(trimmed)) return false;
    if (/^--[a-z0-9-]+:\s*#?[\da-f]+;?$/i.test(trimmed)) return false;

    // 过滤纯 RGB 颜色值行
    if (/^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(trimmed)) return false;

    return true;
  }).join('\n');

  return cleaned.trim();
}

// 获取网页正文内容
function getPageContent() {
  console.log("[Content] 开始获取页面内容");

  const contents = [];
  let specialContents = [];

  // 获取弹窗内容
  const modalContents = getModalContent();
  if (modalContents.length > 0) {
    specialContents.push("=== 当前弹窗/模态框内容 ===");
    modalContents.forEach((modal, index) => {
      specialContents.push(`\n--- 弹窗 ${index + 1} [${modal.type}] ---`);
      specialContents.push(modal.content);
    });
    specialContents.push("\n=== 弹窗内容结束 ===\n");
  }

  // 获取折叠面板内容
  const collapsibleContents = [];
  extractCollapsibleContent(collapsibleContents);
  if (collapsibleContents.length > 0) {
    specialContents.push("=== 折叠面板内容 ===");
    collapsibleContents.forEach(item => {
      specialContents.push(`\n--- ${item.title} ---`);
      specialContents.push(item.content);
    });
    specialContents.push("\n=== 折叠面板内容结束 ===\n");
  }

  // 获取审批意见
  const approvalComments = [];
  extractApprovalComments(approvalComments);
  if (approvalComments.length > 0) {
    specialContents.push("=== 审批意见/评论 ===");
    approvalComments.forEach(comment => {
      const header = `[${comment.approver}${comment.action ? ' - ' + comment.action : ''}${comment.time ? ' - ' + comment.time : ''}]`;
      specialContents.push(`\n${header}`);
      specialContents.push(comment.content);
    });
    specialContents.push("\n=== 审批意见结束 ===\n");
  }

  // 获取工作流信息
  const workflowInfo = [];
  extractWorkflowInfo(workflowInfo);
  if (workflowInfo.length > 0) {
    const workflowNodes = workflowInfo.find(i => i.type === 'workflow_nodes');
    const currentStatus = workflowInfo.find(i => i.type === 'current_status');

    if (workflowNodes || currentStatus) {
      specialContents.push("=== 审批流程信息 ===");
      if (currentStatus) {
        specialContents.push(`当前状态: ${currentStatus.status}`);
      }
      if (workflowNodes && workflowNodes.nodes.length > 0) {
        specialContents.push(`\n流程节点: ${workflowNodes.nodes.join(' → ')}`);
      }
      specialContents.push("\n=== 审批流程信息结束 ===\n");
    }
  }

  // 获取数据表格
  const dataTables = [];
  extractDataTables(dataTables);
  if (dataTables.length > 0) {
    specialContents.push("=== 数据表格 ===");
    dataTables.forEach(table => {
      specialContents.push(`\n--- ${table.title} ---`);
      if (table.headers.length > 0) {
        specialContents.push(`表头: ${table.headers.join(' | ')}`);
      }
      specialContents.push(`共 ${table.totalRows} 行数据`);
      table.rows.slice(0, 10).forEach((row, idx) => {
        specialContents.push(` 行${idx + 1}: ${row.join(' | ')}`);
      });
      if (table.totalRows > 10) {
        specialContents.push(` ...(还有 ${table.totalRows - 10} 行未显示)`);
      }
    });
    specialContents.push("\n=== 数据表格结束 ===\n");
  }

  // 获取 Shadow DOM 内容
  const shadowContents = [];
  extractShadowDOMContent(document.body, shadowContents);
  if (shadowContents.length > 0) {
    specialContents.push("=== Shadow DOM 内容 ===");
    shadowContents.forEach(c => specialContents.push(c));
    specialContents.push("=== Shadow DOM 内容结束 ===\n");
  }

  // 获取 iframe 内容
  const iframeContents = [];
  extractIframeContent(iframeContents);
  if (iframeContents.length > 0) {
    specialContents.push("=== iframe 内容 ===");
    iframeContents.forEach(c => specialContents.push(c));
    specialContents.push("=== iframe 内容结束 ===\n");
  }

  // 检测是否是知乎页面
  const isZhihu = window.location.hostname.includes('zhihu.com');
  if (isZhihu) {
    console.log("[Content] 检测到知乎页面，使用知乎特定提取逻辑");
    console.log("[Content] 当前URL:", window.location.href);
    console.log("[Content] 页面标题:", document.title);

    let zhihuContent = '';
    let bestSelector = '';
    let maxLength = 0;

    // 尝试从知乎特定的选择器提取内容
    for (const selector of ZHIHU_CONTENT_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const selectorContents = [];
          elements.forEach((el, idx) => {
            const text = el.innerText?.trim();
            if (text && text.length > 50) { // 提高阈值，过滤掉短内容
              selectorContents.push(text);
            }
          });
          const totalLength = selectorContents.join('\n\n').length;
          if (totalLength > 0) {
            console.log(`[Content] 知乎选择器 "${selector}" 匹配到 ${elements.length} 个元素，有效内容长度: ${totalLength}`);
          }

          // 选择内容最长的选择器
          if (totalLength > maxLength) {
            maxLength = totalLength;
            zhihuContent = selectorContents.join('\n\n');
            bestSelector = selector;
          }
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }

    console.log(`[Content] 最佳知乎选择器: "${bestSelector}"，原始内容长度: ${zhihuContent.length}`);

    // 如果知乎特定选择器没有获取到足够内容，尝试从整个页面提取
    if (zhihuContent.length < 500) {
      console.log("[Content] 知乎特定选择器获取内容不足，尝试从 body 提取");
      const bodyText = document.body.innerText?.trim() || '';
      // 过滤掉脚本和样式
      const filteredText = bodyText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

      if (filteredText.length > zhihuContent.length) {
        zhihuContent = filteredText;
        bestSelector = 'body.innerText (fallback)';
        console.log(`[Content] 从 body 获取内容，长度: ${zhihuContent.length}`);
      }
    }

    // 清理知乎内容
    const cleanedContent = cleanZhihuContent(zhihuContent);
    console.log(`[Content] 清理后内容长度: ${cleanedContent.length} (过滤掉 ${zhihuContent.length - cleanedContent.length} 字符)`);

    if (cleanedContent.length > 0) {
      contents.push("=== 页面主体内容（知乎） ===");
      contents.push(cleanedContent);
      // 合并特殊内容
      contents.unshift(...specialContents);
      const result = truncateContent(contents.join('\n'), MAX_CONTENT_LENGTH);
      console.log("[Content] 最终返回内容长度:", result.length);
      return result;
    }
  }

  // 尝试从 article 获取内容
  const article = document.querySelector('article');
  if (article) {
    const content = getAllContentFromElement(article, false);
    console.log("[Content] 从 <article> 获取内容，长度:", content.length);
    if (content.length > 0) {
      contents.push("=== 页面主体内容（来自 article） ===");
      contents.push(content);
    }
    // 合并特殊内容
    contents.unshift(...specialContents);
    return truncateContent(contents.join('\n'), MAX_CONTENT_LENGTH);
  }

  // 尝试从 main 获取内容
  const main = document.querySelector('main');
  if (main) {
    const content = getAllContentFromElement(main, false);
    console.log("[Content] 从 <main> 获取内容，长度:", content.length);
    if (content.length > 0) {
      contents.push("=== 页面主体内容（来自 main） ===");
      contents.push(content);
    }
    // 合并特殊内容
    contents.unshift(...specialContents);
    return truncateContent(contents.join('\n'), MAX_CONTENT_LENGTH);
  }

  // 从 body 获取内容
  const body = document.body;
  const excludeTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript'];

  try {
    const clone = body.cloneNode(true);

    excludeTags.forEach(tag => {
      const elements = clone.querySelectorAll(tag);
      elements.forEach(el => el.remove());
    });

    const commonSelectors = [
      '.sidebar', '.nav', '.navigation', '.menu', '.header', '.footer',
      '.advertisement', '.ads', '.comments', '.social-share',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
    ];
    commonSelectors.forEach(selector => {
      try {
        const elements = clone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {
        // 忽略无效选择器
      }
    });

    const content = clone.innerText?.trim() || '';
    console.log("[Content] 从 body 获取内容，长度:", content.length);
    if (content.length > 0) {
      contents.push("=== 页面主体内容（来自 body） ===");
      contents.push(content);
    }
  } catch (e) {
    console.error("[Content] 从 body 获取内容失败:", e);
  }

  // 合并特殊内容
  contents.unshift(...specialContents);

  const result = contents.join('\n');

  // 截断过长内容
  return truncateContent(result, MAX_CONTENT_LENGTH);
}

// 获取网页元信息
function getPageMetadata() {
  const title = document.title || '';
  const url = window.location.href;
  const description = document.querySelector('meta[name="description"]')?.content || '';
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';

  return { title, url, description, keywords };
}

// 双击事件处理函数
async function handleDoubleClick(e) {
  if (!doubleClickEnabled) return;

  const selectedText = getSelectedText();
  if (!selectedText) {
    try {
      await chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
    } catch (e) {
      console.error("[Content] 打开侧边栏失败:", e);
    }
  }
}

// 更新双击事件监听状态
function updateDoubleClickState() {
  if (doubleClickEnabled) {
    document.addEventListener('dblclick', handleDoubleClick);
    console.log("[Content] 双击唤醒功能已启用");
  } else {
    document.removeEventListener('dblclick', handleDoubleClick);
    console.log("[Content] 双击唤醒功能已禁用");
  }
}

// 初始化：读取双击设置
async function initDoubleClickSetting() {
  try {
    const result = await chrome.storage.sync.get('enableDoubleClick');
    doubleClickEnabled = result.enableDoubleClick === true;
    updateDoubleClickState();
  } catch (e) {
    console.error("[Content] 读取双击设置失败:", e);
  }
}

// 监听设置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.enableDoubleClick) {
    doubleClickEnabled = changes.enableDoubleClick.newValue === true;
    updateDoubleClickState();
  }
});

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SELECTED_TEXT") {
    const text = getSelectedText();
    sendResponse({ text });
    return true;
  }

  if (msg.type === "GET_PAGE_CONTEXT") {
    try {
      console.log("[Content] 收到 GET_PAGE_CONTEXT 请求");
      const content = getPageContent();
      const metadata = getPageMetadata();

      if (!content || content.length === 0) {
        console.warn("[Content] 获取到的内容为空");
        sendResponse({ content: "", metadata: metadata, error: "内容为空" });
      } else {
        console.log("[Content] 返回内容，长度:", content.length);
        sendResponse({
          content: content,
          metadata: metadata
        });
      }
    } catch (e) {
      console.error("[Content] 获取页面上下文失败:", e);
      sendResponse({ content: "", metadata: {}, error: e.message });
    }
    return true;
  }
});

// 启动初始化
initDoubleClickSetting();

// 启动页面变化检测
startPageChangeDetection();

// 页面变化检测
function startPageChangeDetection() {
  if (isObserving) return;
  
  console.log("[Content] 启动页面变化检测");
  isObserving = true;
  
  // 使用 MutationObserver 监听 DOM 变化
  pageChangeObserver = new MutationObserver((mutations) => {
    // 过滤掉不重要的变化（如属性变化、文本微变等）
    const significantChange = mutations.some(mutation => {
      // 忽略属性变化
      if (mutation.type === 'attributes') return false;
      
      // 检查是否有新增或删除的节点
      if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
        // 过滤掉脚本、样式等无关节点
        const hasMeaningfulChange = [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          const tagName = node.tagName?.toLowerCase();
          return !['script', 'style', 'link', 'meta', 'noscript'].includes(tagName);
        });
        return hasMeaningfulChange;
      }
      
      return false;
    });
    
    if (significantChange) {
      // 防抖：延迟发送，避免频繁触发
      clearTimeout(pageChangeTimeout);
      pageChangeTimeout = setTimeout(() => {
        notifyPageChanged();
      }, 1000);
    }
  });
  
  // 监听整个 document 的变化
  pageChangeObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  // 监听 URL 变化（用于 SPA 单页应用）
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log("[Content] URL 变化检测到:", currentUrl);
      setTimeout(() => notifyPageChanged(), 500);
    }
  }).observe(document, { subtree: true, childList: true });
}

// 生成内容哈希（用于更精确地检测内容变化）
function generateContentHash(content) {
  if (!content) return '';

  // 清理内容：去除多余空白，提取关键文本
  const cleaned = content
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 800); // 增加采样长度到800字符

  // 使用简单的哈希算法
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转为32位整数
  }

  // 同时保存原始内容长度作为辅助判断
  return `${hash}_${content.length}`;
}

// 通知页面已变化
function notifyPageChanged() {
  try {
    // 获取当前内容哈希，避免重复通知相同内容
    const currentContent = getPageContent();
    const contentHash = generateContentHash(currentContent);

    if (contentHash !== lastPageContent) {
      lastPageContent = contentHash;
      console.log("[Content] 页面内容发生变化，通知 sidepanel");

      // 发送消息给 sidepanel
      chrome.runtime.sendMessage({
        type: "PAGE_CONTENT_CHANGED",
        url: location.href,
        title: document.title
      }).catch(e => {
        // sidepanel 可能未打开，忽略错误
        console.log("[Content] 发送变化通知失败（sidepanel 可能未打开）:", e.message);
      });
    }
  } catch (e) {
    console.error("[Content] 检测页面变化失败:", e);
  }
}
