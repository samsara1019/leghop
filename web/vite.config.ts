import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Leghop',
        short_name: 'Leghop',
        description: '여행 일정을 구간별 이동 경로로 자동 변환',
        lang: 'ko',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 정적 가이드와 공유 이미지는 앱 셸이 아니다. precache에 넣으면
        // 설치 용량만 커지고, 어차피 검색에서 직접 들어오는 문서다.
        globIgnores: ['guide/**', 'og.png', '**/og.png'],
        // Google Maps 콘텐츠는 약관상 오프라인 캐시가 금지된다 (DESIGN.md §7.1-2).
        // 앱 셸만 precache 하고, 아래 호스트는 항상 네트워크로만 나가도록 못 박는다.
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/(maps\.googleapis\.com|maps\.gstatic\.com|[a-z0-9-]+\.ggpht\.com|khms\d*\.googleapis\.com)\//i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        // 개발 중에는 SW를 끈다. 켜두면 HMR과 캐시가 서로 싸운다.
        enabled: false,
      },
    }),
  ],
})
