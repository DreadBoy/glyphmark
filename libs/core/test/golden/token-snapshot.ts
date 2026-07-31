import { tokenize, type Token } from '../../src/parser';

/**
 * Serialize a document's token stream to the text pinned by the token goldens.
 *
 * These fixtures exist to be read by *two* lexers — the TypeScript one and the
 * Kotlin port in the IntelliJ plugin — so the format is deliberately made of
 * nothing but a kind string and integers.
 *
 * No payload text appears. That is the point: two languages cannot disagree
 * about where column 6 is, but they certainly can disagree about what trimming
 * a string means (JavaScript's `trim()` strips U+00A0; `Character.isWhitespace`
 * does not). Pinning offsets keeps the contract on ground both sides share.
 *
 * Per token:
 * - `kind`  — the discriminator
 * - `line`  — 1-based physical line
 * - `span`  — `[startOffset, endOffset)`, absolute in the document, so the
 *   line-offset arithmetic is covered too
 * - every {@link Part} payload as `[start, end)` relative to the token's line
 * - plain scalars (`level`) as they are
 */
export function serializeTokens(input: string): string {
  const lines = tokenize(input).map((tok) => JSON.stringify(entry(tok)));
  return `[\n${lines.map((l) => `  ${l}`).join(',\n')}\n]\n`;
}

function entry(tok: Token): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: tok.kind,
    line: tok.span.startLine,
    span: [tok.span.startOffset, tok.span.endOffset],
  };
  for (const [key, value] of Object.entries(tok)) {
    if (
      key === 'kind' ||
      key === 'id' ||
      key === 'span' ||
      key === 'raw' ||
      key === 'inline'
    )
      continue;
    out[key] = isPart(value) ? [value.start, value.end] : value;
  }
  // Last, and omitted entirely when the line holds no markup, so the common
  // case stays one short line. Each run is
  // [kind, start, end, contentStart, contentEnd].
  if (tok.inline.length > 0) {
    out.inline = tok.inline.map((run) => [
      run.kind,
      run.start,
      run.end,
      run.contentStart,
      run.contentEnd,
    ]);
  }
  return out;
}

function isPart(v: unknown): v is { start: number; end: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { start?: unknown }).start === 'number' &&
    typeof (v as { end?: unknown }).end === 'number'
  );
}
