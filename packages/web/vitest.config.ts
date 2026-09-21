import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * `node`, with no DOM, and the component tests still run here.
     *
     * They render through `react-dom/server`'s `renderToStaticMarkup`, which
     * needs no document and no jsdom dependency. It cannot click anything, and
     * that is the right ceiling: what these tests guard is what a component
     * PUTS ON SCREEN for a given set of props, which is exactly where a change
     * to a shared type -- a pick becoming a union, say -- goes wrong silently.
     */
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
