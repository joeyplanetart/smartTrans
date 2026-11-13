const { test, expect } = require('bun:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Notes, COLORS, offsetNoteBounds } = require('../electron/notes.cjs');
const { createBackup, validateBackup } = require('../electron/backup.cjs');

test('desktop notes persist edits and survive disabling the optional feature', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-notes-'));
  try {
    const notes = new Notes(directory);
    expect(notes.data.enabled).toBe(false);
    notes.setEnabled(true);
    const item = notes.create();
    notes.update(item.id, { text: '明天跟进\nJira', color: 'blue', pinned: true,
      bounds: { x: 40, y: 50, width: 340, height: 280 } });
    notes.setEnabled(false);
    const restored = new Notes(directory);
    expect(restored.data.enabled).toBe(false);
    expect(restored.get(item.id).text).toBe('明天跟进\nJira');
    expect(restored.get(item.id).pinned).toBe(true);
    expect(restored.get(item.id).bounds.width).toBe(340);
    expect(() => restored.update(item.id, { color: 'invalid' })).toThrow();
    expect(restored.get(item.id).color).toBe('blue');
    restored.remove(item.id);
    expect(new Notes(directory).list()).toHaveLength(0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('notes in backup are validated and old backups remain importable', () => {
  const data = { document: '', learning: null, preferences: { provider: null, layout: null,
    speechRate: null, mode: null, jiraUrl: '' } };
  const snapshot = { enabled: true, items: [{ id: 'one', text: 'memo', color: 'yellow', pinned: false, bounds: null }] };
  const backup = createBackup(data, [], snapshot);
  expect(backup.notes.items[0]).toEqual({ ...snapshot.items[0], html: null });
  expect(validateBackup({ ...backup, notes: undefined }).notes).toBeNull();
  expect(() => validateBackup({ ...backup, notes: { ...snapshot, items: [{ ...snapshot.items[0], text: 123 }] } })).toThrow();
});

test('formatted note content survives reload and backup while older text remains valid', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-notes-'));
  try {
    const notes = new Notes(directory);
    const item = notes.create();
    const html = '<h2>计划</h2><ul><li><strong>跟进</strong>客户</li></ul>';
    notes.update(item.id, { text: '计划\n跟进客户', html });
    expect(new Notes(directory).get(item.id).html).toBe(html);
    expect(() => notes.update(item.id, { html: 123 })).toThrow();
    expect(new Notes(directory).get(item.id).html).toBe(html);
    expect(validateBackup(createBackup({ document: '', learning: null, preferences: {
      provider: null, layout: null, speechRate: null, mode: null, jiraUrl: '' } }, [], notes.data)).notes.items[0].html).toBe(html);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('new notes use another color and offset inside the current display', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-notes-'));
  try {
    const notes = new Notes(directory);
    const area = { x: 0, y: 0, width: 1200, height: 800 };
    const first = notes.create();
    expect(COLORS).toContain(first.color);
    const bounds = offsetNoteBounds({ x: 100, y: 100, width: 320, height: 300 }, area);
    expect(bounds).toEqual({ x: 148, y: 148, width: 320, height: 300 });
    const next = notes.create({ bounds, avoidColor: first.color });
    expect(next.color).not.toBe(first.color);
    expect(next.bounds).toEqual(bounds);
    expect(offsetNoteBounds({ x: 880, y: 500, width: 320, height: 300 }, area))
      .toEqual({ x: 832, y: 452, width: 320, height: 300 });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
