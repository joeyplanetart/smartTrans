const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const COLORS = ['yellow', 'pink', 'blue', 'green', 'gray'];
const MAX_NOTE_HTML = 15_000_000;
const MAX_TOTAL_HTML = 80_000_000;

function offsetNoteBounds(bounds, area) {
  const step = 48;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const x = bounds.x + width + step <= area.x + area.width ? bounds.x + step : bounds.x - step;
  const y = bounds.y + height + step <= area.y + area.height ? bounds.y + step : bounds.y - step;
  return { x: Math.max(area.x, Math.min(x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - height)), width, height };
}

function validateNotes(value) {
  if (!value || typeof value.enabled !== 'boolean' || !Array.isArray(value.items) || value.items.length > 100 ||
      new Set(value.items.map(item => item?.id)).size !== value.items.length ||
      value.items.some(item => typeof item.id !== 'string' || !item.id || typeof item.text !== 'string' ||
        item.text.length > 50000 || (item.html != null && (typeof item.html !== 'string' || item.html.length > MAX_NOTE_HTML)) ||
        !COLORS.includes(item.color) || typeof item.pinned !== 'boolean' ||
        (item.bounds !== null && (!item.bounds || !['x', 'y', 'width', 'height'].every(key => Number.isInteger(item.bounds[key])) ||
          item.bounds.width < 240 || item.bounds.height < 180 || item.bounds.width > 3000 || item.bounds.height > 3000))))
    throw new Error('便签数据格式不正确。');
  if (value.items.reduce((total, item) => total + (item.html?.length || 0), 0) > MAX_TOTAL_HTML)
    throw new Error('便签图片总量超过 80 MB。');
  return { enabled: value.enabled, items: value.items.map(item => ({ id: item.id, text: item.text,
    html: item.html ?? null, color: item.color, pinned: item.pinned, bounds: item.bounds ? { ...item.bounds } : null })) };
}

class Notes {
  constructor(directory) {
    this.file = path.join(directory, 'notes.json');
    this.data = this.read();
  }

  read() {
    if (!fs.existsSync(this.file)) return { enabled: false, items: [] };
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return validateNotes(value);
    } catch { throw new Error('便签文件损坏，已保留原文件，未覆盖已有数据。'); }
  }

  write() {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }

  list() { return this.data.items.map(item => ({ ...item })); }
  replace(value) {
    const previous = this.data;
    this.data = validateNotes(value);
    try { this.write(); } catch (error) { this.data = previous; throw error; }
  }
  get(id) { return this.data.items.find(item => item.id === id); }
  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('无效的便签设置。');
    this.data.enabled = enabled;
    this.write();
    return enabled;
  }
  create({ bounds = null, avoidColor = null, pinned = false } = {}) {
    if (this.data.items.length >= 100) throw new Error('最多保存 100 张便签。');
    const palette = COLORS.filter(color => color !== avoidColor);
    const item = { id: randomUUID(), text: '', html: null,
      color: palette[Math.floor(Math.random() * palette.length)], pinned, bounds };
    validateNotes({ enabled: this.data.enabled, items: [item] });
    this.data.items.push(item);
    this.write();
    return { ...item };
  }
  update(id, changes) {
    const item = this.get(id);
    if (!item) throw new Error('便签已不存在。');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('无效的便签修改。');
    const next = { ...item };
    if (Object.hasOwn(changes, 'text')) {
      if (typeof changes.text !== 'string' || changes.text.length > 50000) throw new Error('便签最多 50,000 字符。');
      next.text = changes.text;
    }
    if (Object.hasOwn(changes, 'html')) {
      if (changes.html !== null && (typeof changes.html !== 'string' || changes.html.length > MAX_NOTE_HTML))
        throw new Error('单张便签内容超过 15 MB。');
      next.html = changes.html;
    }
    if (Object.hasOwn(changes, 'color')) {
      if (!COLORS.includes(changes.color)) throw new Error('无效的便签颜色。');
      next.color = changes.color;
    }
    if (Object.hasOwn(changes, 'pinned')) {
      if (typeof changes.pinned !== 'boolean') throw new Error('无效的置顶状态。');
      next.pinned = changes.pinned;
    }
    if (Object.hasOwn(changes, 'bounds')) {
      const b = changes.bounds;
      if (!b || !['x', 'y', 'width', 'height'].every(key => Number.isInteger(b[key])) ||
          b.width < 240 || b.height < 180 || b.width > 3000 || b.height > 3000) throw new Error('无效的窗口尺寸。');
      next.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    validateNotes({ enabled: this.data.enabled, items: this.data.items.map(current => current.id === id ? next : current) });
    Object.assign(item, next);
    this.write();
    return { ...item };
  }
  remove(id) {
    const index = this.data.items.findIndex(item => item.id === id);
    if (index < 0) throw new Error('便签已不存在。');
    this.data.items.splice(index, 1);
    this.write();
  }
}

module.exports = { Notes, COLORS, MAX_NOTE_HTML, validateNotes, offsetNoteBounds };
