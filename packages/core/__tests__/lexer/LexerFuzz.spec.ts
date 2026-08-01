import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";

interface FuzzCase {
  input: string;
  description: string;
}

function generateFuzzCases(): FuzzCase[] {
  const cases: FuzzCase[] = [];

  // Category 1: Valid expressions (hand-written edge cases)
  const validInputs = [
    "42",
    "1 + 2",
    "3 * 4",
    "(1 + 2) * 3",
    "pi + e",
    "0xFF",
    "0b1010",
    "0b1111",
    "sin(0)",
    "sqrt(4)",
    "vec2(1, 2)",
    "100 cm to m",
    "now + 3 days",
    "next monday",
    "last friday",
    "4d6",
    "roll 3d8",
    "50% of 200",
    "increase 100 by 10%",
    "decrease 100 by 10%",
    "25% of 80 + 10",
    '"hello world"',
    "1 + 2 * 3 ^ 4",
    "convert 100 cm to m",
    "to the power of",
    "times by 3",
    "divide by 2",
    "increase by 5",
    "decrease by 3",
    "# this is a comment",
    "// another comment",
    "s`1+2`",
    "a + b",
    "1 << 2",
    "1 >> 3",
    "1 & 2",
    "1 | 2",
    "~1",
    "1e10",
    "1.5E-3",
    "1 + ",
    "(3 +",
    "func(",
    "100n",
    "1 == 2",
    "1 != 3",
    "1 < 2",
    "1 <= 2",
    ":var = 42",
    "",
    "   ",
    "\t",
    "1 + 2 - 3 * 4 / 5 % 6 ^ 7",
    "abs(-5)",
    "ceil(4.2)",
    "floor(4.8)",
    "round(3.5)",
    "min(1, 2)",
    "max(5, 3)",
    "random()",
    "log10(100)",
    "log2(8)",
    "exp(1)",
    "pow(2, 3)",
    "sign(-10)",
    "trunc(4.7)",
    "hypot(3, 4)",
    "1 plus 2",
    "1 and 2",
    "1 minus 3",
    "between 1 and 10",
    "from 1 to 5",
  ];

  for (const input of validInputs) {
    cases.push({ input, description: `valid: ${input.substring(0, 40)}` });
  }

  // Category 2: Unicode math symbols
  const unicodeInputs = [
    "3 × 4",
    "6 ÷ 2",
    "5 ≠ 3",
  ];
  for (const input of unicodeInputs) {
    cases.push({ input, description: `unicode: ${input}` });
  }

  // Category 3: Binary and hex numbers
  const binaryHexInputs = [
    "0b0",
    "0B0",
    "0b1",
    "0B1",
    "0b10101010",
    "0B11110000",
    "0xFF",
    "0xff",
    "0xDEADBEEF",
    "0x0",
    "0xABCDEF",
  ];
  for (const input of binaryHexInputs) {
    cases.push({ input, description: `hex/bin: ${input}` });
  }

  // Category 4: String literals
  const stringInputs = [
    '""',
    '"a"',
    '"hello world"',
    '"hello \\"world\\""',
    '"special chars: !@#$%^&*()"',
    '"unicode: üñîçødé"',
  ];
  for (const input of stringInputs) {
    cases.push({ input, description: `string: ${input.substring(0, 40)}` });
  }

  // Category 5: Comments
  const commentInputs = [
    "# comment only",
    "// comment only",
    "1 + 2 # inline comment",
    "3 * 4 // inline comment",
  ];
  for (const input of commentInputs) {
    cases.push({ input, description: `comment: ${input.substring(0, 40)}` });
  }

  // Category 6: Random codepoints
  for (let i = 0x80; i <= 0xFF; i++) {
    cases.push({
      input: `1${String.fromCodePoint(i)}2`,
      description: `codepoint 0x${i.toString(16)}`,
    });
  }

  // Additional edge cases
  const edgeCases = [
    ".",
    "..",
    "...",
    ",",
    "(",
    ")",
    "[",
    "]",
    "{",
    "}",
    ":",
    ";",
    "=",
    "!",
    "?",
    "`",
    "``",
    "```",
    "1.2.3",
    "1,2,3",
    "()",
    "[]",
    "{}",
    "1e",
    "1E",
    "1e+",
    "1e-",
    "0x",
    "0X",
    "0b",
    "0B",
    "1n",
    "99999999999999999999999999999999999999999999999999",
    "1+-+-+-+-+-2",
    "((((1))))",
    "a.b.c.d",
    "a[b]c",
    "a{b}c",
    "a:b:c",
    "a;b;c",
    "\t\t\t",
    "\n\n\n",
    "a   b",
    "1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10",
    "1 % 0",
    "null",
    "undefined",
    "NaN",
    "Infinity",
    "true",
    "false",
    "1^2^3^4^5",
    "1 << 2 << 3",
    "1 >> 2 >> 3",
    "1 & 2 & 3",
    "1 | 2 | 3",
  ];
  for (const input of edgeCases) {
    cases.push({ input, description: `edge: ${input.substring(0, 40)}` });
  }

  return cases;
}

describe("Lexer Fuzz", () => {
  const fuzzCases = generateFuzzCases();

  test.each(fuzzCases)("fuzz: $description", ({ input }) => {
    const lexer = new Lexer();
    lexer.reset(input);
    const tokens: any[] = [];

    expect(() => {
      for (const token of lexer) {
        tokens.push(token);
      }
    }).not.toThrow();

    expect(Array.isArray(tokens)).toBe(true);
    for (const token of tokens) {
      expect(token.type).toBeDefined();
      expect(typeof token.type).toBe("string");
    }
  });
});
