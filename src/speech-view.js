(() => {
  const byId = id => document.getElementById(id);
  const status = byId('speechStatus'), stop = byId('stopSpeech'), rate = byId('speechRate');
  let selection = '', speaking = false, request = 0;
  const saved = localStorage.getItem('smart-trans-speech-rate');
  if (['110', '170', '210'].includes(saved)) rate.value = saved;
  rate.addEventListener('change', () => localStorage.setItem('smart-trans-speech-rate', rate.value));
  function selectedText() {
    const active = document.activeElement;
    if (active?.id === 'editor') return active.value.slice(active.selectionStart, active.selectionEnd);
    const range = window.getSelection();
    const parent = range?.anchorNode?.parentElement;
    return parent?.closest('#translationText, #jiraRows') ? range.toString() : '';
  }
  document.addEventListener('selectionchange', () => { selection = selectedText(); });
  // Preserve the document selection when clicking playback controls.
  document.querySelectorAll('.speech-toolbar button').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
  async function speak(text, mode) {
    const id = ++request;
    status.textContent = '准备朗读…';
    try {
      const result = await window.smartTrans.speak({ text, mode, rate: Number(rate.value) });
      if (id === request && !result.ok) status.textContent = result.error;
    } catch { if (id === request) status.textContent = '系统朗读不可用，请重试。'; }
  }
  byId('speakSelection').addEventListener('click', () => speak(selection, 'read'));
  byId('spellSelection').addEventListener('click', () => speak(selection, 'spell'));
  stop.addEventListener('click', () => window.smartTrans.stopSpeech());
  window.smartTrans.onSpeechAction(action => speak(action.text, action.mode));
  window.smartTrans.onSpeechState(state => {
    speaking = state.speaking;
    stop.disabled = !speaking;
    status.textContent = state.error || (speaking ? '正在朗读…' : '朗读已结束，可再次播放');
  });
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyS') {
      event.preventDefault(); speak(selectedText() || selection, 'read');
    } else if (event.key === 'Escape' && speaking) {
      event.preventDefault(); event.stopImmediatePropagation(); window.smartTrans.stopSpeech();
    }
  }, true);
})();
