const { test, expect } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { sanitizeNoteHtml } = require('../src/markdown-renderer.js');

test('note editor opens old text, saves simple formatting and ignores pasted HTML', async () => {
  const root = path.join(__dirname, '../src');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'note.html'), 'utf8'), {
    url: 'https://smarttrans.local/note.html', runScripts: 'outside-only',
  });
  const win = dom.window;
  const purify = createDOMPurify(win);
  const saved = [], commands = [];
  win.MarkdownView = { sanitizeNoteHtml: html => sanitizeNoteHtml(html, purify) };
  win.stickyNote = {
    read: async () => ({ id: 'one', text: '旧便签\n第二行', html: null, color: 'yellow', pinned: false }),
    clipboardImage: async () => ({ ok: true, dataUrl: null }),
    saveContent: content => { saved.push(content); return { ok: true }; },
    update: async () => ({}), create: async () => ({}), remove: async () => true,
  };
  win.document.execCommand = (...args) => { commands.push(args); return true; };
  win.eval(fs.readFileSync(path.join(root, 'note.js'), 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const editor = win.document.getElementById('text');
  expect(editor.textContent).toBe('旧便签\n第二行');
  editor.innerHTML = '<h2>计划</h2><ul><li><strong>完成</strong></li></ul><img src=x onerror=alert(1)>';
  editor.dispatchEvent(new win.Event('input'));
  await new Promise(resolve => setTimeout(resolve, 400));
  expect(saved.at(-1).html).toContain('<h2>计划</h2>');
  expect(saved.at(-1).html).toContain('<ul><li><strong>完成</strong></li></ul>');
  expect(saved.at(-1).html).not.toContain('<img');
  win.document.getElementById('bullets').click();
  expect(commands.some(([name]) => name === 'insertUnorderedList')).toBe(true);
  win.document.getElementById('underline').click();
  win.document.getElementById('strike').click();
  expect(commands.some(([name]) => name === 'underline')).toBe(true);
  expect(commands.some(([name]) => name === 'strikeThrough')).toBe(true);
  dom.window.close();
});

test('task list button and checkbox keep completion state in saved HTML', async () => {
  const root = path.join(__dirname, '../src');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'note.html'), 'utf8'), {
    url: 'https://smarttrans.local/note.html', runScripts: 'outside-only',
  });
  const win = dom.window;
  const purify = createDOMPurify(win);
  const saved = [];
  win.MarkdownView = { sanitizeNoteHtml: html => sanitizeNoteHtml(html, purify) };
  win.stickyNote = {
    read: async () => ({ id: 'one', text: '', html: null, color: 'yellow', pinned: false }),
    clipboardImage: async () => ({ ok: true, dataUrl: null }),
    saveContent: content => { saved.push(content); return { ok: true }; },
    update: async () => ({}), create: async () => ({}), remove: async () => true,
  };
  win.document.execCommand = () => true;
  win.eval(fs.readFileSync(path.join(root, 'note.js'), 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const editor = win.document.getElementById('text');
  editor.innerHTML = '<ul><li>交付报告</li></ul>';
  const item = editor.querySelector('li');
  const selection = win.getSelection();
  const range = win.document.createRange();
  range.setStart(item.firstChild, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  win.document.getElementById('tasks').click();
  expect(editor.querySelector('ul').getAttribute('data-task-list')).toBe('1');
  expect(saved.at(-1).html).toContain('data-done="0"');
  item.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, clientX: -10 }));
  expect(item.getAttribute('data-done')).toBe('1');
  expect(saved.at(-1).html).toContain('data-done="1"');
  editor.textContent = '新任务';
  range.setStart(editor.firstChild, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  win.document.execCommand = command => {
    if (command === 'insertUnorderedList') editor.innerHTML = '<ul><li>新任务</li></ul>';
    return true;
  };
  win.document.getElementById('tasks').click();
  expect(editor.querySelector('ul').getAttribute('data-task-list')).toBe('1');
  dom.window.close();
});

test('pasting a screenshot inserts and saves a local image', async () => {
  const root = path.join(__dirname, '../src');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'note.html'), 'utf8'), {
    url: 'https://smarttrans.local/note.html', runScripts: 'outside-only',
  });
  const win = dom.window;
  const purify = createDOMPurify(win);
  const saved = [];
  const dataUrl = 'data:image/png;base64,aGVsbG8=';
  win.MarkdownView = { sanitizeNoteHtml: html => sanitizeNoteHtml(html, purify) };
  win.stickyNote = {
    read: async () => ({ id: 'one', text: '', html: null, color: 'yellow', pinned: false }),
    clipboardImage: async () => ({ ok: true, dataUrl }),
    saveContent: content => { saved.push(content); return { ok: true }; },
    update: async () => ({}), create: async () => ({}), remove: async () => true,
  };
  win.document.execCommand = () => true;
  win.eval(fs.readFileSync(path.join(root, 'note.js'), 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const editor = win.document.getElementById('text');
  const paste = new win.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '' } });
  editor.dispatchEvent(paste);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(editor.querySelector('img')?.getAttribute('src')).toBe(dataUrl);
  expect(saved.at(-1).html).toContain(dataUrl);
  const image = editor.querySelector('img');
  image.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  expect(image.classList.contains('is-selected')).toBe(true);
  expect(win.getSelection().getRangeAt(0).intersectsNode(image)).toBe(true);
  editor.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  expect(editor.querySelector('img')).toBeNull();
  expect(saved.at(-1).html).not.toContain(dataUrl);
  dom.window.close();
});
