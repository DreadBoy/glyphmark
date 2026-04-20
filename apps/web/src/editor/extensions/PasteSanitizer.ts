import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const ALLOWED_TAGS = new Set([
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'li', 'hr', 'br',
  'b', 'strong', 'i', 'em', 's', 'strike', 'del',
  'a', 'span',
  'table', 'tr', 'th', 'td', 'thead', 'tbody', 'tfoot',
  'img',
]);

const DROP_TAGS = new Set(['script', 'style', 'link', 'meta', 'iframe', 'object', 'embed', 'noscript']);

const ALLOWED_CLASSES = new Set([
  'page', 'info', 'rules', 'note', 'math', 'head',
  'left', 'right', 'columns', 'column', 'clear', 'section-divider',
  'item', 'tfoot', 'ordinal', 'pf-trait', 'pf-trait-edge',
  'hang', 'action-img',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'rel']),
  img: new Set(['src', 'alt', 'class']),
  th: new Set(['colspan', 'rowspan', 'class']),
  td: new Set(['colspan', 'rowspan', 'class']),
};

function sanitizeElement(el: Element): Element | null {
  const tag = el.tagName.toLowerCase();
  if (DROP_TAGS.has(tag)) {
    el.remove();
    return null;
  }
  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap: replace with its children.
    const frag = el.ownerDocument!.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    el.replaceWith(frag);
    return null;
  }

  // Filter class attribute to allowed classes.
  const cls = el.getAttribute('class');
  if (cls) {
    const kept = cls.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c));
    if (kept.length) el.setAttribute('class', kept.join(' '));
    else el.removeAttribute('class');
  }

  // Strip inline styles and unknown attributes.
  const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'class') continue;
    if (!allowed.has(attr.name)) el.removeAttribute(attr.name);
  }

  return el;
}

function walk(root: Element) {
  const children = Array.from(root.children);
  for (const child of children) {
    const kept = sanitizeElement(child);
    if (kept) walk(kept);
  }
}

export const PasteSanitizer = Extension.create({
  name: 'pasteSanitizer',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pasteSanitizer'),
        props: {
          transformPastedHTML(html) {
            const doc = new DOMParser().parseFromString(
              `<div>${html}</div>`,
              'text/html',
            );
            const root = doc.body.firstElementChild;
            if (!root) return html;
            walk(root);
            return root.innerHTML;
          },
        },
      }),
    ];
  },
});
