import {defineConfig} from 'vitest/config';

// Root vitest config so tools that launch vitest from the workspace root
// (e.g. IntelliJ's vitest run configuration) discover each lib/app's
// per-project vite.config.mts (which carries plugin setup like SWC +
// @swc/plugin-emotion). Without this, vitest falls back to defaults and
// loses transforms like Emotion's component-selector target generation.
export default defineConfig({
  test: {
    projects: ['libs/*', 'apps/*'],
  },
});
