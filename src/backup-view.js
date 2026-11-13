(() => {
  const $ = id => document.getElementById(id);
  const settings = $('settingsDialog');
  const preview = $('backupPreviewDialog');
  const status = $('backupStatus');
  const keys = {
    document: 'smart-trans-document', learning: 'smart-trans-learning-v1',
    provider: 'smart-trans-provider', layout: 'smart-trans-text-layout',
    speechRate: 'smart-trans-speech-rate', mode: 'smart-trans-mode',
    jiraUrl: 'smart-trans-jira-url',
  };
  let pending = null, busy = false;

  function snapshot() {
    const savedLearning = localStorage.getItem(keys.learning);
    return { document: $('editor').value, learning: savedLearning === null ? null : JSON.parse(savedLearning),
      preferences: {
        provider: localStorage.getItem(keys.provider), layout: localStorage.getItem(keys.layout),
        speechRate: localStorage.getItem(keys.speechRate), mode: localStorage.getItem(keys.mode),
        jiraUrl: localStorage.getItem(keys.jiraUrl) || '',
      } };
  }
  function message(value) { status.textContent = value; }
  function isWorking() { return window.TextTranslation?.isBusy() || window.JiraView?.isBusy(); }

  $('backupExport').addEventListener('click', async () => {
    if (busy) return;
    busy = true; $('backupExport').disabled = true;
    try {
      const result = await window.smartTrans.exportBackup(snapshot());
      if (!result.ok) throw new Error(result.error);
      if (!result.canceled) message(`备份已导出：${result.filePath}（${result.favorites} 条收藏）`);
    } catch (error) { message(`导出失败：${error.message}`); }
    finally { busy = false; $('backupExport').disabled = false; }
  });

  $('backupImport').addEventListener('click', async () => {
    if (busy) return;
    if (isWorking()) { message('请先完成或取消正在进行的翻译，再导入备份。'); return; }
    busy = true; $('backupImport').disabled = true;
    try {
      const result = await window.smartTrans.openBackup();
      if (!result.ok) throw new Error(result.error);
      if (result.canceled) return;
      pending = result.backup;
      const dayCount = Object.values(pending.data.learning?.days || {}).filter(day => day?.completed).length;
      $('backupPreviewSummary').textContent = `文件：${result.filePath}\n导出时间：${new Date(pending.exportedAt).toLocaleString('zh-CN')}\n编辑区：${pending.data.document.length} 字符 · 已完成学习：${dayCount} 天 · 收藏：${pending.favorites.length} 条 · 便签：${pending.notes ? `${pending.notes.items.length} 张` : '旧版备份，保留当前便签'}`;
      $('backupPreviewError').textContent = '';
      settings.close();
      preview.showModal();
    } catch (error) { message(`导入失败：${error.message}`); }
    finally { busy = false; $('backupImport').disabled = false; }
  });

  function closePreview() { pending = null; preview.close(); }
  $('backupCancel').addEventListener('click', closePreview);
  $('backupPreviewClose').addEventListener('click', closePreview);
  preview.addEventListener('close', () => { pending = null; });

  $('backupConfirm').addEventListener('click', async () => {
    if (!pending || busy) return;
    if (isWorking()) { $('backupPreviewError').textContent = '请先完成或取消正在进行的翻译。'; return; }
    busy = true; $('backupConfirm').disabled = true;
    const before = Object.fromEntries(Object.values(keys).map(key => [key, localStorage.getItem(key)]));
    const data = pending.data;
    const next = {
      [keys.document]: data.document,
      [keys.learning]: data.learning === null ? null : JSON.stringify(data.learning),
      [keys.provider]: data.preferences.provider,
      [keys.layout]: data.preferences.layout,
      [keys.speechRate]: data.preferences.speechRate,
      [keys.mode]: data.preferences.mode,
      [keys.jiraUrl]: data.preferences.jiraUrl,
    };
    try {
      for (const key of Object.values(keys)) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(next)) {
        if (value !== null) localStorage.setItem(key, value);
      }
      const result = await window.smartTrans.restoreBackupFavorites();
      if (!result.ok) throw new Error(result.error);
      try { sessionStorage.setItem('smart-trans-backup-restored', '备份已导入，数据已恢复。'); } catch { /* Reload still restores the imported state. */ }
      window.location.reload();
    } catch (error) {
      try {
        for (const key of Object.values(keys)) localStorage.removeItem(key);
        for (const [key, value] of Object.entries(before)) {
          if (value !== null) localStorage.setItem(key, value);
        }
        $('backupPreviewError').textContent = `导入失败，原有设置和学习记录已恢复：${error.message}`;
      } catch {
        $('backupPreviewError').textContent = `导入失败，部分本机数据可能已更改：${error.message}`;
      }
    } finally { busy = false; $('backupConfirm').disabled = false; }
  });

  const restored = sessionStorage.getItem('smart-trans-backup-restored');
  if (restored) {
    sessionStorage.removeItem('smart-trans-backup-restored');
    message(restored);
    settings.showModal();
  }
})();
