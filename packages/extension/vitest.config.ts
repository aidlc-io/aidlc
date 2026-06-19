import { defineConfig } from 'vitest/config';

// Standalone test config so the runner does not load `vite.config.ts` (the
// webview bundler config, which pulls in React-only plugins). Extension unit
// tests are plain Node — no DOM, no bundling.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
