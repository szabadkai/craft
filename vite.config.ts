import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules\/three/,
              maxSize: 260_000,
            },
          ],
        },
      },
    },
  },
});
