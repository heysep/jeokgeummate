import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { initAds } from './ads/BannerAd';

// 배너가 붙기 전에 이탈하는 걸 줄이려고 렌더보다 먼저 시작한다.
initAds();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
