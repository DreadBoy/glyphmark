/**
 * Glyphmark CSS — original authored styles for PF2e-style document rendering.
 * Layout, typography, and theme styles for document rendering.
 */

export const GLYPHMARK_CSS = `
/* ── Design Tokens ─────────────────────────────────────────── */

:root {
  font-size: 10.4pt;
  line-height: 1;

  /* Primary palette */
  --gm-red: #5D0000;
  --gm-blue: #002564;
  --gm-gold: #D8C384;
  --gm-rust: #A76652;
  --gm-paper: #eee;

  /* Block backgrounds */
  --gm-note-bg: #D1C7B1;
  --gm-rules-bg: #F0E8D3;
  --gm-math-bg: #EAE3D8;
  --gm-math-border: #E0C9C0;

  /* Table colors */
  --gm-table-header: var(--gm-red);
  --gm-table-odd: #EDE3C7;
  --gm-table-even: #F4EEE0;
  --gm-table-foot: #E6D8B0;

  /* Trait colors */
  --gm-trait-default: #5d0000;
  --gm-trait-uncommon: #98503c;
  --gm-trait-rare: #002564;
  --gm-trait-unique: #54166d;
  --gm-trait-size: #3a7a58;
  --gm-trait-align: #566193;
  --gm-trait-type: #004316;
  --gm-trait-edge: var(--gm-gold);
  --gm-trait-border: var(--gm-gold);

  /* Links */
  --gm-link: rgb(172, 13, 74);
  --gm-link-hover: rgb(211, 126, 14);

  /* Font stacks */
  --font-display: 'Taroca';
  --font-heading: 'gin';
  --font-body: 'linotype-sabon';
  --font-ui: 'ff-good-web-pro';
  --font-ui-condensed: 'ff-good-web-pro-condensed', 'Open Sans Condensed', sans-serif;
}

/* ── Reset & Base ──────────────────────────────────────────── */

* {
  line-height: 1;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
}

p { margin: 0; }

img { filter: none; }

ul {
  margin-bottom: 0;
  padding-left: 2rem;
}

hr {
  margin-top: 0.15rem;
  margin-bottom: 0.15rem;
  border: 0;
  border-top: 1px solid #000d;
  border-bottom: 1px solid #0002;
  opacity: 0.75;
}

a { color: var(--gm-link); }
a:hover { color: var(--gm-link-hover); }

/* ── Layout Utilities ──────────────────────────────────────── */

.d-flex { display: flex; }
.flex-wrap { flex-wrap: wrap; }
.flex-even { flex: 1; }
.w-100 { width: 100%; }
.mr-0 { margin-right: 0; }
.my-0 { margin-top: 0; margin-bottom: 0; }
.ml-auto { margin-left: auto !important; }

.text-img {
  max-height: 0.85em;
  margin-top: -0.25em;
  filter: none !important;
}

.pointer {
  cursor: pointer;
  transition: color .15s ease-in-out;
}

.content { width: 100%; }

/* ── Spacing ───────────────────────────────────────────────── */

*+p, *+h1, *+h2, *+h3, *+h4, *+h5, *+h6,
*+table, *+hr,
h1+ul, h2+ul, h3+ul, h4+ul, h5+ul, h6+ul,
*+.content, *+.item, *+.note, *+.rules, *+.info, *+.math,
*+.right, *+.left, *+.p {
  margin-top: 0.5rem !important;
}

*+ul { margin-top: 0 !important; }

.right+.info, .right+.rules, .right+.math, .right+.note {
  margin-top: 0 !important;
}

h5+table { margin-top: 0 !important; }

/* ── Page ──────────────────────────────────────────────────── */

body { counter-reset: pages; }

.bg-paper { background: var(--gm-paper); }

.page {
  max-width: 210mm;
  padding: 5.25rem 5.5rem;
  margin: 0 auto 0.25rem;
  position: relative;
}

.page::after {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  font-family: 'Times New Roman', Times, serif;
  font-size: 0.9rem;
  opacity: 0.5;
  font-style: italic;
  font-weight: bold;
}

.page+.page { page-break-before: always; }

.page img { mix-blend-mode: multiply; max-width: 100%; }
.page .info img { mix-blend-mode: normal; }

.page-overlay {
  height: calc(10.88in + 1px);
  border-bottom: 1px dashed rgba(0, 0, 0, 0.05);
  pointer-events: none;
  position: absolute;
  width: 100%;
  top: 0;
  left: 0;
  right: 0;
}

/* ── Page Typography ───────────────────────────────────────── */

.page h1, .page h2, .page h3, .page h4, .page h5, .page h6 {
  font-weight: normal;
  font-size: 1rem;
  line-height: 1;
  margin: 0;
}

.page p, .page li {
  line-height: 1.4;
  text-align: justify;
}

/* ── Content Area Headings ─────────────────────────────────── */

.content h1 {
  font-family: var(--font-display);
  font-size: 1.75rem;
  color: var(--gm-blue);
  margin-bottom: -0.5rem;
}

.content h2 {
  font-family: var(--font-heading);
  font-size: 1.4rem;
  color: var(--gm-red);
}

.content h3 {
  font-family: var(--font-heading);
  font-variant: small-caps;
  font-size: 1.3rem;
  color: var(--gm-rust);
}

.content h4 {
  font-family: var(--font-heading);
  display: flex;
  background: var(--gm-blue);
  color: #EDE3C7;
  position: relative;
  font-size: 1.1rem;
  padding: 0.3rem 0 0.25rem 0.5rem;
  border-radius: 0.75rem 0.75rem 0 0;
  letter-spacing: 0.75px;
}

.content h4::after {
  position: absolute;
  content: "";
  left: 0;
  top: 0;
  height: 1.9rem;
  background: transparent;
  width: 100%;
  display: block;
  border-bottom: 1px solid var(--gm-blue);
}

.content h5 {
  font-family: var(--font-ui-condensed);
  text-transform: uppercase;
  font-size: 1.4rem;
  padding-top: 0.1rem;
  font-weight: bold;
}

.content p, .content li {
  font-family: var(--font-body);
  font-size: 0.925rem;
}

/* ── Columns ───────────────────────────────────────────────── */

.column {
  padding-left: 0.6rem;
  padding-right: 0.6rem;
}

.column .column:first-of-type { padding-left: 0; }
.column .column:last-of-type { padding-right: 0; }
.column+.column { border-left: 1px solid #F1F0EB; }

/* ── Watermark & Title ─────────────────────────────────────── */

.watermark {
  position: absolute;
  font-family: 'Times New Roman', Times, serif;
  top: 0.25rem;
  font-size: 0.9rem;
  color: #00000055;
  font-style: italic;
  left: 0;
  width: 100%;
  text-align: center;
}

.title {
  position: absolute;
  top: 1.5rem;
  left: 0;
  width: 100%;
}

.title h1 {
  font-family: var(--font-display) !important;
  font-weight: normal;
  width: 50%;
  text-align: right;
  padding: 0.25rem 0.5rem;
  margin-bottom: -0.5rem !important;
  border: 0.33rem solid #000;
  font-size: 1rem;
  border-left-width: 0;
  padding-left: 0;
  margin-left: 0;
  color: var(--gm-gold);
  background: var(--gm-red);
  border-color: var(--gm-gold);
}

/* ── Head Block ────────────────────────────────────────────── */

.head {
  padding: 0;
  margin-bottom: 0.5rem;
  color: var(--gm-red);
}

.head h1 {
  font-family: var(--font-display);
  text-align: center;
  font-size: 2.25rem;
  margin-bottom: -0.5rem;
}

.head h2 {
  font-family: var(--font-display);
  font-size: 2.5rem;
  margin-bottom: -0.5rem !important;
}

.head h3 {
  font-family: var(--font-display);
  text-align: center;
  font-size: 2.25rem;
  color: var(--gm-blue);
  margin-bottom: -0.5rem;
}

.head h4 {
  font-family: var(--font-display);
  font-size: 2.5rem;
  color: var(--gm-blue);
  margin-bottom: -0.5rem !important;
  color: var(--gm-blue);
}

.head p {
  font-family: var(--font-body);
  font-size: 1.2rem;
  font-style: italic;
}

.head hr {
  opacity: 1.0;
  background: var(--gm-red);
  border-top-color: var(--gm-red);
  border-bottom-color: var(--gm-red);
}

/* ── Info Block ────────────────────────────────────────────── */

.info {
  font-family: var(--font-ui);
  padding: 0.5rem;
  border-radius: 0.25rem;
  background: var(--gm-red);
  color: #fff;
}

.info h1 {
  font-family: var(--font-display);
  font-size: 2.5rem;
  text-align: center;
  margin-bottom: -0.5rem;
}

.info h2 {
  font-family: var(--font-ui);
  font-weight: bold;
  text-transform: uppercase;
  line-height: 1.5;
  margin-bottom: -0.5rem;
  white-space: nowrap;
}

.info h5 {
  font-family: var(--font-ui);
  font-weight: bold;
  text-transform: uppercase;
  line-height: 1.5;
  margin-bottom: -0.5rem;
  white-space: nowrap;
  text-align: center;
}

.info h3 {
  font-family: var(--font-display);
  text-align: center;
  font-size: 1.25rem;
  font-kerning: none;
  margin-top: -0.5rem;
  margin-bottom: -0.5rem;
  color: var(--gm-gold);
  font-variant-ligatures: no-common-ligatures;
}

.info h4 {
  font-family: var(--font-heading);
  font-weight: normal;
  font-size: 1.4rem;
  text-align: center;
}

.info h6 {
  font-family: var(--font-heading);
  font-weight: normal;
  font-size: 1.4rem;
  text-align: left;
}

.info p, .info h2, .info li { font-size: 0.925rem; }

.info em {
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: normal;
}

.info hr {
  opacity: 1.0;
  background: #980000;
  border-top-color: #980000;
  border-bottom-color: #980000;
}

.info .hang { padding-left: 0; text-indent: 0; }

/* ── Note Block ────────────────────────────────────────────── */

.note {
  font-family: var(--font-ui);
  padding: 0.5rem;
  border-radius: 0.25rem;
  background: var(--gm-note-bg);
}

.note h1, .note h2, .note h3, .note h4, .note h5, .note h6 {
  font-family: var(--font-ui);
  text-align: center;
  font-weight: bold;
  line-height: 1.5;
  margin-bottom: -0.5rem;
}

.note h1 { text-transform: uppercase; }

.note p, .note li { font-size: 0.925rem; }

/* ── Rules Block ───────────────────────────────────────────── */

.rules {
  padding: 0.5rem;
  border-radius: 0.25rem;
  background: var(--gm-rules-bg);
}

.rules h1, .rules h2 {
  font-family: var(--font-ui);
  font-weight: bold;
  margin-bottom: -0.5rem;
  line-height: 1.5;
}

.rules h2 { text-align: center; }

.rules p, .rules li,
.rules h3, .rules h4, .rules h5, .rules h6 {
  font-family: var(--font-ui);
}

/* ── Math Block ────────────────────────────────────────────── */

.math {
  padding: 0.5rem;
  background: var(--gm-math-bg);
  border-top: 2px solid var(--gm-math-border);
  border-bottom: 2px solid var(--gm-math-border);
}

.math p, .math h1, .math h2, .math h3, .math h4, .math h5, .math h6 {
  font-family: var(--font-ui);
  font-weight: bold;
  text-align: center;
}

/* ── Item Block ────────────────────────────────────────────── */

.item {
  font-family: var(--font-ui);
}

.item h1, .item h2 {
  font-family: var(--font-ui-condensed);
  text-transform: uppercase;
  font-size: 1.4rem;
  padding-top: 0.1rem;
  font-weight: bold;
}

.item h2 {
  text-align: right;
  float: right;
  margin-top: -1.45rem !important;
}

.item h3 {
  font-family: var(--font-ui-condensed);
  font-weight: bold;
  text-transform: uppercase;
  line-height: 1.5;
  margin-bottom: -0.5rem;
  white-space: nowrap;
}

.item h4, .item h5, .item h6 {
  font-family: var(--font-ui);
  font-weight: bold;
  text-transform: uppercase;
  line-height: 1.5;
  margin-bottom: -0.5rem;
  white-space: nowrap;
}

.item h3 { margin-top: 0.25rem !important; }

.item hr { margin: 0 !important; clear: both; }

.item *+p { margin: 0 !important; }
.item p.hang+p.hang { margin: 0 !important; }
.item p+p { margin-top: 1rem !important; }

/* ── Traits ────────────────────────────────────────────────── */

.traits {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.pf-trait {
  display: inline-block;
  padding: 0.25rem 0.5rem 0.1rem 0.5rem;
  font-family: var(--font-ui-condensed);
  font-weight: bold;
  font-size: 0.8rem;
  line-height: 1;
  text-transform: uppercase;
  text-align: center;
  font-kerning: none;
  background: var(--gm-trait-default);
  color: #fff;
  border: 0.15rem solid var(--gm-trait-border);
  border-right-width: 0.1rem;
  border-left-width: 0.1rem;
}

.pf-trait-edge {
  padding: 0.25rem 0 0.1rem 0;
  min-width: 0;
  overflow: hidden;
  vertical-align: top;
  background-color: var(--gm-trait-edge) !important;
  width: 0px !important;
  display: inline-block !important;
}

.pf-trait-uncommon { background: var(--gm-trait-uncommon); }
.pf-trait-rare { background: var(--gm-trait-rare); }
.pf-trait-unique { background: var(--gm-trait-unique); }
.pf-trait-size { background: var(--gm-trait-size); }
.pf-trait-align { background: var(--gm-trait-align); }
.pf-trait-type { background: var(--gm-trait-type); }

/* ── Sidebars ──────────────────────────────────────────────── */

.left, .right {
  width: 33%;
  color: var(--gm-red);
}

.left h1, .right h1 {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  line-height: 1.2;
}

.left h2, .right h2 {
  font-family: var(--font-ui);
  text-transform: uppercase;
  font-size: 1rem;
  font-weight: bold;
  margin: 0;
  margin-bottom: 0.1rem;
}

.left h3, .right h3 {
  font-family: var(--font-ui-condensed);
  text-transform: uppercase;
  font-size: 1.4rem;
  font-weight: bold;
}

.left h1, .right h1, .left h2, .right h2, .left h3, .right h3 {
  margin-bottom: .1rem;
}

.left {
  float: left;
  padding-right: 0.5rem;
  margin-right: 0.5rem;
  border-right: 1px solid var(--gm-red);
}

.left p, .left h2 { text-align: right; line-height: 1.2; }
.left h1 { text-align: right; }
.left h3 { text-align: right; }
.left li { text-align: right; }

.right {
  float: right;
  padding-left: 0.5rem;
  margin-left: 0.5rem;
  border-left: 1px solid var(--gm-red);
}

.right p, .right h2 { line-height: 1.2; }

.right p, .right ul, .right li, .right ol, .right h2,
.left p, .left ul, .left li, .left ol, .left h2 {
  font-family: var(--font-ui);
}

.right ul, .right ol, .right li, .left ul, .left ol, .left li {
  list-style: none;
  padding: 0;
  line-height: 1.2;
}

.left li, .right li {
  padding-left: 0.5em;
  text-indent: -0.5em;
}

.right h2, .right *+h2, .right h3, .right *+h3,
.left h2, .left *+h2, .left h3, .left *+h3 {
  margin-top: 0 !important;
  padding-top: 0.2em;
}

.right p, .left p { margin-bottom: 0.15rem; }

.right *+p, .right *+ul, .right *+h1,
.left *+p, .left *+ul, .left *+h1 {
  margin-top: 0 !important;
}

.right p+h1, .right p+h3, .left p+h1, .left p+h3,
.right ul+h1, .right ul+h3, .left ul+h1, .left ul+h3 {
  margin-top: 1em !important;
}

/* ── Tables ────────────────────────────────────────────────── */

.page table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
}

.page thead tr th {
  background: var(--gm-table-header);
  color: #fff;
  font-family: var(--font-ui);
  padding: 0.25rem;
  font-size: 0.9rem;
  font-weight: normal;
}

.page tbody tr td {
  font-family: var(--font-ui);
  padding: 0.25rem;
  font-size: 0.9rem;
}

.page tbody tr:nth-child(odd) { background: var(--gm-table-odd); }
.page tbody tr:nth-child(even) { background: var(--gm-table-even); }

.tfoot {
  font-family: var(--font-ui);
  background: var(--gm-table-foot);
  padding: 0.25rem;
  font-size: 0.9rem;
  margin-top: 0 !important;
}

/* ── Hanging Indent ────────────────────────────────────────── */

.hang {
  padding-left: 1em;
  text-indent: -1em;
}

/* ── Print ─────────────────────────────────────────────────── */

@page {
  margin: 0 !important;
  padding: 0 !important;
  size: auto !important;
}

@media print {
  .page-overlay { display: none; }

  a { color: inherit !important; text-decoration: none !important; }

  .page {
    position: relative !important;
    max-width: 210mm !important;
    height: 296.5mm !important;
    border-radius: 0 !important;
    border: 0 !important;
    margin: 0 !important;
    padding-bottom: 0 !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
    page-break-after: always !important;
    justify-content: start;
    align-items: flex-start;
    align-content: flex-start;
  }

  :root { font-size: 10.4pt; }
}
`;
