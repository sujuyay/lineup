import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

// Library build: bundles the component as an ES module + types + stylesheet for
// consumption by other repos. React (and the dnd-kit / lz-string deps) are
// externalised so the consumer's copies are used. The standalone app build
// stays in vite.config.ts.
export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: './tsconfig.app.json',
      exclude: ['**/*.test.ts', 'src/testHelpers.ts', 'src/main.tsx', 'src/analytics.ts'],
    }),
  ],
  build: {
    outDir: 'lib',
    sourcemap: true,
    // Don't copy the standalone app's public/ assets into the package.
    copyPublicDir: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@dnd-kit/core',
        '@dnd-kit/sortable',
        '@dnd-kit/utilities',
        'lz-string',
      ],
    },
  },
})
