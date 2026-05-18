/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/core',
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      plugins: [['@swc/plugin-emotion', {}]],
    }),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
      pathsToAliases: false,
    }),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  // Configuration for building your library.
  // See: https://vite.dev/guide/build.html#library-mode
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: 'src/index.ts',
      name: '@glyphmark/core',
      fileName: 'index',
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ['es' as const],
    },
    rollupOptions: {
      // External packages that should not be bundled into your library.
      external: [
        'react',
        'react-dom',
        'react-dom/server',
        'react/jsx-runtime',
        // React's scheduler picks `setImmediate` when available, which Node
        // exposes — that path avoids the MessageChannel that otherwise
        // keeps the event loop alive (React #20756). But the bundler can't
        // see that `typeof setImmediate === "function"` is true on Node and
        // dead-code-eliminates the branch, leaving only MessageChannel.
        // Keeping scheduler external lets Node resolve and run the upstream
        // code with both branches intact.
        'scheduler',
        '@emotion/react',
        '@emotion/react/jsx-runtime',
        '@emotion/styled',
        '@emotion/cache',
        '@emotion/server',
        '@emotion/server/create-instance',
        // Playwright is only loaded on demand inside renderToPdf via a
        // dynamic import. Keeping it external avoids bundling its (large,
        // node-only) runtime into core's ESM artifact.
        'playwright',
      ],
    },
  },
  test: {
    name: '@glyphmark/core',
    watch: false,
    globals: true,
    environment: 'node',
    include: [
      '{src,test,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/core',
      provider: 'v8' as const,
    },
  },
}));
