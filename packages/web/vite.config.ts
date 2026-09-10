import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // strictPort, deliberately. The API's CORS allowlist is explicit, so a
    // silent fallback to 5174 turns every request into a bare "Failed to
    // fetch" that looks like the API is down. Fail loudly on a taken port
    // instead. README lists this as the first gotcha.
    port: 5173,
    strictPort: true,
  },
});

