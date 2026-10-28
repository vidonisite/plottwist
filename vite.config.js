import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/plot-twist.svg', 'icons/plot-twist-192.png', 'icons/plot-twist-512.png'],
      manifest: {
        name: 'PLOT TWIST',
        short_name: 'PLOT TWIST',
        description: 'Hemliga meddelanden, selfies och privata chattar.',
        theme_color: '#211b2b',
        background_color: '#211b2b',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/plot-twist-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/plot-twist-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/plot-twist.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
