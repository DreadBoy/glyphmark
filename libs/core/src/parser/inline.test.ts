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
    // TODO Add support for nested inline modifiers
    // strong contains literal *foo*, not an em
    expect(parseInline('**outer *inner* outer**')).toEqual([
      {
        kind: 'strong',
        children: [{ kind: 'text', text: 'outer *inner* outer' }],
      },
    ]);
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

  it('does not support escape syntax — backslash is literal', () => {
    // TODO Add escape support. For now, `\*` does NOT suppress emphasis;
    // the backslash is a regular character and the `*` is still a delimiter.
    expect(parseInline('\\*not bold\\*')).toEqual([
      { kind: 'text', text: '\\' },
      { kind: 'em', children: [{ kind: 'text', text: 'not bold\\' }] },
    ]);
  });
});
