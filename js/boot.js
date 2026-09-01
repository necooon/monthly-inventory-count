// 初回読み込み時の処理（クラウド取得が終わるまで保存しない。空の端末がクラウドを上書きしないため）
mountItemForms();
initSupabase();
Promise.resolve(startCloudListener()).finally(() => {
  renderFilters();
  showPage(CheckStock.state.ui.currentPage);
});

async function getAIAdvice() {
  const resultDiv = document.getElementById('ai-result');
  const loadingSpinner = document.getElementById('ai-loading');

  const itemsToOrder = CheckStock.state.stockItems.filter(I.needsOrder);

  if (itemsToOrder.length === 0) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '現在、発注が必要なアイテムはありません。素晴らしい管理状態です！';
    return;
  }

  const itemListText = itemsToOrder.map(item => `- [${I.normalizeCategory(item.category) || C.UNSET_CATEGORY_LABEL}] ${item.name} (必要数: ${formatQty(item.target, item.unit)}, 現在数: ${formatQty(item.count, item.unit)}, 補充基準: ${formatQty(item.orderThreshold, item.unit)}, 不足分: ${formatQty(item.target - item.count, item.unit)})`).join('\n');
  const prompt = `私は家庭の在庫管理をしています。現在、以下のアイテムが不足しており、購入が必要です。カテゴリ（医薬品・日用品・食品など）ごとにまとめて買い物できると助かります。
  
${itemListText}

これらのアイテムを効率的、あるいはお得に購入するためのアドバイス（例えば、まとめ買いの目安、代替品、ドラッグストアやオンラインショップでの購入のコツなど）を、簡潔に3つほど教えてください。`;

  loadingSpinner.style.display = 'inline-block';
  resultDiv.style.display = 'none';

  const apiKey = "";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [{ text: "あなたは主婦・主夫の味方である、親切で賢い家事アドバイザーです。簡潔で分かりやすい言葉で回答してください。HTMLタグ(<b>, <ul>, <li>など)を使って読みやすく装飾してください。" }]
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      const aiText = data.candidates[0].content.parts[0].text;
      resultDiv.innerHTML = aiText;
    } else {
      resultDiv.innerHTML = '申し訳ありません、アドバイスの取得に失敗しました。';
    }
  } catch (error) {
    console.error('Error fetching AI advice:', error);
    resultDiv.innerHTML = 'エラーが発生しました。時間を置いて再度お試しください。';
  } finally {
    loadingSpinner.style.display = 'none';
    resultDiv.style.display = 'block';
  }
}

window.getAIAdvice = getAIAdvice;
