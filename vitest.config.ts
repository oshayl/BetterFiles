import { defineConfig } from 'vitest/config';

/**
 * Tests cover the pure logic only - path handling, file-type mapping,
 * scale-to-fit maths, SVG sanitisation, search/sort/filter, index diffing and
 * migrations. Anything touching the Photoshop or UXP host is validated by the
 * in-panel self-test harness instead, because it cannot run outside Photoshop.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/adapters/photoshop/**', 'src/adapters/filesystem/**'],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
});
