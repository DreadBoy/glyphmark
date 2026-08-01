import { describe, expect, it } from 'vitest';
import {
  createAnchorFn,
  lineToOffset,
  offsetToLine,
  startOf,
  type SourceAnchor,
  END_LINE_ATTR,
  LINE_ATTR,
} from './source-anchors';
import type { TokenId, TokenSpan } from '../parser';

function span(startLine: number, endLine: number): TokenSpan {
  return { startLine, endLine, startOffset: 0, endOffset: 0 };
}

describe('createAnchorFn', () => {
  const map = new Map<TokenId, TokenSpan>([
    [1, span(3, 3)],
    [2, span(7, 9)],
  ]);

  it('resolves an origin to its first token start and last token end', () => {
    expect(createAnchorFn(map)({ first: 1, last: 2 })).toEqual({
      [LINE_ATTR]: 3,
      [END_LINE_ATTR]: 9,
    });
  });

  it('never reports an end line before the start line', () => {
    // Defensive: a malformed origin whose "last" token precedes its "first"
    // would otherwise produce a negative span and break interpolation.
    expect(createAnchorFn(map)({ first: 2, last: 1 })).toEqual({
      [LINE_ATTR]: 7,
      [END_LINE_ATTR]: 7,
    });
  });

  it('yields nothing for an unresolvable origin', () => {
    expect(createAnchorFn(map)(undefined)).toBeUndefined();
    expect(createAnchorFn(map)({ first: 99, last: 99 })).toBeUndefined();
  });

  it('narrows to the opening line via startOf', () => {
    // What an item block's header uses: the block spans lines 3..9, but the
    // header is one strip of text sitting on line 3.
    expect(createAnchorFn(map)(startOf({ first: 1, last: 2 }))).toEqual({
      [LINE_ATTR]: 3,
      [END_LINE_ATTR]: 3,
    });
  });
});

// A one-column stretch of document: three blocks, the middle one spanning
// several source lines so interpolation has something to bite on.
const ANCHORS: SourceAnchor[] = [
  { line: 1, endLine: 1, top: 0, bottom: 20 },
  { line: 5, endLine: 14, top: 20, bottom: 120 },
  { line: 20, endLine: 20, top: 120, bottom: 140 },
];

describe('lineToOffset', () => {
  it('returns the top of the element a line starts', () => {
    expect(lineToOffset(ANCHORS, 5)).toBe(20);
    expect(lineToOffset(ANCHORS, 20)).toBe(120);
  });

  it('interpolates within a multi-line element', () => {
    // Line 10 is 5 lines into a 10-line span, so halfway down a 100px box.
    expect(lineToOffset(ANCHORS, 10)).toBe(70);
  });

  it('holds a line inside a gap at the preceding element', () => {
    // Lines 15..19 are anchored to nothing (blank lines, comments); the last
    // anchor at or before them is the one that should stay on screen.
    expect(lineToOffset(ANCHORS, 17)).toBe(120);
  });

  it('clamps a line before the first anchor to the top of it', () => {
    // A document opening with blank lines or a comment has content above
    // anything anchorable; a reader at line 1 of it wants the top of the
    // preview, not a request that silently does nothing.
    expect(
      lineToOffset([{ line: 4, endLine: 4, top: 12, bottom: 30 }], 2),
    ).toBe(12);
  });

  it('returns null only when nothing is anchored', () => {
    expect(lineToOffset([], 1)).toBe(null);
  });
});

describe('offsetToLine', () => {
  it('reports the line of the element filling the viewport top', () => {
    expect(offsetToLine(ANCHORS, 0)).toBe(1);
    expect(offsetToLine(ANCHORS, 20)).toBe(5);
  });

  it('interpolates within a multi-line element', () => {
    expect(offsetToLine(ANCHORS, 70)).toBe(10);
  });

  it('prefers the earlier source line when elements share a top', () => {
    // Two columns side by side: same `top`, and the reader is looking at the
    // one that comes first in the document.
    const columns: SourceAnchor[] = [
      { line: 40, endLine: 40, top: 0, bottom: 50 },
      { line: 10, endLine: 10, top: 0, bottom: 50 },
    ];
    expect(offsetToLine(columns, 0)).toBe(10);
  });

  it('reports the last known line past the end of the document', () => {
    expect(offsetToLine(ANCHORS, 9999)).toBe(20);
  });

  it('returns null when nothing is anchored', () => {
    expect(offsetToLine([], 0)).toBe(null);
  });
});
