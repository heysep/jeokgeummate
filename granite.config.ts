import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // src/config.ts APP_NAME과 문자 단위 동일. 딥링크 intoss://jeokgeummate.
  appName: 'jeokgeummate',
  brand: {
    displayName: '적금 메이트',
    primaryColor: '#B8860B',
    // 콘솔에 아이콘 업로드 후 반드시 static.toss.im URL로 교체할 것 (로컬 경로 금지)
    icon: 'TODO://upload-to-console-first',
  },
  web: { host: 'localhost', port: 5173, commands: { dev: 'vite', build: 'vite build' } },
  permissions: [],
  outdir: 'dist',
});
