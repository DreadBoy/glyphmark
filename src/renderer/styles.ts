export const PF2E_CSS = `
:root {
  --pf2e-bg: #f8f4e8;
  --pf2e-text: #1c1b19;
  --pf2e-header-bg: #5d0000;
  --pf2e-header-text: #fff;
  --pf2e-accent: #5d0000;
  --pf2e-separator: #d4c4a0;
  --pf2e-trait-bg: #522e2c;
  --pf2e-trait-text: #fff;
  --pf2e-uncommon: #98542e;
  --pf2e-rare: #002664;
  --pf2e-unique: #54166e;
  --pf2e-font: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
  --pf2e-header-font: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
}

* {
  box-sizing: border-box;
}

body {
  font-family: var(--pf2e-font);
  background: var(--pf2e-bg);
  color: var(--pf2e-text);
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  line-height: 1.5;
  font-size: 10.5pt;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--pf2e-header-font);
  color: var(--pf2e-accent);
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

h1 {
  font-size: 1.8em;
  border-bottom: 2px solid var(--pf2e-accent);
  padding-bottom: 0.2em;
}

h2 {
  font-size: 1.4em;
}

h3 {
  font-size: 1.2em;
}

a {
  color: var(--pf2e-accent);
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

th {
  background: var(--pf2e-header-bg);
  color: var(--pf2e-header-text);
  text-align: left;
  padding: 0.4em 0.8em;
}

td {
  padding: 0.4em 0.8em;
  border-bottom: 1px solid var(--pf2e-separator);
}

tr:nth-child(even) td {
  background: rgba(0,0,0,0.03);
}

blockquote {
  border-left: 3px solid var(--pf2e-accent);
  margin: 1em 0;
  padding: 0.5em 1em;
  background: rgba(93, 0, 0, 0.05);
}

code {
  background: rgba(0,0,0,0.06);
  padding: 0.15em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
}

pre code {
  display: block;
  padding: 1em;
  overflow-x: auto;
}

hr {
  border: none;
  border-top: 2px solid var(--pf2e-separator);
  margin: 2em 0;
}

/* PF2e Block Styles */
.pf2e-block {
  border: 1px solid var(--pf2e-separator);
  border-top: 3px solid var(--pf2e-accent);
  border-bottom: 3px solid var(--pf2e-accent);
  margin: 1.5em 0;
  padding: 0;
  background: rgba(255, 255, 255, 0.5);
}

.pf2e-header {
  background: var(--pf2e-header-bg);
  color: var(--pf2e-header-text);
  padding: 0.4em 0.8em;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pf2e-header .pf2e-name {
  color: var(--pf2e-header-text);
  margin: 0;
  font-size: 1.1em;
}

.pf2e-header .pf2e-level {
  font-size: 0.9em;
  opacity: 0.9;
  white-space: nowrap;
}

/* Traits */
.pf2e-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0.4em 0.8em;
}

.pf2e-trait {
  display: inline-block;
  background: var(--pf2e-trait-bg);
  color: var(--pf2e-trait-text);
  padding: 0.1em 0.5em;
  font-size: 0.8em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid rgba(255,255,255,0.2);
}

.pf2e-trait.rarity-uncommon {
  background: var(--pf2e-uncommon);
}

.pf2e-trait.rarity-rare {
  background: var(--pf2e-rare);
}

.pf2e-trait.rarity-unique {
  background: var(--pf2e-unique);
}

/* Stat lines */
.pf2e-stat-line {
  padding: 0.15em 0.8em;
  line-height: 1.4;
}

.pf2e-separator {
  border-top: 1px solid var(--pf2e-separator);
  margin: 0.3em 0.8em;
}

.pf2e-description {
  padding: 0.4em 0.8em 0.6em;
  line-height: 1.5;
}

.pf2e-ability {
  padding: 0.2em 0.8em;
  line-height: 1.4;
}

.pf2e-inline-traits {
  font-style: italic;
  font-size: 0.9em;
}

/* Action symbols */
.pf2e-action {
  display: inline-flex;
  vertical-align: middle;
  margin: 0 0.1em;
}

.pf2e-action svg {
  vertical-align: middle;
}

/* Print styles */
@media print {
  body {
    max-width: none;
    padding: 0;
    background: white;
  }

  .pf2e-block {
    break-inside: avoid;
  }
}
`;
