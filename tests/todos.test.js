const { test, expect } = require('bun:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
