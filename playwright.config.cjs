const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:8765', browserName: 'chromium', viewport: { width: 1536, height: 1024 }, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  webServer: { command: 'python3 -m http.server 8765 --bind 127.0.0.1 --directory _site', url: 'http://127.0.0.1:8765/page-editor.html', reuseExistingServer: !process.env.CI, timeout: 15000 }
});
