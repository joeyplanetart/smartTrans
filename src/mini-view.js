(() => {
  const button = document.getElementById('miniButton');
  let mini = false, changing = false, previousJira = false;
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
        if (previousJira) window.JiraView.close();
        if (window.JiraView?.isActive()) return;
      }
      const enabled = await window.smartTrans.setMini(!mini);
      mini = enabled;
      document.body.classList.toggle('mini-mode', mini);
      button.textContent = mini ? '完整窗口 ↗' : 'Mini 模式';
      button.setAttribute('aria-pressed', String(mini));
      if (!mini && previousJira) {
        // A running text translation must finish before switching back to Jira.
        if (!window.TextTranslation.isBusy()) window.JiraView.open();
        previousJira = false;
      }
      if (mini) document.getElementById('editor').focus();
    } catch {
      if (!mini && previousJira) window.JiraView.open();
      button.textContent = '切换失败，请重试';
    } finally { changing = false; button.disabled = false; }
  }
  button.addEventListener('click', toggleMini);
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyM') {
      event.preventDefault(); toggleMini();
    }
  });
})();
