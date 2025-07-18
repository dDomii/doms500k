import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '192.168.100.60',
    port: 5180,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});