(() => {
  const $ = id => document.getElementById(id);
  const library = $('favoritesDialog'), edit = $('favoriteEditDialog');
  let items = [], editingId = null, duplicate = null, removed = null, saving = false, speaking = false;
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = value;
    return element;
  };
  function button(label, action) {
    const element = node('button', 'secondary-button', label);
    element.type = 'button'; element.addEventListener('click', action); return element;
  }
  function status(value) { $('favoritesStatus').textContent = value; }
  function showEditor(value = {}) {
    if (document.querySelector('dialog[open]') && !library.open && !edit.open) return;
    editingId = value.id || null; duplicate = null;
    $('favoriteEnglish').value = value.english || '';
    $('favoriteChinese').value = value.chinese || '';
    $('favoriteNote').value = value.note || '';
    $('favoriteSource').value = value.source || '';
    $('favoriteEditTitle').textContent = editingId ? '编辑收藏' : '收藏单词 / 短句';
    $('favoriteEditStatus').textContent = (value.english?.length > 2000 || value.chinese?.length > 4000)
      ? '内容较长，请精简为英文单词或短句后再保存。' : '';
    $('favoriteEditExisting').classList.add('hidden');
    if (!edit.open) edit.showModal();
    $('favoriteEnglish').focus();
  }
  async function refresh() {
    const result = await window.smartTrans.listFavorites();
    if (!result.ok) throw new Error(result.error);
    items = result.items; render();
  }
  function render() {
    const query = $('favoritesSearch').value.trim().toLocaleLowerCase();
    const visible = items.filter(item => [item.english, item.chinese, item.note, item.source].some(value => value.toLocaleLowerCase().includes(query)));
    $('favoritesCount').textContent = query ? `找到 ${visible.length} / ${items.length} 条` : `${items.length} 条收藏`;
    const list = $('favoritesList'); list.replaceChildren();
    if (!visible.length) {
      list.append(node('p', 'favorites-empty', query ? '没有匹配的收藏，试试其他关键词。' : '还没有收藏。选中英文后右键收藏，或点击「新增收藏」。'));
      return;
    }
    for (const item of visible) {
      const card = node('article', 'favorite-card');
      card.append(node('h3', 'favorite-english', item.english));
      if (item.chinese) card.append(node('p', 'favorite-chinese', item.chinese));
      if (item.note) card.append(node('p', 'favorite-note', '备注：' + item.note));
      card.append(node('p', 'favorite-meta', [item.source, new Date(item.createdAt).toLocaleDateString('zh-CN')].filter(Boolean).join(' · ')));
      const actions = node('div', 'favorite-card-actions');
      actions.append(button('听发音', async () => {
        status('正在朗读…'); speaking = true;
        try {
          const response = await window.smartTrans.speak({ text: item.english, mode: 'read', rate: Number($('speechRate').value) });
          status(response.ok ? '朗读已结束' : response.error);
        } catch { status('朗读失败，请重试。'); }
        finally { speaking = false; }
      }), button('编辑', () => showEditor(item)), button('取消收藏', async () => {
        try {
          const result = await window.smartTrans.removeFavorite(item.id);
          if (!result.ok) throw new Error(result.error);
          removed = result.item; $('favoritesUndo').classList.remove('hidden');
          await refresh(); status('已取消收藏，可撤销。');
        } catch (error) { status(error.message); }
      }));
      card.append(actions); list.append(card);
    }
  }
  $('favoritesButton').addEventListener('click', async () => {
    if (document.querySelector('dialog[open]')) return;
    try {
      if (window.MiniView && !await window.MiniView.expand()) return;
      library.showModal(); library.scrollTop = 0; status('正在读取…');
      await refresh(); status('');
    } catch (error) { status(error.message); }
  });
  $('favoritesClose').addEventListener('click', () => library.close());
  library.addEventListener('close', () => { if (speaking) window.smartTrans.stopSpeech(); });
  $('favoritesSearch').addEventListener('input', render);
  $('favoriteNew').addEventListener('click', () => showEditor());
  $('favoriteEditClose').addEventListener('click', () => { if (!saving) edit.close(); });
  edit.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('favoriteEditExisting').addEventListener('click', () => { if (duplicate) showEditor(duplicate); });
  $('favoritesUndo').addEventListener('click', async () => {
    if (!removed) return;
    try {
      const { id, createdAt, updatedAt, ...value } = removed;
      const result = await window.smartTrans.saveFavorite(value);
      if (!result.ok) throw new Error(result.error);
      removed = null; $('favoritesUndo').classList.add('hidden');
      await refresh(); status(result.duplicate ? '该内容已在收藏本中。' : '已恢复收藏。');
    } catch (error) { status(error.message); }
  });
  $('favoriteForm').addEventListener('submit', async event => {
    event.preventDefault(); if (saving) return;
    saving = true; $('favoriteSave').disabled = true;
    $('favoriteEditStatus').textContent = '正在保存…';
    try {
      const result = await window.smartTrans.saveFavorite({ ...(editingId ? { id: editingId } : {}),
        english: $('favoriteEnglish').value, chinese: $('favoriteChinese').value,
        note: $('favoriteNote').value, source: $('favoriteSource').value });
      if (!result.ok) throw new Error(result.error);
      if (result.duplicate) {
        duplicate = result.item;
        $('favoriteEditStatus').textContent = '这条内容已经收藏，原有释义和备注已保留。可点击下方按钮编辑已有记录。';
        $('favoriteEditExisting').classList.remove('hidden');
      } else {
        if (library.open) await refresh();
        edit.close(); status('已保存收藏。');
        toast('已保存到收藏本');
      }
    } catch (error) { $('favoriteEditStatus').textContent = error.message; }
    finally { saving = false; $('favoriteSave').disabled = false; }
  });
  function toast(text) {
    $('favoritesToast').textContent = text; $('favoritesToast').classList.remove('hidden');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => $('favoritesToast').classList.add('hidden'), 2200);
  }
  window.smartTrans.onFavoriteSelection(({ text }) => {
    const chinese = /[\u3400-\u9fff]/.test(text) && (text.match(/[\u3400-\u9fff]/g)?.length || 0) > (text.match(/[a-z]/gi)?.length || 0) / 2;
    showEditor({ english: chinese ? '' : text, chinese: chinese ? text : '', source: window.JiraView?.isActive() ? 'Jira 选区' : window.LearningView?.isActive() ? '英语学习选区' : '文本选区' });
  });
  window.FavoritesView = { addPair(original, translated, source, target) {
    const english = target === 'en' ? translated : original;
    const chinese = target === 'en' ? original : translated;
    showEditor({ english, chinese, source });
  } };
})();
