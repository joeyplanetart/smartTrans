(() => {
  const $ = id => document.getElementById(id);
  let busy = false;
  function node(tag, className, value) {
    const element = document.createElement(tag);
    element.className = className;
    if (value != null) element.textContent = value;
    return element;
  }
  async function refresh() {
    const result = await window.desktopTodos.list();
    if (!result.ok) throw new Error(result.error);
    const items = result.items.filter(item => !item.completedAt);
    $('count').textContent = `${items.length} 条待办`;
    $('pin').setAttribute('aria-pressed', String(result.pinned));
    const list = $('list'); list.replaceChildren();
    if (!items.length) { list.append(node('p', 'empty', '暂无待办，打开待办本新增。')); return; }
    for (const item of items) {
      const button = node('button', 'item'); button.type = 'button';
      button.setAttribute('aria-label', `完成待办：${item.title}`);
      const check = node('span', 'check'); check.setAttribute('aria-hidden', 'true');
      const body = node('span', 'body'); body.append(node('strong', '', item.title));
      if (item.detail) body.append(node('span', 'detail', item.detail));
      const meta = [item.dueAt && `截止 ${new Date(item.dueAt).toLocaleString('zh-CN')}`,
        item.reminderAt && `提醒 ${new Date(item.reminderAt).toLocaleString('zh-CN')}`,
        item.priority === 'high' && '高优先级', item.progress > 0 && `进度 ${item.progress}%`].filter(Boolean);
      if (meta.length) body.append(node('small', '', meta.join(' · ')));
      button.append(check, body);
      button.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        try {
          const result = await window.desktopTodos.complete(item.id);
          if (!result.ok) throw new Error(result.error);
          $('status').textContent = ''; await refresh();
        } catch (error) { $('status').textContent = error.message; }
        finally { busy = false; }
      });
      list.append(button);
    }
  }
  $('pin').addEventListener('click', async () => {
    try { const pinned = await window.desktopTodos.setPinned($('pin').getAttribute('aria-pressed') !== 'true'); $('pin').setAttribute('aria-pressed', String(pinned)); }
    catch (error) { $('status').textContent = error.message; }
  });
  $('openMain').addEventListener('click', () => window.desktopTodos.openMain().catch(error => { $('status').textContent = error.message; }));
  window.desktopTodos.onChanged(() => refresh().catch(error => { $('status').textContent = error.message; }));
  refresh().catch(error => { $('status').textContent = error.message; });
})();
