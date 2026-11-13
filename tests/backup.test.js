const { test, expect } = require('bun:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackup, readBackup, writeBackup, validateBackup } = require('../electron/backup.cjs');
const { Favorites } = require('../electron/favorites.cjs');

const data = () => ({ document: 'Hello 世界', learning: { version: 1, selectedDay: 0, days: { 0: { completed: true } }, mistakes: {}, minutes: 35 },
  preferences: { provider: 'codex', layout: 'stacked', speechRate: '170', mode: 'learning', jiraUrl: 'https://example.atlassian.net/browse/WEB-1' } });
const favorite = () => ({ id: 'favorite-1', english: 'hello', chinese: '你好', note: 'test', source: 'Jira', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });

test('backup round trips document, learning, preferences and favorites', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smarttrans-backup-'));
  try {
    const file = path.join(directory, 'backup.json');
    const backup = createBackup(data(), [favorite()]);
    writeBackup(file, backup);
    const restored = readBackup(file);
    expect(restored.data).toEqual(data());
    expect(restored.favorites).toEqual([favorite()]);
    const library = new Favorites(directory);
    library.replace(restored.favorites);
    expect(library.list()).toEqual([favorite()]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('backup rejects unsupported or damaged content without changing favorites', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smarttrans-backup-'));
  try {
    const library = new Favorites(directory);
    library.replace([favorite()]);
    const backup = createBackup(data(), [favorite()]);
    expect(() => validateBackup({ ...backup, version: 2 })).toThrow();
    expect(() => validateBackup({ ...backup, favorites: [{ ...favorite(), id: '' }] })).toThrow();
    const file = path.join(directory, 'bad.json');
    fs.writeFileSync(file, '{broken');
    expect(() => readBackup(file)).toThrow();
    expect(library.list()).toEqual([favorite()]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('backup strips unexpected fields such as credentials', () => {
  const backup = createBackup({ ...data(), jiraToken: 'secret', preferences: { ...data().preferences, token: 'secret' } }, [favorite()]);
  expect(JSON.stringify(backup)).not.toContain('secret');
});
