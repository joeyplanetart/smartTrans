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
  function tomorrow() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setSeconds(0, 0);
    return localInput(date);
  }
  function updateTimeDisplays() {
    for (const [inputId, displayId] of [['todoDue', 'todoDueDisplay'], ['todoReminder', 'todoReminderDisplay']]) {
      const value = $(inputId).value;
      if (!value) { $(displayId).textContent = ''; continue; }
      const date = new Date(value);
      const year = date.getFullYear() === new Date().getFullYear() ? '' : `${date.getFullYear()}年`;
      $(displayId).textContent = `${year}${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
  }
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
        try { const result = await window.smartTrans.completeTodo(item.id, check.checked); if (!result.ok) throw new Error(result.error); await refresh(); status(''); }
        catch (error) { check.checked = !check.checked; status(error.message); }
      });
      head.append(check, node('strong', '', item.title)); card.append(head);
      if (item.detail) card.append(node('p', 'todo-detail', item.detail));
      const simple = !item.detail && !item.dueAt && !item.reminderAt && item.priority === 'normal' &&
        (item.progress === 0 || (item.completedAt && item.progress === 100)) && item.repeat === 'none';
      if (!simple) {
        const meta = [item.dueAt && `截止 ${new Date(item.dueAt).toLocaleString('zh-CN')}`,
          item.reminderAt && `提醒 ${new Date(item.reminderAt).toLocaleString('zh-CN')}`,
          item.priority === 'high' ? '高优先级' : item.priority === 'low' ? '低优先级' : null,
          item.progress > 0 && `进度 ${item.progress}%`, { daily: '每天重复', weekly: '每周重复', monthly: '每月重复' }[item.repeat]].filter(Boolean);
        if (meta.length) card.append(node('p', 'todo-meta', meta.join(' · ')));
      }
      const actions = node('div', 'todo-actions');
      actions.append(button('编辑', () => showEditor(item)), button('删除', async () => {
        if (!confirm(`删除待办「${item.title}」？`)) return;
        try { const result = await window.smartTrans.removeTodo(item.id); if (!result.ok) throw new Error(result.error); await refresh(); status(''); }
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
    $('todoDue').value = item.id ? localInput(item.dueAt) : tomorrow();
    $('todoReminder').value = localInput(item.reminderAt);
    updateTimeDisplays();
    $('todoPriority').value = item.priority || 'normal';
    $('todoProgress').value = String(Math.round((item.progress || 0) / 25) * 25);
    $('todoRepeat').value = item.repeat || 'none';
    $('todoEditStatus').textContent = '';
    if (!editor.open) editor.showModal(); $('todoTitle').focus();
  }
  async function fromText(text) {
    const value = text.trim();
    if (!value) return;
    const title = value.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 300) || value.slice(0, 300);
    const result = await window.smartTrans.saveTodo({ title, detail: value.slice(0, 10000) });
    if (!result.ok) throw new Error(result.error);
    await refresh(); status('');
  }
  $('todosButton').addEventListener('click', () => openLibrary().catch(error => status(error.message)));
  $('todosClose').addEventListener('click', () => library.close());
  $('todoEditClose').addEventListener('click', () => editor.close());
  $('todoDetailedNew').addEventListener('click', () => showEditor());
  for (const input of [$('todoDue'), $('todoReminder')]) {
    input.addEventListener('click', () => {
      try { input.showPicker(); } catch { /* Native picker availability varies by platform. */ }
    });
    input.addEventListener('input', updateTimeDisplays);
    input.addEventListener('change', updateTimeDisplays);
  }
  $('todoQuickForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const result = await window.smartTrans.saveTodo({ title: $('todoQuickTitle').value });
      if (!result.ok) throw new Error(result.error);
      $('todoQuickTitle').value = ''; await refresh(); status(''); $('todoQuickTitle').focus();
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
      editor.close(); await refresh(); status('');
    } catch (error) { $('todoEditStatus').textContent = error.message; }
  });
  window.smartTrans.onTodoSelection(({ text }) => { openLibrary().then(() => fromText(text)).catch(error => status(error.message)); });
  window.smartTrans.onDesktopAction(action => { if (action?.type === 'todo') openLibrary().catch(error => status(error.message)); });
})();
