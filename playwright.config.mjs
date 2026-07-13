import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.E2E_BASE_URL;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: { baseURL: externalBaseURL || 'http://localhost:3210', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
    ],
    webServer: externalBaseURL ? undefined : {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3210',
        env: { NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS: '1' },
        url: 'http://localhost:3210',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
