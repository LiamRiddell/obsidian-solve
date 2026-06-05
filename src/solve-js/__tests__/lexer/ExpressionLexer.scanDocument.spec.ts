import { describe, test, expect } from '@jest/globals';
import { ExpressionLexer } from '@solve-js/lexer/ExpressionLexer';

// ── Helpers ───────────────────────────────────────────────────────────────
function tokenTypes(results: ReturnType<ExpressionLexer['scanDocument']>): string[][] {
  return results.map(r => r.tokens.map(t => t.type));
}

function tokenPairs(results: ReturnType<ExpressionLexer['scanDocument']>): [string, string][][] {
  return results.map(r => r.tokens.map(t => [t.type, t.value] as [string, string]));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ExpressionLexer.scanDocument — basics', () => {
  test('empty document returns empty array', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('');
    expect(results).toEqual([]);
  });

  test('single expression line', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2');
    expect(results.length).toBe(1);
    expect(results[0].classification.type).toBe('expression');
    expect(results[0].classification.skip).toBe(false);
    expect(results[0].lineNumber).toBe(1);
    expect(results[0].text).toBe('1 + 2');
    expect(results[0].startOffset).toBe(0);
    expect(results[0].endOffset).toBe(5);
  });

  test('single heading line is skipped', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('# My Heading');
    expect(results.length).toBe(1);
    expect(results[0].classification.type).toBe('heading');
    expect(results[0].classification.skip).toBe(true);
    expect(results[0].tokens).toEqual([]);
  });

  test('single empty line is skipped', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('');
    expect(results.length).toBe(0);
  });

  test('single whitespace-only line is skipped', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('   ');
    expect(results.length).toBe(1);
    expect(results[0].classification.skip).toBe(true);
    expect(results[0].tokens).toEqual([]);
  });
});

describe('ExpressionLexer.scanDocument — multiple lines', () => {
  test('two expression lines', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2\n3 * 4');
    expect(results.length).toBe(2);
    expect(results[0].lineNumber).toBe(1);
    expect(results[0].classification.skip).toBe(false);
    expect(results[1].lineNumber).toBe(2);
    expect(results[1].classification.skip).toBe(false);

    const types = tokenTypes(results);
    expect(types[0]).toContain('NUMBER');
    expect(types[0]).toContain('PLUS');
    expect(types[1]).toContain('NUMBER');
    expect(types[1]).toContain('STAR');
  });

  test('mixed skip and expression lines', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('# Heading\n1 + 2\n> Blockquote\n3 * 4');

    expect(results.length).toBe(4);
    expect(results[0].classification.skip).toBe(true);  // heading
    expect(results[0].tokens).toEqual([]);
    expect(results[1].classification.skip).toBe(false);  // expression
    expect(results[1].tokens.length).toBeGreaterThan(0);
    expect(results[2].classification.skip).toBe(true);   // blockquote
    expect(results[2].tokens).toEqual([]);
    expect(results[3].classification.skip).toBe(false);  // expression
    expect(results[3].tokens.length).toBeGreaterThan(0);
  });

  test('trailing newline is consumed without producing empty last line', () => {
    const lexer = new ExpressionLexer();
    // Trailing \n does NOT create an extra empty line — it's just a terminator.
    // Same behavior as most text editors: "a\n" is a single-line document.
    const results = lexer.scanDocument('1 + 2\n');

    expect(results.length).toBe(1);
    expect(results[0].text).toBe('1 + 2');
    expect(results[0].classification.skip).toBe(false);
  });

  test('double newline produces empty middle line', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2\n\n3 * 4');

    expect(results.length).toBe(3);
    expect(results[0].text).toBe('1 + 2');
    expect(results[1].text).toBe('');
    expect(results[1].classification.skip).toBe(true);
    expect(results[1].classification.type).toBe('empty');
    expect(results[2].text).toBe('3 * 4');
  });
});

describe('ExpressionLexer.scanDocument — offsets', () => {
  test('offsets are correctly tracked', () => {
    const lexer = new ExpressionLexer();
    // Line 1: "abc" (3 chars) + \n
    // Line 2: "def" (3 chars)
    const results = lexer.scanDocument('abc\ndef');

    expect(results.length).toBe(2);
    expect(results[0].startOffset).toBe(0);
    expect(results[0].endOffset).toBe(3);   // before \n
    expect(results[1].startOffset).toBe(4);  // after \n
    expect(results[1].endOffset).toBe(7);    // end of string
  });

  test('offsets with multiple lines of varying length', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('a\nbb\nccc');

    expect(results[0].startOffset).toBe(0);
    expect(results[0].endOffset).toBe(1);
    expect(results[1].startOffset).toBe(2);
    expect(results[1].endOffset).toBe(4);
    expect(results[2].startOffset).toBe(5);
    expect(results[2].endOffset).toBe(8);
  });
});

describe('ExpressionLexer.scanDocument — line endings', () => {
  test('handles \\r\\n line endings', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2\r\n3 * 4');

    expect(results.length).toBe(2);
    expect(results[0].text).toBe('1 + 2');
    expect(results[0].lineNumber).toBe(1);
    expect(results[1].text).toBe('3 * 4');
    expect(results[1].lineNumber).toBe(2);
    // tokens should be valid for both lines
    expect(results[0].tokens.length).toBeGreaterThan(0);
    expect(results[1].tokens.length).toBeGreaterThan(0);
  });

  test('handles bare \\r line endings', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2\r3 * 4');

    expect(results.length).toBe(2);
    expect(results[0].text).toBe('1 + 2');
    expect(results[1].text).toBe('3 * 4');
  });
});

describe('ExpressionLexer.scanDocument — inline solves', () => {
  test('detects inline solves on expression lines', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('s`2+2`');

    expect(results.length).toBe(1);
    expect(results[0].classification.hasInlineSolve).toBe(true);
    expect(results[0].inlineSolves.length).toBe(1);
    expect(results[0].inlineSolves[0].expression).toBe('2+2');
    expect(results[0].inlineSolves[0].start).toBe(0);
    // end is ONE PAST the closing backtick: s=0, `=1, 2=2, +=3, 2=4, `=5, end=6
    expect(results[0].inlineSolves[0].end).toBe(6);
  });

  test('does not detect inline solves on skipped lines', () => {
    const lexer = new ExpressionLexer();
    // Heading with text containing "s`" — still a heading, should skip
    const results = lexer.scanDocument('# s`test`');

    expect(results[0].classification.skip).toBe(true);
    expect(results[0].classification.hasInlineSolve).toBe(false);
    expect(results[0].inlineSolves).toEqual([]);
  });

  test('multiple inline solves on one line', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('s`2+2` plus s`3*3`');

    expect(results[0].classification.hasInlineSolve).toBe(true);
    expect(results[0].inlineSolves.length).toBe(2);
    expect(results[0].inlineSolves[0].expression).toBe('2+2');
    expect(results[0].inlineSolves[1].expression).toBe('3*3');
  });

  test('inline solves with escaped backticks', () => {
    const lexer = new ExpressionLexer();
    // The \` escape handler in the tokenizer skips \` without closing
    // the span. findInlineSolves() handles escaped backticks at the
    // character level — the expression text preserves the original
    // characters (including the \` pair and surrounding whitespace).
    // Token indices are correct: INLINE_SOLVE_START at 0, BACKTICK_OPEN
    // at the unescaped closing backtick (not the escaped one).
    const results = lexer.scanDocument('s`hello \\` world`');

    expect(results[0].inlineSolves.length).toBe(1);
    expect(results[0].inlineSolves[0].startTokenIndex).toBe(0);
    expect(results[0].inlineSolves[0].endTokenIndex).toBe(3);
    // Expression from findInlineSolves() preserves original text
    expect(results[0].inlineSolves[0].expression).toBe('hello \\` world');
  });
});

describe('ExpressionLexer.scanDocument — inline solve token indices', () => {
  test('single inline solve: startTokenIndex and endTokenIndex are populated', () => {
    const lexer = new ExpressionLexer();
    // Tokens: 0=INLINE_SOLVE_START, 1=NUMBER"2", 2=PLUS, 3=NUMBER"2", 4=BACKTICK_OPEN
    const results = lexer.scanDocument('s`2+2`');

    expect(results[0].inlineSolves.length).toBe(1);
    const span = results[0].inlineSolves[0];
    expect(span.startTokenIndex).toBe(0);  // INLINE_SOLVE_START
    expect(span.endTokenIndex).toBe(4);     // BACKTICK_OPEN
    // Expression tokens are indices [1..4): tokens[1], tokens[2], tokens[3]
    const exprTokens = results[0].tokens.slice(
      span.startTokenIndex! + 1,
      span.endTokenIndex!,
    );
    expect(exprTokens.map(t => t.value).join('')).toBe('2+2');
  });

  test('multiple inline solves: each span has correct token indices', () => {
    const lexer = new ExpressionLexer();
    // Tokens: 0=INLINE_SOLVE_START, 1=NUM"2", 2=PLUS, 3=NUM"2", 4=BACKTICK_OPEN,
    //         5=IDENT"plus", 6=INLINE_SOLVE_START, 7=NUM"3", 8=STAR, 9=NUM"3", 10=BACKTICK_OPEN
    const results = lexer.scanDocument('s`2+2` plus s`3*3`');

    expect(results[0].inlineSolves.length).toBe(2);

    // First span
    expect(results[0].inlineSolves[0].startTokenIndex).toBe(0);
    expect(results[0].inlineSolves[0].endTokenIndex).toBe(4);
    expect(results[0].inlineSolves[0].expression).toBe('2+2');

    // Second span
    expect(results[0].inlineSolves[1].startTokenIndex).toBe(6);
    expect(results[0].inlineSolves[1].endTokenIndex).toBe(10);
    expect(results[0].inlineSolves[1].expression).toBe('3*3');
  });

  test('inline solve mid-line: token indices offset by preceding tokens', () => {
    const lexer = new ExpressionLexer();
    // Tokens: 0=IDENT"prefix", 1=INLINE_SOLVE_START, 2=NUM"2", 3=PLUS, 4=NUM"2",
    //         5=BACKTICK_OPEN, 6=IDENT"suffix"
    const results = lexer.scanDocument('prefix s`2+2` suffix');

    expect(results[0].inlineSolves.length).toBe(1);
    const span = results[0].inlineSolves[0];
    expect(span.startTokenIndex).toBe(1);  // after "prefix"
    expect(span.endTokenIndex).toBe(5);     // before "suffix"
    expect(span.expression).toBe('2+2');
  });

  test('line without inline solves: no spans, no stale token indices', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2');

    expect(results[0].classification.hasInlineSolve).toBe(false);
    expect(results[0].inlineSolves).toEqual([]);
  });

  test('inline solve with unit expression: token indices are correct', () => {
    const lexer = new ExpressionLexer();
    // Tokens: 0=INLINE_SOLVE_START, 1=NUM"5", 2=UNIT"km", 3=BACKTICK_OPEN
    const results = lexer.scanDocument('s`5km`');

    expect(results[0].inlineSolves.length).toBe(1);
    const span = results[0].inlineSolves[0];
    expect(span.startTokenIndex).toBe(0);
    expect(span.endTokenIndex).toBe(3);
    expect(span.expression).toBe('5km');

    // Verify token indices reconstruct correctly
    const exprTokens = results[0].tokens.slice(
      span.startTokenIndex! + 1,
      span.endTokenIndex!,
    );
    expect(exprTokens.map(t => t.value).join('')).toBe('5km');
  });

  test('inline solve on multi-line document: indices are per-line', () => {
    const lexer = new ExpressionLexer();
    // Line 1: s`a+b` — tokens: 0=INLINE_SOLVE_START, 1=IDENT"a", 2=PLUS, 3=IDENT"b", 4=BACKTICK_OPEN
    // Line 2: s`x*y` — tokens: 0=INLINE_SOLVE_START, 1=IDENT"x", 2=STAR, 3=IDENT"y", 4=BACKTICK_OPEN
    const results = lexer.scanDocument('s`a+b`\ns`x*y`');

    expect(results.length).toBe(2);

    // Line 1 span
    expect(results[0].inlineSolves.length).toBe(1);
    expect(results[0].inlineSolves[0].startTokenIndex).toBe(0);
    expect(results[0].inlineSolves[0].endTokenIndex).toBe(4);
    expect(results[0].inlineSolves[0].expression).toBe('a+b');

    // Line 2 span — indices should reset to 0 for the new line
    expect(results[1].inlineSolves.length).toBe(1);
    expect(results[1].inlineSolves[0].startTokenIndex).toBe(0);
    expect(results[1].inlineSolves[0].endTokenIndex).toBe(4);
    expect(results[1].inlineSolves[0].expression).toBe('x*y');
  });

  test('hasInlineSolve is consistent with span presence', () => {
    const lexer = new ExpressionLexer();

    // Line with inline solve
    const r1 = lexer.scanDocument('s`2+2`');
    expect(r1[0].classification.hasInlineSolve).toBe(true);
    expect(r1[0].inlineSolves.length).toBeGreaterThan(0);

    // Line without inline solve
    const r2 = lexer.scanDocument('2 + 2');
    expect(r2[0].classification.hasInlineSolve).toBe(false);
    expect(r2[0].inlineSolves).toEqual([]);
  });

  test('token indices are -1 on skipped lines (not tokenized)', () => {
    const lexer = new ExpressionLexer();
    // s` inside a heading is still skipped and not tokenized
    // findInlineSolves runs but inline collector doesn't
    const results = lexer.scanDocument('# s`test`');

    expect(results[0].classification.skip).toBe(true);
    expect(results[0].classification.hasInlineSolve).toBe(false);
    expect(results[0].inlineSolves).toEqual([]);
  });

  test('expression line with s` at col > 0: startTokenIndex derived from token position', () => {
    const lexer = new ExpressionLexer();
    // "x = s`5`; y" tokens: 0=IDENT"x", 1=EQUALS, 2=INLINE_SOLVE_START,
    //   3=NUM"5", 4=BACKTICK_OPEN, 5=SEMICOLON, 6=IDENT"y"
    const results = lexer.scanDocument('x = s`5`; y');

    expect(results[0].inlineSolves.length).toBe(1);
    const span = results[0].inlineSolves[0];
    expect(span.startTokenIndex).toBe(2);
    expect(span.endTokenIndex).toBe(4);
    expect(span.expression).toBe('5');

    // Expression is just the NUMBER "5" at token index 3
    const exprToken = results[0].tokens[span.startTokenIndex! + 1];
    expect(exprToken.type).toBe('NUMBER');
    expect(exprToken.value).toBe('5');
  });
});

describe('ExpressionLexer.scanDocument — tokenization correctness', () => {
  test('tokens match standalone tokenizeAll for simple expression', () => {
    const lexer1 = new ExpressionLexer();
    lexer1.reset('1 + 2');
    const expected = lexer1.tokenizeAll();

    const lexer2 = new ExpressionLexer();
    const results = lexer2.scanDocument('1 + 2');
    const actual = results[0].tokens;

    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].type).toBe(expected[i].type);
      expect(actual[i].value).toBe(expected[i].value);
    }
  });

  test('tokens match standalone tokenizeAll for complex expression', () => {
    const lexer1 = new ExpressionLexer();
    lexer1.reset('1 + 2 * (3 / 4) ^ 5');
    const expected = lexer1.tokenizeAll();

    const lexer2 = new ExpressionLexer();
    const results = lexer2.scanDocument('1 + 2 * (3 / 4) ^ 5');
    const actual = results[0].tokens;

    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].type).toBe(expected[i].type);
      expect(actual[i].value).toBe(expected[i].value);
    }
  });

  test('each expression line produces correct tokens', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2\n3 * 4\n:myVar = 5 + 6');

    expect(results.length).toBe(3);

    // Line 1: 1 + 2
    const line1Types = results[0].tokens.map(t => t.type);
    expect(line1Types).toContain('NUMBER');
    expect(line1Types).toContain('PLUS');
    expect(line1Types).toContain('NUMBER');

    // Line 2: 3 * 4
    const line2Types = results[1].tokens.map(t => t.type);
    expect(line2Types).toContain('NUMBER');
    expect(line2Types).toContain('STAR');
    expect(line2Types).toContain('NUMBER');

    // Line 3: :myVar = 5 + 6
    const line3Types = results[2].tokens.map(t => t.type);
    expect(line3Types).toContain('COLON');
    expect(line3Types).toContain('IDENT');
    expect(line3Types).toContain('EQUALS');
    expect(line3Types).toContain('NUMBER');
    expect(line3Types).toContain('PLUS');
  });
});

describe('ExpressionLexer.scanDocument — classification accuracy', () => {
  test('classifies all markdown structural types correctly', () => {
    const lexer = new ExpressionLexer();
    const doc = [
      '# Heading 1',
      '## Heading 2',
      '> Blockquote',
      '- Unordered list',
      '1. Ordered list',
      '```code fence',
      '$$math fence',
      '---',
      '[[wikilink]]',
      '![[embed]]',
      '|---|',             // table separator (only |,-,:,whitespace chars)
      '// comment',
      'normal expression',
    ].join('\n');

    const results = lexer.scanDocument(doc);

    expect(results[0].classification.type).toBe('heading');
    expect(results[1].classification.type).toBe('heading');
    expect(results[2].classification.type).toBe('blockquote');
    expect(results[3].classification.type).toBe('list');
    expect(results[4].classification.type).toBe('list');
    expect(results[5].classification.type).toBe('code_fence');
    expect(results[6].classification.type).toBe('math_fence');
    expect(results[7].classification.type).toBe('hr');
    expect(results[8].classification.type).toBe('wikilink');
    expect(results[9].classification.type).toBe('wikilink');
    expect(results[10].classification.type).toBe('table_separator');
    expect(results[11].classification.type).toBe('comment');
    expect(results[12].classification.type).toBe('expression');
  });

  test('only non-skippable lines have tokens', () => {
    const lexer = new ExpressionLexer();
    const doc = '# Heading\n1 + 2\n> Quote\n3 * 4';
    const results = lexer.scanDocument(doc);

    // Skipped lines: heading, blockquote
    expect(results[0].tokens).toEqual([]);
    expect(results[2].tokens).toEqual([]);

    // Expression lines have tokens
    expect(results[1].tokens.length).toBeGreaterThan(0);
    expect(results[3].tokens.length).toBeGreaterThan(0);
  });
});

describe('ExpressionLexer.scanDocument — large documents', () => {
  test('handles 100 mixed lines without error', () => {
    const lexer = new ExpressionLexer();
    const lines: string[] = [];
    for (let i = 1; i <= 100; i++) {
      if (i % 4 === 0) lines.push(`# Heading ${i}`);
      else if (i % 4 === 1) lines.push('> Quote');
      else if (i % 4 === 2) lines.push(`${i} + ${i * 2}`);
      else lines.push('');
    }
    const results = lexer.scanDocument(lines.join('\n'));

    expect(results.length).toBe(100);
    // Verify expression lines have correct tokens
    for (let i = 0; i < 100; i++) {
      if (lines[i].startsWith('#')) {
        expect(results[i].classification.skip).toBe(true);
      } else if (lines[i] === '') {
        expect(results[i].classification.type).toBe('empty');
      } else if (lines[i].startsWith('>')) {
        expect(results[i].classification.skip).toBe(true);
      } else {
        expect(results[i].classification.skip).toBe(false);
        expect(results[i].tokens.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('ExpressionLexer.scanDocument — token coordinates', () => {
  test('single line: correct offset, line, col for simple expression', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2');
    expect(results.length).toBe(1);
    const tokens = results[0].tokens;
    expect(tokens.length).toBe(3);

    // Token 0: '1'
    expect(tokens[0].type).toBe('NUMBER');
    expect(tokens[0].value).toBe('1');
    expect(tokens[0].offset).toBe(0);
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].col).toBe(1);

    // Token 1: '+'
    expect(tokens[1].type).toBe('PLUS');
    expect(tokens[1].offset).toBe(2);
    expect(tokens[1].line).toBe(1);
    expect(tokens[1].col).toBe(3);

    // Token 2: '2'
    expect(tokens[2].type).toBe('NUMBER');
    expect(tokens[2].value).toBe('2');
    expect(tokens[2].offset).toBe(4);
    expect(tokens[2].line).toBe(1);
    expect(tokens[2].col).toBe(5);
  });

  test('multi-line: offsets span across document, cols are per-line', () => {
    // Line 1: "abc" (3 chars) + \n
    // Line 2: "def" (3 chars)
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('abc\ndef');
    expect(results.length).toBe(2);

    // Line 1 tokens
    const t0 = results[0].tokens;
    expect(t0.length).toBeGreaterThanOrEqual(1);
    expect(t0[0].value).toBe('abc');
    expect(t0[0].offset).toBe(0);
    expect(t0[0].line).toBe(1);
    expect(t0[0].col).toBe(1);

    // Line 2 tokens
    const t1 = results[1].tokens;
    expect(t1.length).toBeGreaterThanOrEqual(1);
    expect(t1[0].value).toBe('def');
    expect(t1[0].offset).toBe(4);  // after "abc\n"
    expect(t1[0].line).toBe(2);
    expect(t1[0].col).toBe(1);
  });

  test('multi-line expression: offsets increase, cols reset per line', () => {
    const lexer = new ExpressionLexer();
    // Line 1: "1 + 2" (5 chars)
    // Line 2: "3 * 4" (5 chars)
    const results = lexer.scanDocument('1 + 2\n3 * 4');
    expect(results.length).toBe(2);

    // ── Line 1 ──
    const l1 = results[0].tokens;
    expect(l1[0].type).toBe('NUMBER');
    expect(l1[0].offset).toBe(0);
    expect(l1[0].line).toBe(1);
    expect(l1[0].col).toBe(1);

    expect(l1[1].type).toBe('PLUS');
    expect(l1[1].offset).toBe(2);
    expect(l1[1].line).toBe(1);
    expect(l1[1].col).toBe(3);

    expect(l1[2].offset).toBe(4);
    expect(l1[2].line).toBe(1);
    expect(l1[2].col).toBe(5);

    // ── Line 2 ──
    const l2 = results[1].tokens;
    expect(l2[0].type).toBe('NUMBER');
    expect(l2[0].offset).toBe(6);  // after "1 + 2\n"
    expect(l2[0].line).toBe(2);
    expect(l2[0].col).toBe(1);

    expect(l2[1].type).toBe('STAR');
    expect(l2[1].offset).toBe(8);
    expect(l2[1].line).toBe(2);
    expect(l2[1].col).toBe(3);

    expect(l2[2].offset).toBe(10);
    expect(l2[2].line).toBe(2);
    expect(l2[2].col).toBe(5);
  });

  test('coordinates with mixed skip and expression lines', () => {
    const lexer = new ExpressionLexer();
    // Line 1: heading → skip, no tokens
    // Line 2: "x = 5" → expression
    // Line 3: blockquote → skip, no tokens
    // Line 4: "y + 3" → expression
    const results = lexer.scanDocument('# Title\nx = 5\n> Quote\ny + 3');
    expect(results.length).toBe(4);

    // Line 1: skipped
    expect(results[0].classification.skip).toBe(true);
    expect(results[0].tokens).toEqual([]);

    // Line 2: x = 5
    const l2 = results[1].tokens;
    expect(l2.length).toBeGreaterThanOrEqual(3);
    expect(l2[0].value).toBe('x');
    expect(l2[0].offset).toBe(results[1].startOffset);
    expect(l2[0].line).toBe(2);
    expect(l2[0].col).toBe(1);

    // Line 3: skipped
    expect(results[2].classification.skip).toBe(true);

    // Line 4: y + 3
    const l4 = results[3].tokens;
    expect(l4.length).toBeGreaterThanOrEqual(3);
    expect(l4[0].value).toBe('y');
    expect(l4[0].line).toBe(4);
    expect(l4[0].col).toBe(1);
    // offset should be past all prior lines
    expect(l4[0].offset).toBe(results[3].startOffset);
    expect(l4[0].offset).toBeGreaterThan(results[1].startOffset);
  });

  test('offset and line match ScanLineResult.startOffset and lineNumber', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('first\nsecond\nthird');
    expect(results.length).toBe(3);

    for (const scanResult of results) {
      if (scanResult.classification.skip) continue;
      expect(scanResult.tokens.length).toBeGreaterThan(0);
      for (const token of scanResult.tokens) {
        expect(token.line).toBe(scanResult.lineNumber);
        // offset is within [startOffset, endOffset)
        expect(token.offset).toBeGreaterThanOrEqual(scanResult.startOffset);
        expect(token.offset).toBeLessThan(scanResult.endOffset);
      }
    }
  });

  test('col resets to 1 on each new line', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('a\nbb\nccc');
    expect(results.length).toBe(3);

    // Line 1: col should be 1
    expect(results[0].tokens[0].col).toBe(1);
    // Line 2: col should be 1
    expect(results[1].tokens[0].col).toBe(1);
    // Line 3: col should be 1
    expect(results[2].tokens[0].col).toBe(1);
  });

  test('identifiers with multiple characters have correct offset range', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('myVar + anotherVar');
    expect(results.length).toBe(1);
    const tokens = results[0].tokens;

    // myVar
    expect(tokens[0].type).toBe('IDENT');
    expect(tokens[0].value).toBe('myVar');
    expect(tokens[0].offset).toBe(0);
    expect(tokens[0].col).toBe(1);

    // '+'
    expect(tokens[1].type).toBe('PLUS');
    expect(tokens[1].offset).toBe(6);
    expect(tokens[1].col).toBe(7);

    // anotherVar
    expect(tokens[2].type).toBe('IDENT');
    expect(tokens[2].value).toBe('anotherVar');
    expect(tokens[2].offset).toBe(8);
    expect(tokens[2].col).toBe(9);
  });

  test('numbers with scientific notation have correct col tracking', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1.5e10 + 2e5');
    const tokens = results[0].tokens;

    // 1.5e10
    expect(tokens[0].type).toBe('NUMBER');
    expect(tokens[0].offset).toBe(0);
    expect(tokens[0].col).toBe(1);

    // '+'
    expect(tokens[1].type).toBe('PLUS');
    expect(tokens[1].offset).toBe(7);
    expect(tokens[1].col).toBe(8);

    // 2e5
    expect(tokens[2].type).toBe('NUMBER');
    expect(tokens[2].value).toBe('2e5');
    expect(tokens[2].offset).toBe(9);
    expect(tokens[2].col).toBe(10);
  });

  test('lineBreaks is 0 for all scanDocument tokens (single-line tokens)', () => {
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('1 + 2\n3 * 4\n5 - 6');
    for (const scanResult of results) {
      for (const token of scanResult.tokens) {
        // scanDocument tokenizes per-line, so tokens never span newlines
        expect(token.lineBreaks).toBe(0);
      }
    }
  });

  test('CRLF line endings: offsets shift by 2 per boundary instead of 1', () => {
    // \r\n is 2 chars, so line 2 starts at offset 3 (1-char 'a' + 2-char \r\n)
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('a\r\nb');
    expect(results.length).toBe(2);

    // Line 1 token
    expect(results[0].tokens[0].offset).toBe(0);
    expect(results[0].tokens[0].line).toBe(1);
    expect(results[0].tokens[0].col).toBe(1);

    // Line 2 token — offset should be 3 (not 2), since \r\n consumed 2 chars
    expect(results[1].tokens[0].value).toBe('b');
    expect(results[1].tokens[0].offset).toBe(3);
    expect(results[1].tokens[0].line).toBe(2);
    expect(results[1].tokens[0].col).toBe(1);
  });

  test('empty line between expressions: offsets skip past empty-line newline', () => {
    // "a\n\nb" — line 1: 'a', line 2: empty, line 3: 'b'
    // Offsets: a=0, \n=1, \n=2, b=3
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('a\n\nb');
    expect(results.length).toBe(3);

    // Line 1
    expect(results[0].classification.skip).toBe(false);
    expect(results[0].tokens[0].offset).toBe(0);
    expect(results[0].tokens[0].line).toBe(1);
    expect(results[0].tokens[0].col).toBe(1);

    // Line 2: empty, skipped
    expect(results[1].classification.skip).toBe(true);
    expect(results[1].classification.type).toBe('empty');
    expect(results[1].tokens).toEqual([]);

    // Line 3: should still have correct offset despite empty middle line
    expect(results[2].classification.skip).toBe(false);
    expect(results[2].tokens[0].value).toBe('b');
    expect(results[2].tokens[0].offset).toBe(3);  // a(0) + \n(1) + \n(2)
    expect(results[2].tokens[0].line).toBe(3);
    expect(results[2].tokens[0].col).toBe(1);
  });

  test('CRLF empty line between expressions: offset accounts for 2-char newlines', () => {
    // "a\r\n\r\nb" — line 1: 'a', line 2: empty, line 3: 'b'
    // Offset: a=0, \r\n=1-2, \r\n=3-4, b=5
    const lexer = new ExpressionLexer();
    const results = lexer.scanDocument('a\r\n\r\nb');
    expect(results.length).toBe(3);

    expect(results[0].tokens[0].offset).toBe(0);
    expect(results[0].tokens[0].line).toBe(1);

    expect(results[1].classification.skip).toBe(true);
    expect(results[1].classification.type).toBe('empty');

    expect(results[2].tokens[0].value).toBe('b');
    expect(results[2].tokens[0].offset).toBe(5);  // a(0) + \r\n(1-2) + \r\n(3-4)
    expect(results[2].tokens[0].line).toBe(3);
    expect(results[2].tokens[0].col).toBe(1);
  });
});

describe('ExpressionLexer.scanDocument — lexer reuse', () => {
  test('scanDocument can be called multiple times on same lexer', () => {
    const lexer = new ExpressionLexer();

    const r1 = lexer.scanDocument('1 + 2');
    expect(r1.length).toBe(1);
    expect(r1[0].tokens.length).toBeGreaterThan(0);

    const r2 = lexer.scanDocument('3 * 4\n5 - 6');
    expect(r2.length).toBe(2);
    expect(r2[0].tokens.length).toBeGreaterThan(0);
    expect(r2[1].tokens.length).toBeGreaterThan(0);
  });

  test('scanDocument does not interfere with subsequent tokenizeAll', () => {
    const lexer = new ExpressionLexer();
    lexer.scanDocument('1 + 2\n3 * 4');
    lexer.reset('5 + 6');
    const tokens = lexer.tokenizeAll();
    expect(tokens.length).toBe(3); // 5, +, 6
    expect(tokens[0].value).toBe('5');
    expect(tokens[1].type).toBe('PLUS');
    expect(tokens[2].value).toBe('6');
  });

  test('scanDocument does not interfere with subsequent classifyLine', () => {
    const lexer = new ExpressionLexer();
    lexer.scanDocument('# Heading\n1 + 2');

    const c1 = lexer.classifyLine('# New Heading');
    expect(c1.skip).toBe(true);

    const c2 = lexer.classifyLine('10 + 20');
    expect(c2.skip).toBe(false);
  });
});
