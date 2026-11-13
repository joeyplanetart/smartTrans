const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validateItems } = require('./favorites.cjs');
const { validateNotes } = require('./notes.cjs');

const FORMAT = 'smartTrans-backup';
const MAX_BYTES = 100_000_000;
const preferences = {
  provider: ['codex', 'cursor'],
  layout: ['stacked', 'side-by-side'],
  speechRate: ['110', '170', '210'],
  mode: ['text', 'jira', 'learning'],
};

function validateBackup(value) {
  if (!value || value.format !== FORMAT || value.version !== 1 || !Number.isFinite(Date.parse(value.exportedAt)))
    throw new Error('不是受支持的 smartTrans 备份文件。');
  const data = value.data;
  if (!data || typeof data.document !== 'string' || data.document.length > 2_000_000 ||
      (data.learning !== null && typeof data.learning !== 'object') || Array.isArray(data.learning) ||
      !data.preferences || typeof data.preferences !== 'object')
    throw new Error('备份内容不完整或格式不正确。');
  if (data.learning !== null && (data.learning.version !== 1 || !data.learning.days || typeof data.learning.days !== 'object' ||
      !data.learning.mistakes || typeof data.learning.mistakes !== 'object'))
    throw new Error('学习记录格式不正确。');
  for (const [name, allowed] of Object.entries(preferences)) {
    if (data.preferences[name] !== null && !allowed.includes(data.preferences[name]))
      throw new Error('备份中的设置格式不正确。');
  }
  if (typeof data.preferences.jiraUrl !== 'string' || data.preferences.jiraUrl.length > 4000)
    throw new Error('备份中的 Jira 链接格式不正确。');
  const favorites = validateItems(value.favorites);
  const notes = value.notes == null ? null : validateNotes(value.notes);
  const cleaned = { format: FORMAT, version: 1, exportedAt: value.exportedAt,
    data: { document: data.document, learning: data.learning, preferences: {
      provider: data.preferences.provider, layout: data.preferences.layout,
      speechRate: data.preferences.speechRate, mode: data.preferences.mode, jiraUrl: data.preferences.jiraUrl,
    } }, favorites, notes };
  if (Buffer.byteLength(JSON.stringify(cleaned), 'utf8') > MAX_BYTES) throw new Error('备份文件超过 100 MB 限制。');
  return cleaned;
}

function createBackup(data, favorites, notes = null) {
  return validateBackup({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data, favorites, notes });
}

function readBackup(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('备份文件超过 100 MB 限制。');
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('无法读取备份文件，请选择有效的 JSON 备份。'); }
  return validateBackup(parsed);
}

function writeBackup(file, backup) {
  const value = validateBackup(backup);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

module.exports = { createBackup, readBackup, writeBackup, validateBackup };
