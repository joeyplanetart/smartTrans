(() => {
  const button = document.getElementById('miniButton');
  const pin = document.getElementById('pinButton');
  let mini = false, changing = false, previousJira = false, previousLearning = false, pinned = false;
  function showPinned(value) {
    pinned = value;
    pin.setAttribute('aria-pressed', String(value));
    pin.textContent = value ? '已置顶' : '置顶';
    pin.title = value ? '取消置顶 Mini 窗口' : '置顶 Mini 窗口，切换其他应用时仍保持可见';
  }
  pin.addEventListener('click', async () => {
    if (!mini || changing) return;
    pin.disabled = true;
    try { showPinned(await window.smartTrans.setPinned(!pinned)); }
    catch { pin.textContent = '重试置顶'; }
    finally { pin.disabled = false; }
  });
  async function toggleMini() {
    if (changing || document.querySelector('dialog[open]')) return;
    if (!mini && window.JiraView?.isBusy()) {
      button.textContent = '请先完成 Jira 操作';
      setTimeout(() => { if (!mini) button.textContent = 'Mini 模式'; }, 1800);
      return;
    }
    changing = true;
    button.disabled = true;
    try {
      if (!mini) {
        previousJira = Boolean(window.JiraView?.isActive());
        previousLearning = Boolean(window.LearningView?.isActive());
        if (previousJira) window.JiraView.close();
        if (previousLearning) window.LearningView.close();
        if (window.JiraView?.isActive()) return;
      }
      const enabled = await window.smartTrans.setMini(!mini);
      mini = enabled;
      if (!mini) showPinned(false);
      document.body.classList.toggle('mini-mode', mini);
      button.textContent = mini ? '完整窗口 ↗' : 'Mini 模式';
      button.setAttribute('aria-pressed', String(mini));
      if (!mini && previousJira) {
        // A running text translation must finish before switching back to Jira.
        if (!window.TextTranslation.isBusy()) window.JiraView.open();
        previousJira = false;
      }
      if (!mini && previousLearning) {
        if (!window.TextTranslation.isBusy()) document.getElementById('learningModeButton').click();
        previousLearning = false;
      }
      if (mini) document.getElementById('editor').focus();
    } catch {
      if (!mini && previousJira) window.JiraView.open();
      button.textContent = '切换失败，请重试';
    } finally { changing = false; button.disabled = false; }
  }
  window.MiniView = { expand: async () => { if (mini) await toggleMini(); return !mini; } };
  button.addEventListener('click', toggleMini);
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyM') {
      event.preventDefault(); toggleMini();
    }
  });
})();
