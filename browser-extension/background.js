const HOST = 'com.joeyplanetart.smarttrans';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'smarttrans-translate', title: '用 smartTrans 翻译选中内容', contexts: ['selection'] });
  });
});

function nativeRequest(message) {
  return new Promise(resolve => {
    chrome.runtime.sendNativeMessage(HOST, message, response => {
      const error = chrome.runtime.lastError;
      resolve(error ? { ok: false, error: '无法连接 smartTrans。请先启动客户端并安装浏览器桥接。' }
        : response || { ok: false, error: '客户端没有响应。' });
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'smarttrans-translate' || !info.selectionText || !tab?.id) return;
  try {
    const requestId = crypto.randomUUID();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'show', requestId, original: info.selectionText });
    const response = await nativeRequest({ type: 'translate', text: info.selectionText });
    await chrome.tabs.sendMessage(tab.id, { type: 'result', requestId, response });
  } catch (error) {
    console.error('smartTrans 无法在此页面显示译文', error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'favorite') return;
  nativeRequest({ type: 'favorite', english: message.english, chinese: message.chinese })
    .then(sendResponse);
  return true;
});
