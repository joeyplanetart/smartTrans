const { test, expect } = require('bun:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { Todos, nextOccurrence } = require('../electron/todos.cjs');
const { createBackup, validateBackup } = require('../electron/backup.cjs');

test('quick todo persists, can be edited and removed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-todos-'));
  try {
    const todos = new Todos(dir);
    const item = todos.save({ title: '  买咖啡  ' });
    expect(new Todos(dir).list()[0].title).toBe('买咖啡');
    todos.save({ id: item.id, title: '买咖啡', priority: 'high', progress: 50 });
    expect(todos.list()[0].progress).toBe(50);
    todos.remove(item.id);
    expect(todos.list()).toHaveLength(0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reminders fire once and completing a repeating todo creates one next occurrence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-todos-'));
  try {
    const todos = new Todos(dir);
    const dueAt = new Date(Date.now() + 86400000).toISOString();
    const item = todos.save({ title: '复盘', dueAt, reminderAt: new Date(Date.now() - 1000).toISOString(), repeat: 'daily' });
    expect(todos.dueReminders()).toHaveLength(1);
    expect(todos.dueReminders()).toHaveLength(0);
    todos.complete(item.id);
    expect(todos.list()).toHaveLength(2);
    todos.complete(item.id, false);
    todos.complete(item.id);
    expect(todos.list()).toHaveLength(2);
    expect(new Date(todos.list().find(value => value.id !== item.id).dueAt).getTime()).toBeGreaterThan(new Date(dueAt).getTime());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('monthly repetition clamps to the last day and backup preserves todos', () => {
  const item = { title: '月末', detail: '', priority: 'normal', progress: 0, repeat: 'monthly', dueAt: '2026-01-31T12:00:00.000Z', reminderAt: null };
  expect(nextOccurrence(item, new Date('2026-02-01T00:00:00.000Z')).dueAt).toBe('2026-02-28T12:00:00.000Z');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-todos-'));
  try {
    const todo = new Todos(dir).save({ title: '备份任务' });
    const data = { document: '', learning: null, preferences: { provider: null, layout: null, speechRate: null, mode: null, jiraUrl: '' } };
    expect(createBackup(data, [], null, [todo]).todos[0].title).toBe('备份任务');
    expect(validateBackup({ ...createBackup(data, []), todos: null }).todos).toBeNull();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('clicking a todo card toggles completion without hijacking edit or delete', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-todos-view-'));
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8'),
    { url: 'https://smarttrans.local', runScripts: 'outside-only' });
  try {
    const store = new Todos(dir), item = store.save({ title: '点击完成' });
    const win = dom.window, doc = win.document;
    win.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    win.HTMLDialogElement.prototype.close = function() { this.open = false; };
    win.smartTrans = {
      listTodos: async () => ({ ok: true, items: store.list() }),
      completeTodo: async (id, complete) => ({ ok: true, items: store.complete(id, complete) }),
      saveTodo: async value => ({ ok: true, item: store.save(value) }),
      removeTodo: async id => { store.remove(id); return { ok: true }; },
      onTodoSelection: () => {}, onDesktopAction: () => {},
    };
    win.eval(fs.readFileSync(path.join(__dirname, '../src/todos-view.js'), 'utf8'));
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    doc.getElementById('todosButton').click(); await tick();
    doc.querySelector('.todo-card strong').click(); await tick();
    expect(store.list()[0].completedAt).not.toBeNull();
    doc.querySelector('.todo-actions button').click(); await tick();
    expect(doc.getElementById('todoEditDialog').open).toBe(true);
    expect(store.list()[0].completedAt).not.toBeNull();
    doc.getElementById('todoEditDialog').close();
    const card = doc.querySelector('.todo-card');
    card.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick();
    expect(store.list().find(value => value.id === item.id).completedAt).toBeNull();
  } finally { dom.window.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('desktop todo viewer shows open items and completes them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-desktop-todos-'));
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/todo-window.html'), 'utf8'),
    { url: 'https://smarttrans.local', runScripts: 'outside-only' });
  try {
    const store = new Todos(dir), item = store.save({ title: '桌面任务' });
    let changed;
    dom.window.desktopTodos = {
      list: async () => ({ ok: true, items: store.list(), pinned: true }),
      complete: async id => { store.complete(id); return { ok: true }; },
      setPinned: async value => value,
      openMain: async () => true,
      onChanged: callback => { changed = callback; },
    };
    dom.window.eval(fs.readFileSync(path.join(__dirname, '../src/todo-window.js'), 'utf8'));
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    await tick();
    expect(dom.window.document.querySelector('.item').textContent).toContain('桌面任务');
    dom.window.document.querySelector('.item').click(); await tick();
    expect(store.list().find(value => value.id === item.id).completedAt).not.toBeNull();
    expect(dom.window.document.querySelector('.item')).toBeNull();
    store.save({ title: '新任务' }); changed(); await tick();
    expect(dom.window.document.querySelector('.item').textContent).toContain('新任务');
  } finally { dom.window.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
