import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Actions publishes this repository under /decision-calculator/.
  // Local development and the bundled preview server keep their root URL.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/decision-calculator/' : '/',
});
