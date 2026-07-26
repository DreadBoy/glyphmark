import { existsSync, readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import * as path from 'node:path';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../..');

/**
 * Force Emotion's *server* builds, even though this bundle runs in a browser.
 *
 * `renderToHtml` is a server-side renderer: it collects styles through
 * `extractCriticalToChunks` and emits them as `<style>` tags in the HTML string
 * it returns. Emotion ships separate browser builds where `cache.insert`
 * instead writes rules straight into the live document and leaves the cache's
 * `inserted` registry empty. Because esbuild resolves with `platform: 'browser'`
 * it picks those by default — which silently produced correct markup with empty
 * `<style>` tags: every class name present, not one rule among them, styles
 * landing in the shell page rather than the rendered document.
 *
 * Each Emotion package points `module` at its non-browser ESM build, so resolve
 * through that field and ignore the `browser` condition and remaps entirely.
 */
const emotionServerBuilds = {
  name: 'emotion-server-builds',
  setup(build) {
    build.onResolve({ filter: /^@emotion\// }, (args) => {
      let pkgJsonPath;
      try {
        pkgJsonPath = require.resolve(`${args.path}/package.json`);
      } catch {
        const candidate = path.join(
          WORKSPACE_ROOT,
          'node_modules',
          args.path,
          'package.json',
        );
        if (!existsSync(candidate)) return null;
        pkgJsonPath = candidate;
      }

      const moduleEntry = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).module;
      if (!moduleEntry) {
        throw new Error(
          `${args.path} no longer declares a "module" entry; the preview bundle ` +
            'relies on it to select Emotion\'s server build over its browser build.',
        );
      }

      return { path: path.join(path.dirname(pkgJsonPath), moduleEntry) };
    });
  },
};

/**
 * Modules that end up in the graph but are never reachable at runtime here.
 *
 * - `playwright`: `@glyphmark/core` exposes `renderToHtml` and `renderToPdf`
 *   from one entry point. The preview only calls the former, but esbuild still
 *   walks the latter's dynamic `import('playwright')`.
 * - `through` / `html-tokenize` / `multipipe`: imported at module scope by
 *   `@emotion/server` (its browser build too, not just the Node one) purely to
 *   serve `renderStylesToNodeStream`. The preview uses
 *   `extractCriticalToChunks` instead. Left in, their `readable-stream`
 *   dependency dereferences `Buffer` while initialising and throws the instant
 *   the bundle loads in JCEF.
 *
 * Resolving them to an empty module keeps the bundle browser-clean. If any of
 * this ever does become reachable, it fails loudly at the call site rather than
 * silently misrendering.
 */
const UNREACHABLE = new Set([
  'playwright',
  'playwright-core',
  'through',
  'html-tokenize',
  'multipipe',
  ...builtinModules,
]);

const stubUnreachable = {
  name: 'stub-unreachable',
  setup(build) {
    build.onResolve({ filter: /^[^.]/ }, (args) => {
      const bare = args.path.replace(/^node:/, '');
      if (!UNREACHABLE.has(bare)) return null;
      return { path: args.path, namespace: 'unreachable-stub' };
    });
    build.onLoad({ filter: /.*/, namespace: 'unreachable-stub' }, () => ({
      // A bare function, not a throwing Proxy: esbuild's CJS interop reads
      // `__esModule`/`default` off every import at load time, so the stub must
      // tolerate property access. Only actually invoking it is a real bug.
      contents:
        'module.exports = function stubbedNodeOnlyModule() {' +
        '  throw new Error("glyphmark preview: stubbed Node-only module was called");' +
        '};',
      loader: 'js',
    }));
  },
};

await esbuild.build({
  entryPoints: ['apps/intellij-plugin/preview/src/index.ts'],
  outfile: 'apps/intellij-plugin/src/main/resources/preview/bundle.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  // Hide `document` from the bundle's contents.
  //
  // `renderToHtml` is a server-side renderer, and Emotion decides at *runtime*
  // whether it is one: `var isBrowser = typeof document !== 'undefined'`. In a
  // browser that is always true, so `cache.insert` writes rules into the live
  // document and `extractCriticalToChunks` finds nothing — correct markup with
  // empty `<style>` tags. Selecting Emotion's server build does not help; the
  // check is in that build too.
  //
  // Wrapping the bundle in a parameter named `document` shadows the global for
  // every module inside it, so Emotion takes its server path and hands back
  // real CSS. `preview/src/index.ts` deliberately reaches for the DOM through
  // `globalThis` instead, since it genuinely does need the shell page.
  banner: { js: '(function (document) {' },
  footer: { js: '})(undefined);' },
  plugins: [emotionServerBuilds, stubUnreachable],
  logLevel: 'info',
});
