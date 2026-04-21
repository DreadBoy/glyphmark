import type { Editor } from '@tiptap/core';
import type { Mark, Node } from '@tiptap/pm/model';

/**
 * Like `editor.getJSON()`, but omits every attr that still holds its
 * schema-declared default. Everything downstream (save, export, test
 * compare) then sees the same compact JSON shape — no
 * `{class: null, pageNumbers: false, colspan: 1}` noise leaking out of
 * TipTap's native serializer.
 *
 * Safe to round-trip: `setContent(canonicalize(editor))` restores the
 * full doc because ProseMirror fills defaults back in on parse.
 */

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [k: string]: JSONValue };

type AttrsSpec = Record<string, { default?: JSONValue }>;

function stripDefaults(
  attrs: Record<string, JSONValue>,
  spec: AttrsSpec | undefined,
): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    // Explicit null/undefined are always noise.
    if (value === null || value === undefined) continue;
    const def = spec?.[key]?.default;
    // Only strip when value matches default AND the default is one of
    // the "empty-state" sentinels. Non-trivial defaults (e.g.
    // heading.level = 1, listItem.nesting = 0) are load-bearing even
    // when they happen to match, so we keep them.
    const isEmptyDefault =
      def === null || def === undefined || def === false;
    if (isEmptyDefault && value === def) continue;
    // Table colspan/rowspan have a numeric default of 1 but that's
    // specifically a "no span override" sentinel; keep them in sync
    // with handcrafted goldens.
    if ((key === 'colspan' || key === 'rowspan') && value === 1) continue;
    out[key] = value;
  }
  return out;
}

function markToJSON(mark: Mark): JSONValue {
  const attrs = stripDefaults(
    mark.attrs as Record<string, JSONValue>,
    mark.type.spec.attrs as AttrsSpec | undefined,
  );
  const out: Record<string, JSONValue> = { type: mark.type.name };
  if (Object.keys(attrs).length) out.attrs = attrs;
  return out;
}

function nodeToJSON(node: Node): JSONValue {
  const out: Record<string, JSONValue> = { type: node.type.name };
  const attrs = stripDefaults(
    node.attrs as Record<string, JSONValue>,
    node.type.spec.attrs as AttrsSpec | undefined,
  );
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (node.marks.length) out.marks = node.marks.map(markToJSON);
  if (node.isText && node.text !== undefined) {
    // Browsers convert trailing typed spaces to U+00A0 (NBSP) in
    // contenteditable to keep them from collapsing; the serializer
    // reads them back as NBSP. Normalize to regular space so the
    // persisted/compared JSON matches what the user actually typed.
    out.text = node.text.replace(/\u00a0/g, ' ');
  } else if (node.childCount > 0) {
    const children: JSONValue[] = [];
    node.content.forEach((child) => children.push(nodeToJSON(child)));
    out.content = children;
  }
  return out;
}

export function getCanonicalJSON(editor: Editor): JSONValue {
  return nodeToJSON(editor.state.doc);
}
