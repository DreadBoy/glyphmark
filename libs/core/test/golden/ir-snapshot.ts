import type { GlyphDocument, TokenSpan } from '../../src/parser';

/**
 * A node's `origin` with its two {@link TokenId} handles already resolved
 * against the document's `tokenMap`: the start of the first token through the
 * end of the last.
 */
type ResolvedOrigin = TokenSpan | null;

function isOrigin(value: unknown): value is { first: number; last: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { first?: unknown }).first === 'number' &&
    typeof (value as { last?: unknown }).last === 'number'
  );
}

/**
 * Resolve one `Origin` into an absolute span. Returns `null` when either handle
 * is missing from the map — a real defect, and one worth seeing in the snapshot
 * rather than silently smoothing over.
 */
function resolveOrigin(
  origin: { first: number; last: number },
  tokenMap: Map<number, TokenSpan>,
): ResolvedOrigin {
  const first = tokenMap.get(origin.first);
  const last = tokenMap.get(origin.last);
  if (!first || !last) return null;
  return {
    startLine: first.startLine,
    endLine: last.endLine,
    startOffset: first.startOffset,
    endOffset: last.endOffset,
  };
}

/**
 * Deep-copy `value` for snapshotting, rewriting every `origin` into a resolved
 * span and sorting object keys.
 *
 * Token ids are allocation-order artifacts: any change to how the lexer walks
 * the document renumbers them, which would turn every snapshot red for reasons
 * that have nothing to do with the document's meaning. The *spans* are the
 * invariant worth pinning — "this node covers lines 3..7" survives renumbering,
 * and it is also what an IDE annotator will consume.
 *
 * Keys are sorted so a snapshot diff reflects semantics rather than the order
 * the parser happened to assign properties.
 */
function normalize(value: unknown, tokenMap: Map<number, TokenSpan>): unknown {
  if (Array.isArray(value)) return value.map((v) => normalize(v, tokenMap));
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()]
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([k, v]) => [k, normalize(v, tokenMap)]),
    );
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      out[key] =
        key === 'origin' && isOrigin(child)
          ? resolveOrigin(child, tokenMap)
          : normalize(child, tokenMap);
    }
    return out;
  }
  return value;
}

/**
 * Serialize a parsed document to the text pinned by the IR goldens.
 *
 * Deliberately excluded:
 * - `tokenMap` — an index into the token stream, not a property of the document.
 *   Its contents are already reflected wherever an `origin` resolves.
 * - `diagnostics` — nothing consumes them yet and their shape is expected to
 *   change during the lexer refactor, so asserting on them here would produce
 *   churn without protecting anything.
 */
export function serializeIr(doc: GlyphDocument): string {
  const snapshot = {
    customCss: doc.customCss,
    fonts: doc.fonts,
    contentRefs: normalize(doc.contentRefs, doc.tokenMap),
    body: normalize(doc.body, doc.tokenMap),
  };
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
