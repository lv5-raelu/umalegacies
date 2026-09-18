import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Where `npm run dev:api` listens. Matches `PORT` in packages/api/src/main.ts. */
const LOCAL_API = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    // strictPort, still, but for a different reason than before.
    //
    // It used to be here because the API's CORS allowlist named this port, so a
    // silent fallback to 5174 turned every request into a bare "Failed to
    // fetch". There is no allowlist now. It stays because the proxy below makes
    // this port the ONLY address the browser talks to: a fallback would mean
    // half the app running on one port and the tab you have open on another,
    // which is more confusing than a refusal to start.
    port: 5173,
    strictPort: true,

    // The whole reason local development needs no CORS.
    //
    // In production the app and the API are one Vercel project on one origin,
    // and a rewrite sends /api/* to the function. Locally they are two
    // processes on two ports, which would be two origins -- so Vite forwards
    // /api to the API instead, and the browser only ever sees this one.
    //
    // That makes `API_BASE = '/api'` in src/api/client.ts correct in BOTH
    // places, with no environment variable and no allowlist, and it means a
    // same-origin bug shows up here rather than only after a deploy.
    //
    // This is the local counterpart of the rewrite in vercel.json, not an
    // extra concept: one rule, expressed twice because the two environments
    // have different places to put it.
    //
    // `vercel dev` would have done both jobs at once and cannot: it compiles
    // the API's TypeScript itself with a compiler that drops
    // emitDecoratorMetadata, so every injected dependency arrives undefined
    // ("Cannot read properties of undefined (reading 'getMeta')"). Setting
    // devCommand does not override it. Measured 2026-09-18.
    proxy: {
      '/api': {
        target: LOCAL_API,
        // Keep the browser's Host header. Nothing routes on it, and preserving
        // it keeps the request identical to the one production receives.
        changeOrigin: false,
      },
    },
  },
});
