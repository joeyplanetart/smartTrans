const editor = document.getElementById('text');
const color = document.getElementById('color');
const pin = document.getElementById('pin');
const status = document.getElementById('status');
const sanitize = html => window.MarkdownView.sanitizeNoteHtml(html);
let savedText = '';
let savedHtml = '';
let saveTimer;
let selectedImage = null;
const MAX_NOTE_HTML = 15_000_000;

function showPin(value) {
  pin.setAttribute('aria-pressed', String(value));
  pin.title = value ? '取消置顶' : '钉在桌面';
}
function message(value) { status.textContent = value; }
function plainText() { return editor.innerText ?? editor.textContent ?? ''; }
function selectionElement() {
  const anchor = window.getSelection()?.anchorNode;
  return anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
}
function clearSelectedImage() {
  selectedImage?.classList.remove('is-selected');
  selectedImage = null;
}
function selectImage(image) {
  clearSelectedImage();
  selectedImage = image;
  image.classList.add('is-selected');
  editor.focus();
  const range = document.createRange();
  range.selectNode(image);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
function saveContent() {
  clearTimeout(saveTimer);
  const text = plainText();
  if (text.length > 50000) { message('便签最多 50,000 字符。'); return false; }
  const html = sanitize(editor.innerHTML);
  if (html.length > MAX_NOTE_HTML) { message('单张便签内容超过 15 MB。'); return false; }
  if (text === savedText && html === savedHtml) return true;
  try {
    const result = window.stickyNote.saveContent({ text, html });
    if (!result.ok) throw new Error(result.error);
    savedText = text;
    savedHtml = html;
    message('已保存');
    return true;
  } catch (error) { message(error.message); return false; }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  message('正在保存…');
  saveTimer = setTimeout(saveContent, 350);
}
function insertImage(dataUrl, range) {
  if (editor.innerHTML.length + dataUrl.length + 100 > MAX_NOTE_HTML) {
    message('单张便签内容超过 15 MB，请先删除部分图片。');
    return;
  }
  const image = document.createElement('img');
  image.src = dataUrl;
  image.alt = '粘贴的截图';
  const target = range && editor.contains(range.commonAncestorContainer) ? range : document.createRange();
  if (target !== range) { target.selectNodeContents(editor); target.collapse(false); }
  target.deleteContents();
  target.insertNode(image);
  target.setStartAfter(image);
  target.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(target);
  if (!saveContent()) editor.innerHTML = savedHtml;
}

window.stickyNote.read().then(note => {
  if (!note) throw new Error('便签已不存在。');
  if (note.html) editor.innerHTML = sanitize(note.html);
  else editor.textContent = note.text;
  savedText = note.text;
  savedHtml = sanitize(editor.innerHTML);
  color.value = note.color;
  document.body.dataset.color = note.color;
  showPin(note.pinned);
}).catch(error => message(error.message));

document.execCommand('styleWithCSS', false, 'false');
editor.addEventListener('input', () => {
  if (selectedImage && !editor.contains(selectedImage)) selectedImage = null;
  editor.querySelector('img') ? scheduleSave() : saveContent();
});
editor.addEventListener('blur', saveContent);
editor.addEventListener('mousedown', event => {
  if (event.target.tagName === 'IMG') {
    event.preventDefault();
    selectImage(event.target);
    return;
  }
  clearSelectedImage();
  const item = event.target.closest?.('li');
  if (!item || item.parentElement?.getAttribute('data-task-list') !== '1') return;
  const left = item.getBoundingClientRect().left;
  if (event.clientX < left - 26 || event.clientX > left + 4) return;
  event.preventDefault();
  item.setAttribute('data-done', item.getAttribute('data-done') === '1' ? '0' : '1');
  saveContent();
});
editor.addEventListener('keydown', event => {
  if (!selectedImage || !editor.contains(selectedImage)) return;
  if (event.key !== 'Backspace' && event.key !== 'Delete') {
    clearSelectedImage();
    return;
  }
  event.preventDefault();
  const image = selectedImage;
  const range = document.createRange();
  range.setStartBefore(image);
  range.collapse(true);
  image.remove();
  selectedImage = null;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  saveContent();
});
window.addEventListener('beforeunload', saveContent);
editor.addEventListener('paste', async event => {
  event.preventDefault();
  if (!saveContent()) return;
  const pastedText = event.clipboardData?.getData('text/plain') || '';
  const selection = window.getSelection();
  const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  try {
    const image = await window.stickyNote.clipboardImage();
    if (!image.ok) { message(image.error); return; }
    if (image.dataUrl) { insertImage(image.dataUrl, range); return; }
  } catch (error) { message(error.message); return; }
  if (pastedText) {
    document.execCommand('insertText', false, pastedText);
    saveContent();
  }
});

for (const button of document.querySelectorAll('.formatbar button')) {
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => {
    const selectedElement = selectionElement();
    editor.focus();
    if (button.id === 'heading') {
      const heading = selectedElement?.closest?.('h2');
      document.execCommand('formatBlock', false, heading && editor.contains(heading) ? 'p' : 'h2');
    } else if (button.id === 'tasks') {
      let list = selectedElement?.closest?.('ul');
      if (!list || !editor.contains(list)) {
        const existingLists = new Set(editor.querySelectorAll('ul'));
        document.execCommand('insertUnorderedList', false);
        list = selectionElement()?.closest?.('ul');
        if (!list || !editor.contains(list))
          list = [...editor.querySelectorAll('ul')].find(candidate => !existingLists.has(candidate));
      }
      if (list && editor.contains(list)) {
        const enabled = list.getAttribute('data-task-list') === '1';
        if (enabled) list.removeAttribute('data-task-list');
        else list.setAttribute('data-task-list', '1');
        for (const item of list.children) {
          if (item.tagName !== 'LI') continue;
          if (enabled) item.removeAttribute('data-done');
          else item.setAttribute('data-done', '0');
        }
      }
    } else {
      const command = { bold: 'bold', underline: 'underline', strike: 'strikeThrough',
        bullets: 'insertUnorderedList', numbers: 'insertOrderedList' }[button.id];
      document.execCommand(command, false);
    }
    saveContent();
  });
}

color.addEventListener('change', async () => {
  try { await window.stickyNote.update({ color: color.value }); document.body.dataset.color = color.value; }
  catch (error) { message(error.message); }
});
pin.addEventListener('click', async () => {
  try { const note = await window.stickyNote.update({ pinned: pin.getAttribute('aria-pressed') !== 'true' }); showPin(note.pinned); }
  catch (error) { message(error.message); }
});
document.getElementById('newNote').addEventListener('click', async () => {
  saveContent();
  try { await window.stickyNote.create(); } catch (error) { message(error.message); }
});
document.getElementById('delete').addEventListener('click', async () => {
  if (!confirm('删除这张便签？此操作无法撤销。')) return;
  try { await window.stickyNote.remove(); } catch (error) { message(error.message); }
});
