const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const priorities = ['low', 'normal', 'high'];
const repeats = ['none', 'daily', 'weekly', 'monthly'];
function date(value, name) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(name + '格式不正确。');
  return new Date(value).toISOString();
}
function fields(value) {
  const title = typeof value?.title === 'string' ? value.title.trim() : '';
  if (!title || title.length > 300) throw new Error('标题不能为空，且最多 300 字。');
  const detail = typeof value.detail === 'string' ? value.detail.trim() : '';
  if (detail.length > 10000) throw new Error('内容最多 10,000 字。');
  const priority = value.priority || 'normal', repeat = value.repeat || 'none';
  if (!priorities.includes(priority) || !repeats.includes(repeat)) throw new Error('优先级或重复方式不正确。');
  const progress = value.progress == null ? 0 : Number(value.progress);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new Error('进度须为 0 到 100。');
  const dueAt = date(value.dueAt, '截止日期'), reminderAt = date(value.reminderAt, '提醒时间');
  if (repeat !== 'none' && !dueAt) throw new Error('重复待办需要截止日期。');
  return { title, detail, priority, progress, dueAt, reminderAt, repeat };
}
function validateItems(items) {
  if (!Array.isArray(items) || items.length > 10000) throw new Error('待办数据格式不正确。');
  const ids = new Set();
  return items.map(item => {
    if (typeof item?.id !== 'string' || !item.id || ids.has(item.id) ||
        !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt)) ||
        (item.completedAt != null && !Number.isFinite(Date.parse(item.completedAt))) ||
        (item.notifiedAt != null && !Number.isFinite(Date.parse(item.notifiedAt)))) throw new Error('待办数据格式不正确。');
    ids.add(item.id);
    return { ...fields(item), id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt,
      completedAt: item.completedAt || null, notifiedAt: item.notifiedAt || null,
      generatedNextId: typeof item.generatedNextId === 'string' ? item.generatedNextId : null };
  });
}
function nextOccurrence(item, now = new Date()) {
  if (item.repeat === 'none' || !item.dueAt) return null;
  const due = new Date(item.dueAt), reminder = item.reminderAt ? new Date(item.reminderAt) : null;
  const reminderOffset = reminder ? reminder.getTime() - due.getTime() : null;
  const advance = () => {
    if (item.repeat === 'daily') due.setDate(due.getDate() + 1);
    else if (item.repeat === 'weekly') due.setDate(due.getDate() + 7);
    else {
      const day = due.getDate(); due.setDate(1); due.setMonth(due.getMonth() + 1);
      due.setDate(Math.min(day, new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate()));
    }
  };
  do { advance(); } while (due <= now);
  return { title: item.title, detail: item.detail, priority: item.priority, progress: 0,
    dueAt: due.toISOString(), reminderAt: reminderOffset == null ? null : new Date(due.getTime() + reminderOffset).toISOString(), repeat: item.repeat };
}
class Todos {
  constructor(directory) { this.file = path.join(directory, 'todos.json'); }
  read() {
    if (!fs.existsSync(this.file)) return [];
    try {
      if (fs.statSync(this.file).size > 50_000_000) throw new Error();
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1) throw new Error();
      return validateItems(data.items);
    } catch { throw new Error('待办文件无法读取，请保留 todos.json 并检查文件；未覆盖已有数据。'); }
  }
  write(items) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const data = JSON.stringify({ version: 1, items }, null, 2);
    if (Buffer.byteLength(data) > 50_000_000) throw new Error('待办文件已达到容量限制。');
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, data, { mode: 0o600 }); fs.renameSync(temporary, this.file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  list() { return this.read().sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
    (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || b.createdAt.localeCompare(a.createdAt)); }
  replace(items) { this.write(validateItems(items)); }
  save(payload) {
    const value = fields(payload), items = this.read();
    const index = payload.id == null ? -1 : items.findIndex(item => item.id === payload.id);
    if (payload.id != null && index < 0) throw new Error('该待办已不存在。');
    if (index < 0 && items.length >= 10000) throw new Error('待办已达到 10,000 条。');
    const now = new Date().toISOString();
    const item = index < 0 ? { ...value, id: randomUUID(), createdAt: now, updatedAt: now, completedAt: null, notifiedAt: null, generatedNextId: null }
      : { ...items[index], ...value, updatedAt: now,
        notifiedAt: value.reminderAt === items[index].reminderAt ? items[index].notifiedAt : null };
    if (index < 0) items.push(item); else items[index] = item;
    this.write(items); return item;
  }
  complete(id, complete = true) {
    const items = this.read(), index = items.findIndex(item => item.id === id);
    if (index < 0) throw new Error('该待办已不存在。');
    const now = new Date(), item = items[index];
    if (complete && !item.completedAt) {
      item.completedAt = now.toISOString(); item.progress = 100;
      const next = !item.generatedNextId && nextOccurrence(item, now);
      if (next) {
        const id = randomUUID(); item.generatedNextId = id;
        items.push({ ...next, id, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: null, notifiedAt: null, generatedNextId: null });
      }
    } else if (!complete) { item.completedAt = null; item.progress = 0; }
    item.updatedAt = now.toISOString(); this.write(items); return this.list();
  }
  remove(id) {
    const items = this.read(), next = items.filter(item => item.id !== id);
    if (next.length === items.length) throw new Error('该待办已不存在。');
    this.write(next);
  }
  dueReminders(now = new Date()) {
    const items = this.read(), due = items.filter(item => !item.completedAt && !item.notifiedAt && item.reminderAt && new Date(item.reminderAt) <= now);
    if (due.length) { for (const item of due) item.notifiedAt = now.toISOString(); this.write(items); }
    return due;
  }
}
module.exports = { Todos, fields, validateItems, nextOccurrence };
