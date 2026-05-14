import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
