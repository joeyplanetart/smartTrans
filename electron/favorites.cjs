const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function text(value, name, limit) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > limit) throw new Error(name + '过长或格式不正确。');
  return value.trim();
}
function fields(value) {
  const english = text(value?.english, '英文内容', 2000);
  if (!/[a-z]/i.test(english)) throw new Error('请填写英文单词或短句。');
  return { english, chinese: text(value.chinese, '中文释义', 4000), note: text(value.note, '备注', 2000), source: text(value.source, '来源', 300) };
}
const key = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
class Favorites {
  constructor(directory) { this.file = path.join(directory, 'favorites.json'); }
  read() {
    if (!fs.existsSync(this.file)) return [];
    try {
      if (fs.statSync(this.file).size > 50000000) throw new Error();
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.items) || data.items.length > 5000) throw new Error();
      const ids = new Set();
      return data.items.map(item => {
        if (typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) ||
            !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error();
        ids.add(item.id);
        return { ...fields(item), id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt };
      });
    } catch { throw new Error('收藏文件无法读取，请保留 favorites.json 并检查文件；未覆盖已有数据。'); }
  }
  write(items) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const serialized = JSON.stringify({ version: 1, items }, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > 50000000) throw new Error('收藏文件已达到容量限制，请整理后重试。');
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, serialized, { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  list() { return this.read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  save(payload) {
    const value = fields(payload), items = this.read();
    if (payload.id != null && (typeof payload.id !== 'string' || !items.some(item => item.id === payload.id))) throw new Error('该收藏已不存在，请刷新后重试。');
    const duplicate = items.find(item => item.id !== payload.id && key(item.english) === key(value.english));
    if (duplicate) return { duplicate: true, item: duplicate };
    const now = new Date().toISOString();
    let item;
    if (payload.id) {
      const index = items.findIndex(item => item.id === payload.id);
      item = { ...items[index], ...value, updatedAt: now };
      items[index] = item;
    } else {
      if (items.length >= 5000) throw new Error('收藏已达到 5000 条，请整理后再添加。');
      item = { ...value, id: randomUUID(), createdAt: now, updatedAt: now };
      items.push(item);
    }
    this.write(items);
    return { duplicate: false, item };
  }
  remove(id) {
    if (typeof id !== 'string') throw new Error('无效的收藏。');
    const items = this.read(), item = items.find(value => value.id === id);
    if (!item) throw new Error('该收藏已不存在，请刷新后重试。');
    this.write(items.filter(value => value.id !== id));
    return item;
  }
}
module.exports = { Favorites, fields, key };
