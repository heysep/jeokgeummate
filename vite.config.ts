import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 서버 없는 단독 미니앱: 모든 계산·저장은 기기 안(localStorage)에서만.
export default defineConfig({
  plugins: [react()],
});
