(() => {
  if (window.__smartTransOverlayReady) return;
  window.__smartTransOverlayReady = true;
  let host;
  let original = '';
  let translation = '';
  let target = '';
  let activeRequestId = '';
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  };
  function show() {
    host?.remove();
    host = element('div');
    host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    const style = element('style');
    style.textContent = `*{box-sizing:border-box} .card{width:min(420px,calc(100vw - 40px));max-height:min(68vh,600px);overflow:auto;background:#fff;color:#263728;border:1px solid #d7e3d5;border-radius:13px;box-shadow:0 12px 42px #0003;font:14px/1.55 system-ui,sans-serif;padding:16px}header{display:flex;align-items:center;justify-content:space-between;font-weight:700;margin-bottom:10px}button{font:inherit;cursor:pointer;border:1px solid #d5e1d1;background:#f5f9f3;border-radius:7px;color:#345539;padding:5px 9px}button:disabled{opacity:.5;cursor:default}.close{border:0;background:none;font-size:20px;line-height:1}.label{color:#819080;font-size:11px;margin-top:10px}.text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:170px;overflow:auto}.actions{display:flex;gap:7px;margin-top:13px}.status{font-size:12px;color:#74836f;margin-top:9px}`;
    const card = element('section', 'card');
    const header = element('header');
    header.append(element('span', '', 'smartTrans 选区翻译'));
    const close = element('button', 'close', '×');
    close.title = '关闭'; close.addEventListener('click', () => { host.remove(); host = null; });
    header.append(close);
    card.append(header, element('div', 'label', '原文'), element('div', 'text', original),
      element('div', 'label', '译文'));
    const output = element('div', 'text', '正在翻译…');
    const actions = element('div', 'actions');
    const copy = element('button', '', '复制译文');
    const favorite = element('button', '', '☆ 收藏');
    copy.disabled = favorite.disabled = true;
    const status = element('div', 'status');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(translation); status.textContent = '已复制译文。'; }
      catch { status.textContent = '复制失败，请手动选中译文。'; }
    });
    favorite.addEventListener('click', async () => {
      const english = target === 'en' ? translation : original;
      const chinese = target === 'en' ? original : translation;
      favorite.disabled = true;
      try {
        const response = await chrome.runtime.sendMessage({ type: 'favorite', english, chinese });
        status.textContent = response?.ok ? response.duplicate ? '已在客户端收藏本中。' : '已保存到客户端收藏本。'
          : response?.error || '收藏失败。';
        if (!response?.ok) favorite.disabled = false;
      } catch {
        status.textContent = '收藏失败，请检查客户端连接。';
        favorite.disabled = false;
      }
    });
    actions.append(copy, favorite);
    card.append(output, actions, status); root.append(style, card);
    document.documentElement.append(host);
    return { output, copy, favorite, status };
  }
  let view;
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'show') {
      activeRequestId = message.requestId;
      original = message.original; translation = ''; target = '';
      view = show();
    }
    if (message?.type === 'result' && view && message.requestId === activeRequestId) {
      if (!message.response?.ok) { view.output.textContent = message.response?.error || '翻译失败。'; return; }
      translation = message.response.translation;
      target = message.response.target;
      view.output.textContent = translation;
      view.copy.disabled = false;
      view.favorite.disabled = (target === 'en' ? translation : original).length > 2000 ||
        (target === 'en' ? original : translation).length > 4000;
      if (view.favorite.disabled) view.status.textContent = '内容较长，无法加入收藏本。';
    }
  });
})();
