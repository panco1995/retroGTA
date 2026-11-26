import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false,
  },
  plugins: singleFile ? [viteSingleFile({ outputFileName: 'retrogta.html' })] : [],
});
