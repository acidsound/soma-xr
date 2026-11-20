import { defineConfig } from 'vite';

// GitHub Pages project sites are served from /<repo-name>/, while local dev
// and the Express server serve from /. GITHUB_PAGES=1 is set only in CI.
const githubPages = process.env.GITHUB_PAGES === '1';

export default defineConfig({
  base: githubPages ? '/soma-xr/' : '/',
  define: {
    __STATIC_DEMO__: JSON.stringify(githubPages),
  },
});
