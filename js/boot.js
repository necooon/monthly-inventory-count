// 初回読み込み時の処理（クラウド取得が終わるまで保存しない。空の端末がクラウドを上書きしないため）
mountItemForms();
initSupabase();
Promise.resolve(startCloudListener()).finally(() => {
  renderFilters();
  showPage(currentPage);
});
