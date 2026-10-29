import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// App web instalable (PWA). El service worker guarda la interfaz para que
// abra sin señal; los reportes sin señal se guardan aparte (src/lib/colaOffline.ts).
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Librerías en archivos aparte: cambian poco y el celular las guarda en caché
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          supabase: ['@supabase/supabase-js'],
          mapa: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Huellas en la Vía',
        short_name: 'Huellas',
        description: 'Reporta animales muertos en las calles del Ecuador para que los levanten.',
        lang: 'es-EC',
        theme_color: '#252D36',
        background_color: '#252D36',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Nunca guardar en caché las llamadas a Supabase (datos y fotos privadas)
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/, /^\/storage/],
        runtimeCaching: [
          {
            // Teselas del mapa: se reutilizan si no hay señal
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapa-teselas',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
