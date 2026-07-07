import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // @testing-library/react's automatic afterEach(cleanup) registration
    // detects the global `afterEach` -- needs test globals enabled to fire.
    globals: true,
  },
});
