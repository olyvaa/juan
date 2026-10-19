import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // Precio del MNQ para Juanitos Funding: el navegador no puede llamar a Yahoo directamente (CORS).
    proxy: {
      '/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/yahoo/, ''),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
  build: {
    rollupOptions: {
      // Dos páginas: Tandem (index.html) y el panel del bot (panel.html)
      input: {
        main: 'index.html',
        panel: 'panel.html',
      },
    },
  },
});
