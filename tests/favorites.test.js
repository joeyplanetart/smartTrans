const { test, expect } = require('bun:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { Favorites } = require('../electron/favorites.cjs');

function temporary(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-favorites-test-'));
  return Promise.resolve().then(() => run(new Favorites(directory))).finally(() => fs.rmSync(directory, { recursive: true, force: true }));
}
test('favorites persist, normalize duplicate English and preserve existing annotations', () => temporary(store => {
  const first = store.save({ english: 'Follow  up', chinese: '跟进', note: '工作中使用', source: 'Jira' }).item;
  const duplicate = store.save({ english: 'ＦＯＬＬＯＷ up', chinese: '不应覆盖' });
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.item.id).toBe(first.id);
  expect(new Favorites(path.dirname(store.file)).list()[0].note).toBe('工作中使用');
  const updated = store.save({ ...first, chinese: '跟进此事' }).item;
  expect(updated.createdAt).toBe(first.createdAt);
  expect(updated.chinese).toBe('跟进此事');
  const second = store.save({ english: 'stand up' }).item;
  expect(store.save({ ...second, english: 'follow up' }).duplicate).toBe(true);
  expect(store.list()).toHaveLength(2);
  expect(store.remove(first.id).note).toBe('工作中使用');
  expect(store.list()).toHaveLength(1);
  expect(() => store.save({ ...first, note: 'stale edit' })).toThrow();
}));
test('invalid input and a damaged favorites file never erase saved data', () => temporary(store => {
  expect(() => store.save({ english: '' })).toThrow();
  expect(() => store.save({ english: 'a'.repeat(2001) })).toThrow();
  store.save({ english: 'hello' });
  fs.writeFileSync(store.file, '{broken');
  expect(() => store.list()).toThrow('未覆盖已有数据');
  expect(() => store.save({ english: 'world' })).toThrow();
  expect(fs.readFileSync(store.file, 'utf8')).toBe('{broken');
}));

test('favorites view saves paired translations, searches safely, detects duplicates and undoes removal', () => temporary(async store => {
  const root = path.join(__dirname, '../src');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://smarttrans.local', runScripts: 'outside-only' });
  const win = dom.window, doc = win.document;
  let selected, expanded = false;
  const spoken = [];
  win.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  win.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new win.Event('close')); };
  win.MiniView = { expand: async () => { expanded = true; return true; } };
  win.smartTrans = {
    listFavorites: async () => ({ ok: true, items: store.list() }),
    saveFavorite: async value => ({ ok: true, ...store.save(value) }),
    removeFavorite: async id => ({ ok: true, item: store.remove(id) }),
    onFavoriteSelection: handler => { selected = handler; },
    speak: async value => { spoken.push(value); return { ok: true }; }, stopSpeech: async () => {},
  };
  win.eval(fs.readFileSync(path.join(root, 'favorites-view.js'), 'utf8'));
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const submit = async () => { doc.getElementById('favoriteForm').dispatchEvent(new win.Event('submit', { cancelable: true })); await tick(); };
  win.FavoritesView.addPair('跟进', 'follow up', '文本翻译', 'en');
  expect(doc.getElementById('favoriteEnglish').value).toBe('follow up');
  expect(doc.getElementById('favoriteChinese').value).toBe('跟进');
  doc.getElementById('favoriteNote').value = '<img src=x onerror=alert(1)>';
  await submit();
  doc.getElementById('favoritesButton').click(); await tick();
  expect(expanded).toBe(true);
  expect(doc.querySelectorAll('.favorite-card')).toHaveLength(1);
  expect(doc.querySelector('.favorite-card img')).toBeNull();
  doc.querySelector('.favorite-card-actions button').click(); await tick();
  expect(spoken[0].text).toBe('follow up');
  const search = doc.getElementById('favoritesSearch');
  search.value = 'missing'; search.dispatchEvent(new win.Event('input'));
  expect(doc.querySelectorAll('.favorite-card')).toHaveLength(0);
  search.value = '跟进'; search.dispatchEvent(new win.Event('input'));
  expect(doc.querySelectorAll('.favorite-card')).toHaveLength(1);
  selected({ text: 'FOLLOW UP' }); await submit();
  expect(doc.getElementById('favoriteEditStatus').textContent).toContain('已经收藏');
  expect(store.list()[0].note).toContain('<img');
  doc.getElementById('favoriteEditExisting').click();
  doc.getElementById('favoriteNote').value = '常用表达'; await submit();
  expect(store.list()[0].note).toBe('常用表达');
  doc.querySelectorAll('.favorite-card-actions button')[2].click(); await tick();
  expect(store.list()).toHaveLength(0);
  doc.getElementById('favoritesUndo').click(); await tick();
  expect(store.list()[0].english).toBe('follow up');
  expect(store.list()[0].note).toBe('常用表达');
  doc.getElementById('favoritesDialog').close();
  selected({ text: '容易忘记' });
  expect(doc.getElementById('favoriteEnglish').value).toBe('');
  expect(doc.getElementById('favoriteChinese').value).toBe('容易忘记');
  dom.window.close();
}));
