// 双击功能状态
let doubleClickEnabled = false;

// 页面变化检测
let pageChangeObserver = null;
let pageChangeTimeout = null;
let lastPageContent = '';
let isObserving = false;

// 获取选中的文本
function getSelectedText() {
  return window.getSelection().toString().trim();
}

// 判断元素是否可见
function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0';
}

// 判断元素是否包含 Tab 结构
function hasTabStructure(element) {
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

// 提取 Steps 组件的内容
function extractStepsContent(clone, original) {
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
              const tabEl = element.ownerDocument.getElementById(tabId);
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

  contentAreas.forEach(el => {
    const style = el.getAttribute('style');
    if (style && (style.includes('display:none') || style.includes('display: none'))) {
      el.removeAttribute('style');
      hasHiddenContent = true;
    }

    const hiddenClasses = ['hidden', 'hide', 'd-none', 'invisible', 'collapsed'];
    hiddenClasses.forEach(cls => {
      if (el.classList.contains(cls)) {
        el.classList.remove(cls);
        hasHiddenContent = true;
      }
    });
  });

  const content = clone.innerText.trim();

  if (hasHiddenContent) {
    console.log("[Content] 提取到包含隐藏区域的内容，长度:", content.length);
  }

  return content;
}

// 获取弹窗内容
function getModalContent() {
  console.log("[Content] 开始获取弹窗内容");
  const modalContents = [];

  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach(dialog => {
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
  });

  const ariaDialogs = document.querySelectorAll('[role="dialog"]');
  ariaDialogs.forEach(dialog => {
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
  });

  const alertDialogs = document.querySelectorAll('[role="alertdialog"]');
  alertDialogs.forEach(dialog => {
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
  });

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
      });
    } catch (e) {
      // 忽略无效的选择器
    }
  });

  const popovers = document.querySelectorAll('[popover]');
  popovers.forEach(popover => {
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
  });

  const allElements = document.querySelectorAll('div, section, aside');
  allElements.forEach(el => {
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
  });

  console.log("[Content] 共发现", modalContents.length, "个弹窗/模态框");
  return modalContents;
}

// 内容长度限制（字符数），避免返回过长内容
const MAX_CONTENT_LENGTH = 15000;

// 智能截断内容，优先保留重要部分
function truncateContent(content, maxLength) {
  if (!content || content.length <= maxLength) {
    return content;
  }
  
  console.log("[Content] 内容需要截断，原始长度:", content.length, "限制:", maxLength);
  
  // 优先保留弹窗内容（通常在前面）
  const modalEndIndex = content.indexOf('=== 弹窗内容结束 ===');
  if (modalEndIndex > 0 && modalEndIndex < maxLength) {
    // 有弹窗内容且在限制范围内，保留弹窗+部分主体内容
    const remainingLength = maxLength - modalEndIndex - 30;
    return content.substring(0, modalEndIndex + 25) + '\n...(主体内容已截断)';
  }
  
  // 简单截断
  return content.substring(0, maxLength) + '\n...(内容已截断)';
}

// 获取网页正文内容
function getPageContent() {
  console.log("[Content] 开始获取页面内容");

  const contents = [];

  const modalContents = getModalContent();
  if (modalContents.length > 0) {
    contents.push("=== 当前弹窗/模态框内容 ===");
    modalContents.forEach((modal, index) => {
      contents.push(`\n--- 弹窗 ${index + 1} [${modal.type}] ---`);
      contents.push(modal.content);
    });
    contents.push("\n=== 弹窗内容结束 ===\n");
  }

  const article = document.querySelector('article');
  if (article) {
    const content = article.innerText.trim();
    console.log("[Content] 从 <article> 获取内容，长度:", content.length);
    if (content.length > 0) {
      contents.push("=== 页面主体内容（来自 article） ===");
      contents.push(content);
    }
    return contents.join('\n');
  }

  const main = document.querySelector('main');
  if (main) {
    const content = main.innerText.trim();
    console.log("[Content] 从 <main> 获取内容，长度:", content.length);
    if (content.length > 0) {
      contents.push("=== 页面主体内容（来自 main） ===");
      contents.push(content);
    }
    return contents.join('\n');
  }

  const body = document.body;
  const excludeTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript'];

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
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  const content = clone.innerText.trim();
  console.log("[Content] 从 body 获取内容，长度:", content.length);
  if (content.length > 0) {
    contents.push("=== 页面主体内容（来自 body） ===");
    contents.push(content);
  }

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

// 通知页面已变化
function notifyPageChanged() {
  try {
    // 获取当前内容哈希，避免重复通知相同内容
    const currentContent = getPageContent();
    const contentHash = currentContent.substring(0, 500); // 取前500字符作为标识
    
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
