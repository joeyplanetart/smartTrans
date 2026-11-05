(() => {
  const layout = document.getElementById('textLayout');
  const saved = localStorage.getItem('smart-trans-text-layout');
  layout.value = saved === 'side-by-side' ? saved : 'stacked';
  function applyLayout() {
    document.body.classList.toggle('text-side-by-side', layout.value === 'side-by-side');
  }
  applyLayout();
  layout.addEventListener('change', () => {
    applyLayout();
    localStorage.setItem('smart-trans-text-layout', layout.value);
  });
})();
