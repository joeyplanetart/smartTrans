(() => {
  const $ = id => document.getElementById(id);
  const library = $('todosDialog'), editor = $('todoEditDialog');
  let items = [], editingId = null;
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = value;
    return element;
  };
  function status(value) { $('todosStatus').textContent = value; }
  function localInput(value) {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function iso(value) { return value ? new Date(value).toISOString() : null; }
  function button(label, action) {
    const element = node('button', 'secondary-button', label);
    element.type = 'button'; element.addEventListener('click', action); return element;
  }
  async function refresh() {
    const result = await window.smartTrans.listTodos();
    if (!result.ok) throw new Error(result.error);
    items = result.items; render();
  }
  function render() {
    const open = items.filter(item => !item.completedAt);
    $('todosCount').textContent = `${open.length} 条待办 · ${items.length - open.length} 条完成`;
    const list = $('todosList'); list.replaceChildren();
    if (!items.length) { list.append(node('p', 'favorites-empty', '还没有待办。输入标题后按回车即可新增。')); return; }
    for (const item of items) {
      const card = node('article', 'todo-card' + (item.completedAt ? ' completed' : ''));
      const head = node('div', 'todo-card-head');
      const check = node('input'); check.type = 'checkbox'; check.checked = Boolean(item.completedAt);
      check.setAttribute('aria-label', item.completedAt ? '恢复待办' : '完成待办');
      check.addEventListener('change', async () => {
        try { const result = await window.smartTrans.completeTodo(item.id, check.checked); if (!result.ok) throw new Error(result.error); await refresh(); status(check.checked ? '已完成待办。' : '已恢复待办。'); }
        catch (error) { check.checked = !check.checked; status(error.message); }
      });
      head.append(check, node('strong', '', item.title)); card.append(head);
      if (item.detail) card.append(node('p', 'todo-detail', item.detail));
      const meta = [item.dueAt && `截止 ${new Date(item.dueAt).toLocaleString('zh-CN')}`,
        item.reminderAt && `提醒 ${new Date(item.reminderAt).toLocaleString('zh-CN')}`,
        item.priority === 'high' ? '高优先级' : item.priority === 'low' ? '低优先级' : null,
        `进度 ${item.progress}%`, { daily: '每天重复', weekly: '每周重复', monthly: '每月重复' }[item.repeat]].filter(Boolean);
      card.append(node('p', 'todo-meta', meta.join(' · ')));
      const actions = node('div', 'todo-actions');
      actions.append(button('编辑', () => showEditor(item)), button('删除', async () => {
        if (!confirm(`删除待办「${item.title}」？`)) return;
        try { const result = await window.smartTrans.removeTodo(item.id); if (!result.ok) throw new Error(result.error); await refresh(); status('已删除。'); }
        catch (error) { status(error.message); }
      }));
      card.append(actions); list.append(card);
    }
  }
  async function openLibrary() {
    if (document.querySelector('dialog[open]') && !library.open) return;
    if (window.MiniView && !await window.MiniView.expand()) return;
    if (!library.open) library.showModal();
    await refresh(); $('todoQuickTitle').focus();
  }
  function showEditor(item = {}) {
    editingId = item.id || null;
    $('todoEditTitle').textContent = editingId ? '编辑待办' : '详细待办';
    $('todoTitle').value = item.title || ''; $('todoDetail').value = item.detail || '';
    $('todoDue').value = localInput(item.dueAt); $('todoReminder').value = localInput(item.reminderAt);
    $('todoPriority').value = item.priority || 'normal'; $('todoProgress').value = item.progress || 0;
    $('todoProgressValue').textContent = $('todoProgress').value + '%'; $('todoRepeat').value = item.repeat || 'none';
    $('todoEditStatus').textContent = '';
    if (!editor.open) editor.showModal(); $('todoTitle').focus();
  }
  async function fromText(text) {
    const value = text.trim();
    if (!value) { status('剪贴板没有文字内容。'); return; }
    const title = value.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 300) || value.slice(0, 300);
    const result = await window.smartTrans.saveTodo({ title, detail: value.slice(0, 10000) });
    if (!result.ok) throw new Error(result.error);
    await refresh(); status('已从内容新增待办。');
  }
  $('todosButton').addEventListener('click', () => openLibrary().catch(error => status(error.message)));
  $('todosClose').addEventListener('click', () => library.close());
  $('todoEditClose').addEventListener('click', () => editor.close());
  $('todoDetailedNew').addEventListener('click', () => showEditor());
  $('todoFromClipboard').addEventListener('click', async () => {
    try { await fromText(await window.smartTrans.readTodoClipboard()); }
    catch (error) { status(error.message); }
  });
  $('todoProgress').addEventListener('input', () => { $('todoProgressValue').textContent = $('todoProgress').value + '%'; });
  $('todoQuickForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const result = await window.smartTrans.saveTodo({ title: $('todoQuickTitle').value });
      if (!result.ok) throw new Error(result.error);
      $('todoQuickTitle').value = ''; await refresh(); status('已新增待办。'); $('todoQuickTitle').focus();
    } catch (error) { status(error.message); }
  });
  $('todoEditForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const result = await window.smartTrans.saveTodo({ ...(editingId ? { id: editingId } : {}),
        title: $('todoTitle').value, detail: $('todoDetail').value, dueAt: iso($('todoDue').value),
        reminderAt: iso($('todoReminder').value), priority: $('todoPriority').value,
        progress: Number($('todoProgress').value), repeat: $('todoRepeat').value });
      if (!result.ok) throw new Error(result.error);
      editor.close(); await refresh(); status('已保存待办。');
    } catch (error) { $('todoEditStatus').textContent = error.message; }
  });
  window.smartTrans.onTodoSelection(({ text }) => { openLibrary().then(() => fromText(text)).catch(error => status(error.message)); });
  window.smartTrans.onDesktopAction(action => { if (action?.type === 'todo') openLibrary().catch(error => status(error.message)); });
})();
