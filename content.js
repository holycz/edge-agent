// 获取选中的文本
function getSelectedText() {
  return window.getSelection().toString().trim();
}

// 双击打开侧边栏（如果没有选中文本）
document.ondblclick = async (e) => {
  const selectedText = getSelectedText();
  if (!selectedText) {
    // 发送消息给 background 打开侧边栏
    await chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
  }
};

// 监听来自 background 的消息（右键菜单触发）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SELECTED_TEXT") {
    const text = getSelectedText();
    sendResponse({ text });
  }
});
