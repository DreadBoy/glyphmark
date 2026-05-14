import { renderToString } from 'react-dom/server';
import { CacheProvider, Global } from '@emotion/react';
import createCache from '@emotion/cache';
import createEmotionServer from '@emotion/server/create-instance';

function PageShadow() {
  return (
    <Global
      styles={{
        body: {
          background: '#eee',
        },
        '.pagedjs_page': {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          margin: '1rem auto',
          background: 'white',
        },
      }}
    />
  );
}

/**
 * Renders PageShadow into its own emotion cache and emits a `<style>` tag
 * with `media="screen"`. Two constraints combine to require this:
 * 1. Paged.js preprocesses every `<style>` in head except those marked with
 *    `media~="screen"`, and would otherwise strip these rules.
 * 2. Emotion's default style tag has no `media` attribute — only by
 *    isolating the cache can we attach one without contaminating the main
 *    stylesheet.
 */
export function renderPageShadowTags(): string {
  const cache = createCache({ key: 'gms' });
  const server = createEmotionServer(cache);
  const html = renderToString(
    <CacheProvider value={cache}>
      <PageShadow />
    </CacheProvider>,
  );
  const { styles } = server.extractCriticalToChunks(html);
  return styles
    .map(
      (s) =>
        `<style media="screen" data-emotion="${s.key} ${s.ids.join(' ')}">${s.css}</style>`,
    )
    .join('');
}
