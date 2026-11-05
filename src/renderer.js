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
let currentRequest = null;
let undoActionIndex = -1;
const history = new EditorCore.History({ value: editor.value, start: 0, end: 0 });
const state = () => ({ value: editor.value, start: editor.selectionStart, end: editor.selectionEnd });

function persistEdit() {
  editingVersion++;
  localStorage.setItem("smart-trans-document", editor.value);
  clearResult();
  clearError();
  $("#timingDetails").classList.add("hidden");
  updateEditorMeta();
}
function changeDocument(value, caret, label) {
  history.selection(editor.selectionStart, editor.selectionEnd);
  editor.value = value;
  editor.setSelectionRange(caret, caret);
  history.record(state());
  undoActionIndex = history.index;
  $("#undoAction").textContent = "撤销" + label;
  persistEdit();
  editor.focus();
}
function historyCommand(command) {
  if (window.JiraView?.isActive()) { window.JiraView.editorCommand(command); return; }
  if (settingsDialog.open || $("#shortcutsDialog").open) return;
  cancelTranslation();
  const restored = command === "undo" ? history.undo() : history.redo();
  if (!restored) return;
  editor.value = restored.value;
  editor.setSelectionRange(restored.start, restored.end);
  undoActionIndex = -1;
  persistEdit();
  editor.focus();
}
function cancelTranslation() {
  if (currentRequest && !currentRequest.cancelled) {
    currentRequest.cancelled = true;
    window.smartTrans.cancel(currentRequest.requestId);
    $("#actionHint").textContent = "正在取消…";
  }
}

function detectTarget(value) {
  const selected = editor.selectionStart !== editor.selectionEnd
    ? value.slice(editor.selectionStart, editor.selectionEnd) : value;
  return EditorCore.detectLanguage(selected).target;
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
  if (!currentRequest) $("#actionHint").textContent = length > 0 ? "只翻译选中的内容" : "选择目标语言，开始翻译";
  const sourceText = length > 0 ? editor.value.slice(editor.selectionStart, editor.selectionEnd) : editor.value;
  $("#sourceLabel").textContent = EditorCore.detectLanguage(sourceText).source;
  $("#undoAction").classList.toggle("hidden", history.index !== undoActionIndex);
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
  if (window.JiraView?.isActive()) { window.JiraView.translate(); return; }
  if (currentRequest) return;
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
  const request = { requestId: crypto.randomUUID(), snapshot, target, phase: "启动引擎", started: performance.now(), cancelled: false };
  currentRequest = request;
  const button = $("#translateButton");
  button.disabled = true;
  button.querySelector("span").textContent = "翻译中…";
  $("#cancelButton").classList.remove("hidden");
  targetButton.disabled = true;
  providerSelect.disabled = true;
  $("#timingDetails").classList.add("hidden");
  const tick = () => {
    $("#actionHint").textContent = (request.cancelled ? "正在取消" : request.phase) + " · " + ((performance.now() - request.started) / 1000).toFixed(1) + " 秒";
  };
  tick();
  const timer = setInterval(tick, 100);
  try {
    const response = await window.smartTrans.translate({
      requestId: request.requestId,
      text: snapshot.text,
      target: request.target,
      provider: providerSelect.value
    });
    if (request.cancelled) { clearResult(); return; }
    if (!response.ok) throw new Error(response.error);
    if (version !== requestVersion || editingVersion !== snapshot.editingVersion) { clearResult(); return; }
    const { translation: translated, timings } = response;
    activeResult = { ...snapshot, translated };
    translationText.textContent = translated;
    $("#resultBadge").textContent = request.target === "en" ? "英语" : "中文";
    $("#resultNote").textContent = snapshot.selected
      ? "可插入到选中内容所在行后，或替换选中片段"
      : "可追加到内容末尾，或替换全部内容";
    result.classList.remove("hidden");
    result.querySelectorAll(".result-buttons button").forEach((item) => { item.disabled = false; });
    const seconds = (value) => value == null ? "—" : (value / 1000).toFixed(1) + " 秒";
    $("#timingDetails").textContent = timings.cached ? "复用本次运行的译文 · 总耗时 " + seconds(timings.totalMs)
      : "引擎就绪 " + seconds(timings.startupMs) + " · 首字 " + seconds(timings.firstTokenMs) + " · 总耗时 " + seconds(timings.totalMs);
    $("#timingDetails").classList.remove("hidden");
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    clearResult();
    if (version === requestVersion && !request.cancelled) showError(error.message || "翻译失败，请重试。");
  } finally {
    clearInterval(timer);
    currentRequest = null;
    $("#cancelButton").classList.add("hidden");
    targetButton.disabled = false;
    providerSelect.disabled = false;
    updateEditorMeta();
    if (request.cancelled) $("#actionHint").textContent = "已取消，原文已保留";
    if (version === requestVersion) {
      button.disabled = false;
      button.querySelector("span").textContent = "开始翻译";
    }
  }
}

function applyTranslation(mode) {
  if (window.JiraView?.isActive()) return;
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
  changeDocument(value, caret, mode === "replace" ? "替换" : "插入");
}

editor.addEventListener("beforeinput", (event) => {
  if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
    event.preventDefault();
    historyCommand(event.inputType === "historyUndo" ? "undo" : "redo");
  } else history.selection(editor.selectionStart, editor.selectionEnd);
});
editor.addEventListener("input", (event) => {
  cancelTranslation();
  history.record(state(), ["insertText", "insertCompositionText"].includes(event.inputType) ? "typing" : event.inputType?.startsWith("delete") ? "delete" : null);
  undoActionIndex = -1;
  persistEdit();
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
window.smartTrans.onProgress((event) => {
  const request = currentRequest;
  if (!request || request.requestId !== event.requestId || request.cancelled || request.snapshot.editingVersion !== editingVersion) return;
  if (event.type === "ready") request.phase = "等待首字";
  if (event.type === "text") {
    request.phase = "正在生成";
    translationText.textContent = event.text;
    $("#resultBadge").textContent = request.target === "en" ? "英语 · 生成中" : "中文 · 生成中";
    $("#resultNote").textContent = "完成格式校验后，即可插入或替换";
    result.querySelectorAll(".result-buttons button").forEach((item) => { item.disabled = true; });
    if (result.classList.contains("hidden")) {
      result.classList.remove("hidden");
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
});
window.smartTrans.onEditorCommand(historyCommand);
window.smartTrans.onDesktopAction((action) => {
  if (action.type === "clipboard") {
    if (window.JiraView?.isBusy()) { window.JiraView.notifyBusy(); return; }
    if (window.JiraView?.isActive()) window.JiraView.close();
    if (currentRequest) { showError("请先取消或等待当前翻译完成，再翻译剪贴板。"); return; }
    if (!action.text?.trim()) { showError("剪贴板没有可翻译的文字。"); return; }
    if (action.text.length > 20000) { showError("剪贴板内容超过 20,000 字符。"); return; }
    const prefix = editor.value ? editor.value + (editor.value.endsWith("\n\n") ? "" : "\n\n") : "";
    changeDocument(prefix + action.text, prefix.length + action.text.length, "粘贴");
    editor.setSelectionRange(prefix.length, editor.value.length);
    targetWasChosen = false;
    updateEditorMeta();
    translate({ start: prefix.length, end: editor.value.length });
  } else editor.focus();
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
$("#cancelButton").addEventListener("click", cancelTranslation);
$("#undoAction").addEventListener("click", () => historyCommand("undo"));
$("#insertButton").addEventListener("click", () => applyTranslation("insert"));
$("#replaceButton").addEventListener("click", () => applyTranslation("replace"));
$("#closeResult").addEventListener("click", () => { cancelTranslation(); clearResult(); });
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
window.smartTrans.desktopStatus().then((status) => {
  $("#desktopStatus").textContent = "全局唤起 ⌘⇧T：" + (status.show ? "已启用" : "快捷键被占用") +
    "；剪贴板翻译 ⌘⇧Y：" + (status.clipboard ? "已启用" : "快捷键被占用") + "。关闭窗口后可从菜单栏「译」再次打开。";
});
document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]")) return;
  if (window.JiraView?.isActive()) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); window.JiraView.translate(); }
    if (event.key === "Escape") window.JiraView.cancel();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !settingsDialog.open && !$("#shortcutsDialog").open) {
    event.preventDefault();
    historyCommand(event.shiftKey ? "redo" : "undo");
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    if (event.shiftKey) applyTranslation("replace");
    else translate();
  } else if (event.altKey && event.key === "Enter") {
    event.preventDefault();
    applyTranslation("insert");
  } else if (event.key === "Escape" && !settingsDialog.open && !$("#shortcutsDialog").open) {
    cancelTranslation();
    clearResult();
  }
});
setTarget(detectTarget(editor.value));
updateEditorMeta();
updateProviderStatus();
window.TextTranslation = { isBusy: () => Boolean(currentRequest) };
