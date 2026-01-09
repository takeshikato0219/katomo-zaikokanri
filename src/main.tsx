import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 初期データを読み込む関数
async function loadInitialData() {
  // 既にデータがある場合はスキップ
  const existingProducts = localStorage.getItem('inventory_products');
  if (existingProducts && JSON.parse(existingProducts).length > 5) {
    console.log('既存データあり、初期データの読み込みをスキップ');
    return;
  }

  try {
    const response = await fetch('/initial_data.json');
    if (!response.ok) {
      console.log('初期データファイルが見つかりません');
      return;
    }

    const data = await response.json();

    if (data.inventory_suppliers) {
      localStorage.setItem('inventory_suppliers', JSON.stringify(data.inventory_suppliers));
    }
    if (data.inventory_products) {
      localStorage.setItem('inventory_products', JSON.stringify(data.inventory_products));
    }
    if (data.inventory_stocks) {
      localStorage.setItem('inventory_stocks', JSON.stringify(data.inventory_stocks));
    }

    console.log('初期データを読み込みました:', {
      suppliers: data.inventory_suppliers?.length || 0,
      products: data.inventory_products?.length || 0,
      stocks: data.inventory_stocks?.length || 0,
    });

    // ページをリロードしてデータを反映
    window.location.reload();
  } catch (error) {
    console.log('初期データの読み込みエラー:', error);
  }
}

// 初期データを読み込んでからアプリを起動
loadInitialData().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
