import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // src/config.ts APP_NAME과 문자 단위 동일. 딥링크 intoss://jeokgeummate.
  appName: 'jeokgeummate',
  brand: {
    displayName: '적금 메이트',
    primaryColor: '#B8860B',
    // 콘솔에 아이콘 업로드 후 반드시 static.toss.im URL로 교체할 것 (로컬 경로 금지)
    icon: 'https://static.toss.im/appsintoss/61245/29b68c4b-5e5e-441f-a2e1-14445a42b4f2.png',
  },
  web: { host: 'localhost', port: 5173, commands: { dev: 'vite', build: 'vite build' } },
  permissions: [],
  outdir: 'dist',
});
