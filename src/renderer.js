const $ = (selector) => document.querySelector(selector);
const editor = $("#editor");
const targetButton = $("#targetButton");
const targetMenu = $("#targetMenu");
const targetLabel = $("#targetLabel");
const result = $("#result");
const translationText = $("#translationText");
const errorMessage = $("#errorMessage");
const settingsDialog = $("#settingsDialog");
const providerSelect = $("#provider");
const stored = localStorage.getItem("smart-trans-document");

if (stored !== null) editor.value = stored;
providerSelect.value = localStorage.getItem("smart-trans-provider") === "cursor" ? "cursor" : "codex";

let target = "en";
let targetWasChosen = false;
let activeResult = null;
let requestVersion = 0;
let editingVersion = 0;
let contextSelection = null;

function detectTarget(value) {
  const selected = editor.selectionStart !== editor.selectionEnd
    ? value.slice(editor.selectionStart, editor.selectionEnd) : value;
  if (!selected.trim()) return "en";
  return /[\u3400-\u9fff]/.test(selected) ? "en" : "zh";
}

function setTarget(value, chosen = false) {
  target = value;
  targetWasChosen = chosen;
  targetLabel.textContent = value === "en" ? "英语" : "中文";
  targetMenu.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.target === value));
  });
  targetMenu.classList.add("hidden");
  targetButton.setAttribute("aria-expanded", "false");
}

function updateEditorMeta() {
  $("#characterCount").textContent = editor.value.length.toLocaleString() + " 字符";
  const length = editor.selectionEnd - editor.selectionStart;
  $("#selectionIndicator").textContent = length > 0 ? "已选中 " + length + " 字符" : "翻译全部内容";
  $("#actionHint").textContent = length > 0 ? "只翻译选中的内容" : "选择目标语言，开始翻译";
  if (!targetWasChosen) setTarget(detectTarget(editor.value));
}

function clearResult() {
  activeResult = null;
  result.classList.add("hidden");
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

function snapshotSource(override) {
  const start = override?.start ?? editor.selectionStart;
  const end = override?.end ?? editor.selectionEnd;
  const selected = end > start;
  return {
    text: selected ? editor.value.slice(start, end) : editor.value,
    start: selected ? start : 0,
    end: selected ? end : editor.value.length,
    selected,
    originalDocument: editor.value,
    editingVersion
  };
}

async function translate(override) {
  const snapshot = snapshotSource(override);
  if (!snapshot.text.trim()) {
    showError("请先输入或选中要翻译的内容。");
    editor.focus();
    return;
  }
  if (snapshot.text.length > 20000) {
    showError("单次最多翻译 20,000 个字符。");
    return;
  }
  clearError();
  clearResult();
  const version = ++requestVersion;
  const button = $("#translateButton");
  button.disabled = true;
  button.querySelector("span").textContent = "翻译中…";
  try {
    const translated = await window.smartTrans.translate({
      text: snapshot.text,
      target,
      provider: providerSelect.value
    });
    if (version !== requestVersion || editingVersion !== snapshot.editingVersion) return;
    activeResult = { ...snapshot, translated };
    translationText.textContent = translated;
    $("#resultBadge").textContent = target === "en" ? "英语" : "中文";
    $("#resultNote").textContent = snapshot.selected
      ? "可插入到选中内容所在行后，或替换选中片段"
      : "可追加到内容末尾，或替换全部内容";
    result.classList.remove("hidden");
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    if (version === requestVersion) showError(error.message || "翻译失败，请重试。");
  } finally {
    if (version === requestVersion) {
      button.disabled = false;
      button.querySelector("span").textContent = "开始翻译";
    }
  }
}

function applyTranslation(mode) {
  if (!activeResult) return;
  const item = activeResult;
  if (editor.value !== item.originalDocument) {
    clearResult();
    showError("内容已发生变化，请重新翻译后再操作。");
    return;
  }
  const before = editor.value.slice(0, item.start);
  const after = editor.value.slice(item.end);
  let value;
  let caret;
  if (mode === "replace") {
    value = before + item.translated + after;
    caret = before.length + item.translated.length;
  } else {
    const nextLine = item.originalDocument.indexOf("\n", item.end);
    const insertAt = !item.selected || item.originalDocument[item.end] === "\n"
      ? item.end : nextLine !== -1 ? nextLine : item.originalDocument.length;
    const prefix = item.originalDocument.slice(0, insertAt);
    const after = item.originalDocument.slice(insertAt);
    const separator = prefix.endsWith("\n\n") || prefix.length === 0 ? "" : prefix.endsWith("\n") ? "\n" : "\n\n";
    const trailing = after.startsWith("\n\n") || !after ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    value = prefix + separator + item.translated + trailing + after;
    caret = prefix.length + separator.length + item.translated.length;
  }
  editor.value = value;
  editor.setSelectionRange(caret, caret);
  editingVersion++;
  localStorage.setItem("smart-trans-document", value);
  clearResult();
  clearError();
  updateEditorMeta();
  editor.focus();
}

editor.addEventListener("input", () => {
  editingVersion++;
  localStorage.setItem("smart-trans-document", editor.value);
  clearResult();
  clearError();
  updateEditorMeta();
});
["select", "click", "keyup"].forEach((event) => editor.addEventListener(event, updateEditorMeta));
editor.addEventListener("contextmenu", () => {
  contextSelection = editor.selectionStart < editor.selectionEnd
    ? { start: editor.selectionStart, end: editor.selectionEnd } : null;
});
window.smartTrans.onTranslateSelection(() => {
  if (contextSelection) translate(contextSelection);
  contextSelection = null;
});
targetButton.addEventListener("click", () => {
  const opening = targetMenu.classList.contains("hidden");
  targetMenu.classList.toggle("hidden", !opening);
  targetButton.setAttribute("aria-expanded", String(opening));
});
targetMenu.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-target]");
  if (button) setTarget(button.dataset.target, true);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".language-control")) {
    targetMenu.classList.add("hidden");
    targetButton.setAttribute("aria-expanded", "false");
  }
});
$("#translateButton").addEventListener("click", () => translate());
$("#insertButton").addEventListener("click", () => applyTranslation("insert"));
$("#replaceButton").addEventListener("click", () => applyTranslation("replace"));
$("#closeResult").addEventListener("click", clearResult);
$("#copyButton").addEventListener("click", async () => {
  if (!activeResult) return;
  await window.smartTrans.copy(activeResult.translated);
  $("#copyButton").textContent = "已复制";
  setTimeout(() => { $("#copyButton").textContent = "复制译文"; }, 1600);
});
$("#settingsButton").addEventListener("click", () => settingsDialog.showModal());
$("#shortcutsButton").addEventListener("click", () => $("#shortcutsDialog").showModal());
$("#saveSettings").addEventListener("click", () => {
  localStorage.setItem("smart-trans-provider", providerSelect.value);
});
providerSelect.addEventListener("change", () => {
  localStorage.setItem("smart-trans-provider", providerSelect.value);
  updateProviderStatus();
});
async function updateProviderStatus() {
  const status = await window.smartTrans.status();
  const name = providerSelect.value === "codex" ? "Codex CLI" : "Cursor CLI";
  $("#providerStatus").textContent = status[providerSelect.value]
    ? name + " 已安装。请确保已在命令行登录。"
    : "未找到 " + name + "。请先安装或改选另一项。";
}
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    if (event.shiftKey) applyTranslation("replace");
    else translate();
  } else if (event.altKey && event.key === "Enter") {
    event.preventDefault();
    applyTranslation("insert");
  } else if (event.key === "Escape" && !settingsDialog.open && !$("#shortcutsDialog").open) {
    clearResult();
  }
});
setTarget(detectTarget(editor.value));
updateEditorMeta();
updateProviderStatus();
