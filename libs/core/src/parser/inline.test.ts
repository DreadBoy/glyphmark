import { describe, it, expect } from 'vitest';
import { parseInline } from './inline';

describe('parseInline', () => {
  it('returns empty for empty input', () => {
    expect(parseInline('')).toEqual([]);
  });

  it('returns plain text', () => {
    expect(parseInline('hello world')).toEqual([
      { kind: 'text', text: 'hello world' },
    ]);
  });

  it('parses bold with **', () => {
    expect(parseInline('**bold**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold' }] },
    ]);
  });

  it('parses bold with __', () => {
    expect(parseInline('__bold__')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold' }] },
    ]);
  });

  it('parses em with *', () => {
    expect(parseInline('*italic*')).toEqual([
      { kind: 'em', children: [{ kind: 'text', text: 'italic' }] },
    ]);
  });

  it('parses em with _', () => {
    expect(parseInline('_italic_')).toEqual([
      { kind: 'em', children: [{ kind: 'text', text: 'italic' }] },
    ]);
  });

  it('mixes bold and plain text', () => {
    expect(parseInline('**Trigger** You are hit.')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Trigger' }] },
      { kind: 'text', text: ' You are hit.' },
    ]);
  });

  it('mixes em and plain text around the bold', () => {
    expect(parseInline('cast *avatar* spell')).toEqual([
      { kind: 'text', text: 'cast ' },
      { kind: 'em', children: [{ kind: 'text', text: 'avatar' }] },
      { kind: 'text', text: ' spell' },
    ]);
  });

  it('handles bold then em', () => {
    expect(parseInline('**Strong** and *italic* mixed')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Strong' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'em', children: [{ kind: 'text', text: 'italic' }] },
      { kind: 'text', text: ' mixed' },
    ]);
  });

  it('treats unbalanced ** as literal text', () => {
    expect(parseInline('**unclosed')).toEqual([
      { kind: 'text', text: '**unclosed' },
    ]);
  });

  it('treats unbalanced * as literal text', () => {
    expect(parseInline('*unclosed')).toEqual([
      { kind: 'text', text: '*unclosed' },
    ]);
  });

  it('treats lone ** as literal', () => {
    expect(parseInline('**')).toEqual([{ kind: 'text', text: '**' }]);
  });

  it('treats empty ** ** as literal (no zero-width strong)', () => {
    expect(parseInline('****')).toEqual([{ kind: 'text', text: '****' }]);
  });

  it('prefers strong over em when ** appears', () => {
    expect(parseInline('**foo**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'foo' }] },
    ]);
  });

  it('does not nest — inner content stays flat text', () => {
    // Arbitrary nesting is unsupported: strong contains literal *inner*, not an
    // em. Combined bold+italic uses the triple form (`***...***`) instead.
    expect(parseInline('**outer *inner* outer**')).toEqual([
      {
        kind: 'strong',
        children: [{ kind: 'text', text: 'outer *inner* outer' }],
      },
    ]);
  });

  it('parses bold+italic with ***', () => {
    expect(parseInline('***bold and italics***')).toEqual([
      {
        kind: 'strong',
        children: [
          {
            kind: 'em',
            children: [{ kind: 'text', text: 'bold and italics' }],
          },
        ],
      },
    ]);
  });

  it('parses bold+italic with ___', () => {
    expect(parseInline('___bold and italics___')).toEqual([
      {
        kind: 'strong',
        children: [
          {
            kind: 'em',
            children: [{ kind: 'text', text: 'bold and italics' }],
          },
        ],
      },
    ]);
  });

  it('binds *** as combined emphasis, not strong-then-em', () => {
    expect(parseInline('***bi*** rest')).toEqual([
      {
        kind: 'strong',
        children: [{ kind: 'em', children: [{ kind: 'text', text: 'bi' }] }],
      },
      { kind: 'text', text: ' rest' },
    ]);
  });

  it('splits a 5-star run so bold can wrap an inner bold+italic span', () => {
    // The valid way to say "bold, then bold+italic, then bold": the `*****`
    // runs split greedily as `**`(close) + `***`(open) and `***`(close) +
    // `**`(open), yielding three adjacent spans.
    expect(parseInline('**bold *****and italics***** and bold**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold ' }] },
      {
        kind: 'strong',
        children: [
          { kind: 'em', children: [{ kind: 'text', text: 'and italics' }] },
        ],
      },
      { kind: 'strong', children: [{ kind: 'text', text: ' and bold' }] },
    ]);
  });

  it('treats a lone 3-star run as literal', () => {
    expect(parseInline('***')).toEqual([{ kind: 'text', text: '***' }]);
  });

  it('treats empty ****** as literal (no zero-width bold+italic)', () => {
    expect(parseInline('******')).toEqual([{ kind: 'text', text: '******' }]);
  });

  it('handles consecutive bold and em without space', () => {
    expect(parseInline('**a***b*')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'a' }] },
      { kind: 'em', children: [{ kind: 'text', text: 'b' }] },
    ]);
  });

  it('preserves non-ascii text', () => {
    expect(parseInline('**Damage** equals level × 2')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Damage' }] },
      { kind: 'text', text: ' equals level × 2' },
    ]);
  });

  it('parses each action symbol as a standalone token', () => {
    for (const sym of [':a:', ':aa:', ':aaa:', ':r:', ':f:'] as const) {
      expect(parseInline(sym)).toEqual([{ kind: 'action', symbol: sym }]);
    }
  });

  it('parses an action symbol inline in body text', () => {
    expect(parseInline('use this symbol: :a:.')).toEqual([
      { kind: 'text', text: 'use this symbol: ' },
      { kind: 'action', symbol: ':a:' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('prefers the longest action token at a position', () => {
    expect(parseInline(':aaa:')).toEqual([{ kind: 'action', symbol: ':aaa:' }]);
    expect(parseInline(':aa:')).toEqual([{ kind: 'action', symbol: ':aa:' }]);
  });

  it('treats unrecognised :x: as literal text', () => {
    expect(parseInline(':b:')).toEqual([{ kind: 'text', text: ':b:' }]);
  });

  it('keeps stray colons as literal text', () => {
    expect(parseInline('ratio 3:1 here')).toEqual([
      { kind: 'text', text: 'ratio 3:1 here' },
    ]);
  });

  it('mixes action symbols with bold and em', () => {
    expect(parseInline('**Cast** *fireball* :aa: at target')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Cast' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'fireball' }] },
      { kind: 'text', text: ' ' },
      { kind: 'action', symbol: ':aa:' },
      { kind: 'text', text: ' at target' },
    ]);
  });

  it('does not support escape syntax — backslash is literal', () => {
    // TODO Add escape support. For now, `\*` does NOT suppress emphasis;
    // the backslash is a regular character and the `*` is still a delimiter.
    expect(parseInline('\\*not bold\\*')).toEqual([
      { kind: 'text', text: '\\' },
      { kind: 'em', children: [{ kind: 'text', text: 'not bold\\' }] },
    ]);
  });

  it('parses superscript with ^', () => {
    expect(parseInline('Herexen^U^')).toEqual([
      { kind: 'text', text: 'Herexen' },
      { kind: 'sup', children: [{ kind: 'text', text: 'U' }] },
    ]);
  });

  it('parses multi-character superscript content', () => {
    expect(parseInline('Treerazer^Uq^')).toEqual([
      { kind: 'text', text: 'Treerazer' },
      { kind: 'sup', children: [{ kind: 'text', text: 'Uq' }] },
    ]);
  });

  it('parses subscript with ~', () => {
    expect(parseInline('~2~')).toEqual([
      { kind: 'sub', children: [{ kind: 'text', text: '2' }] },
    ]);
  });

  it('mixes subscript with surrounding text (H~2~O)', () => {
    expect(parseInline('H~2~O')).toEqual([
      { kind: 'text', text: 'H' },
      { kind: 'sub', children: [{ kind: 'text', text: '2' }] },
      { kind: 'text', text: 'O' },
    ]);
  });

  it('treats unbalanced ^ as literal text', () => {
    expect(parseInline('^unclosed')).toEqual([
      { kind: 'text', text: '^unclosed' },
    ]);
  });

  it('treats a lone ^ as literal', () => {
    expect(parseInline('^')).toEqual([{ kind: 'text', text: '^' }]);
  });

  it('treats empty ^^ as literal (no zero-width superscript)', () => {
    expect(parseInline('^^')).toEqual([{ kind: 'text', text: '^^' }]);
  });

  it('treats unbalanced ~ as literal text', () => {
    expect(parseInline('~unclosed')).toEqual([
      { kind: 'text', text: '~unclosed' },
    ]);
  });

  it('treats empty ~~ as literal (no zero-width subscript)', () => {
    expect(parseInline('~~')).toEqual([{ kind: 'text', text: '~~' }]);
  });

  it('mixes superscript and subscript with bold, em, and action symbols', () => {
    expect(parseInline('**b** ^U^ ~2~ :a:')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'sup', children: [{ kind: 'text', text: 'U' }] },
      { kind: 'text', text: ' ' },
      { kind: 'sub', children: [{ kind: 'text', text: '2' }] },
      { kind: 'text', text: ' ' },
      { kind: 'action', symbol: ':a:' },
    ]);
  });

  it('does not nest — superscript inside bold stays literal', () => {
    // Same no-nesting rule as `*inner*` inside `**bold**`: the inner `^U^`
    // is literal text within the strong, not a nested superscript.
    expect(parseInline('**bold^U^**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold^U^' }] },
    ]);
  });

  it('pairs two stray carets on a line into one superscript', () => {
    // Documented tradeoff of the single-`^` delimiter: like `*`/`_`, two loose
    // carets bind as one span. `^2 y^` becomes a superscript here.
    expect(parseInline('x^2 y^2')).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'sup', children: [{ kind: 'text', text: '2 y' }] },
      { kind: 'text', text: '2' },
    ]);
  });
});
