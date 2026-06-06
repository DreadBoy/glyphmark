// Paged.js polyfill, inlined at build time via Vite's `?raw` loader so the
// rendered HTML is fully self-contained — no CDN, no separate fetch. The
// pagedjs package's exports map doesn't expose dist/ as a subpath, so we
// reach it through a relative node_modules path.
// eslint-disable-next-line @nx/enforce-module-boundaries -- see above: no exports-map subpath for dist/
import polyfill from '../../../../node_modules/pagedjs/dist/paged.polyfill.min.js?raw';

export const PAGEDJS_POLYFILL = polyfill as string;
