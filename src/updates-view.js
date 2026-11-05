(() => {
  const dialog = document.getElementById('updatesDialog');
  document.getElementById('updatesButton').addEventListener('click', () => {
    dialog.showModal();
    dialog.scrollTop = 0;
  });
})();
