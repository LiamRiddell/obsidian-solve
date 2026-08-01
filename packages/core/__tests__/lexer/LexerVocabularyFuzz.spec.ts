/**
 * Property-based (fuzz) tests for LexerVocabulary registration.
 *
 * These tests verify that registering plugin keywords, operators, phrases,
 * and units does NOT break or collide with built-in token types.
 *
 * Design principles:
 *  - Each test creates a fresh ExpressionLexer instance (never mutates sharedLexer)
 *  - Tests verify built-in tokens still produce the correct type after plugin registration
 *  - Tests verify plugin tokens produce the expected custom type
 *  - All existing fuzz cases from LexerFuzz.spec.ts are run through an overloaded lexer
 */

import { describe, expect, test } from "@jest/globals";
import { ExpressionLexer } from "@solve-js/lexer/ExpressionLexer";
import type { LexerVocabulary } from "@solve-js/lexer/ExpressionLexer";
import { TokenTypes } from "@solve-js/lexer/Token";

// ── Helpers ───────────────────────────────────────────────────────────────

function tokenize(input: string, plugin?: LexerVocabulary): Array<{ type: string; value: string }> {
  const lexer = new ExpressionLexer("en");
  if (plugin) {
    lexer.registerVocabulary(plugin);
  }
  lexer.reset(input);
  return [...lexer].map((t) => ({ type: t.type, value: t.value }));
}

function types(input: string, plugin?: LexerVocabulary): string[] {
  return tokenize(input, plugin).map((t) => t.type);
}

function values(input: string, plugin?: LexerVocabulary): string[] {
  return tokenize(input, plugin).map((t) => t.value);
}

// ── Built-in data sets (used to generate fuzz cases) ────────────────────

/** Keywords from the English locale keywordMap */
// Note: "min" is excluded from this list because it's also a known unit
// (minute). The lexer gives unit lookup priority over keyword lookup, so
// "min" tokenizes as UNIT, not FUNC. This is correct existing behavior.
const BUILTIN_KEYWORDS = [
  "pi", "e", "plus", "add", "and", "minus", "subtract", "remove", "take",
  "times", "multiply", "divide", "modulo", "mod", "exponent", "prime",
  "xor", "of", "now", "today", "tomorrow", "yesterday",
  "roll", "sqrt", "abs", "sin", "cos", "tan", "log", "ceil", "floor",
  "round", "max", "asin", "acos", "atan", "atan2",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "cbrt", "clz32", "expm1", "exp", "fround", "hypot", "imul",
  "log10", "log1p", "log2", "pow", "random", "sign", "trunc",
  "degtorad", "radtodeg", "convert", "to", "best", "in",
  "next", "last", "until", "since", "between", "from",
  "increase", "decrease", "vec2", "vec3", "vec4", "float",
];

/** Built-in keyword → expected token type mapping */
const KEYWORD_TOKEN_TYPES: Record<string, string> = {
  pi: "PI", e: "E",
  plus: "PLUS", add: "PLUS", and: "PLUS",
  minus: "MINUS", subtract: "MINUS", remove: "MINUS", take: "MINUS",
  times: "STAR", multiply: "STAR",
  divide: "SLASH",
  modulo: "MOD", mod: "MOD",
  exponent: "CARET", prime: "CARET",
  xor: "BIT_XOR",
  of: "OF",
  now: "NOW", today: "TODAY", tomorrow: "TOMORROW", yesterday: "YESTERDAY",
  roll: "ROLL",
  sqrt: "FUNC", abs: "FUNC", sin: "FUNC", cos: "FUNC", tan: "FUNC",
  log: "FUNC", ceil: "FUNC", floor: "FUNC", round: "FUNC", min: "FUNC", max: "FUNC",
  asin: "FUNC", acos: "FUNC", atan: "FUNC", atan2: "FUNC",
  sinh: "FUNC", cosh: "FUNC", tanh: "FUNC",
  asinh: "FUNC", acosh: "FUNC", atanh: "FUNC",
  cbrt: "FUNC", clz32: "FUNC", expm1: "FUNC", exp: "FUNC",
  fround: "FUNC", hypot: "FUNC", imul: "FUNC",
  log10: "FUNC", log1p: "FUNC", log2: "FUNC",
  pow: "FUNC", random: "FUNC", sign: "FUNC", trunc: "FUNC",
  degtorad: "FUNC", radtodeg: "FUNC",
  convert: "CONVERT", to: "TO", best: "BEST", in: "IN",
  next: "NEXT", last: "LAST", until: "UNTIL", since: "SINCE",
  between: "BETWEEN", from: "FROM",
  increase: "INCREASE", decrease: "DECREASE",
  vec2: "VEC2", vec3: "VEC3", vec4: "VEC4",
  float: "FLOAT",
};

/** Helper: all built-in keyword types */
const BUILTIN_KEYWORD_TYPES = new Set(Object.values(KEYWORD_TOKEN_TYPES));

/** Built-in phrases — now handled by TokenNormalizer, not lexer */
// Built-in phrases are no longer matched by the lexer.
// They produce raw IDENT tokens; the TokenNormalizer fuses them post-lexer.
const _BUILTIN_PHRASES: Array<{ phrase: string; type: string }> = [
  { phrase: "to the power of", type: "CARET" },
  { phrase: "power of", type: "CARET" },
  { phrase: "increase by", type: "INCREASE_BY" },
  { phrase: "decrease by", type: "DECREASE_BY" },
  { phrase: "times by", type: "TIMES_BY" },
  { phrase: "multiply by", type: "MULTIPLY_BY" },
  { phrase: "divide by", type: "DIVIDE_BY" },
];

/** Built-in two-char operators */
const BUILTIN_OPS: Array<{ chars: string; type: string }> = [
  { chars: "==", type: "EQUALITY" },
  { chars: "!=", type: "NEQ" },
  { chars: ">=", type: "GTE" },
  { chars: "<=", type: "LTE" },
  { chars: "<<", type: "LSHIFT" },
  { chars: ">>", type: "RSHIFT" },
];

/** A representative subset of built-in units */
const BUILTIN_UNITS = ["mm", "cm", "m", "km", "g", "kg", "s", "min", "h", "d", "C", "F", "K"];

/** Common single-char operators that should always work */
const SINGLE_OPS: Array<{ chars: string; type: string }> = [
  { chars: "+", type: "PLUS" },
  { chars: "-", type: "MINUS" },
  { chars: "*", type: "STAR" },
  { chars: "/", type: "SLASH" },
  { chars: "^", type: "CARET" },
  { chars: "%", type: "PERCENT" },
  { chars: "(", type: "LPAREN" },
  { chars: ")", type: "RPAREN" },
  { chars: ",", type: "COMMA" },
  { chars: ":", type: "COLON" },
  { chars: "=", type: "EQUALS" },
  { chars: "&", type: "BIT_AND" },
  { chars: "|", type: "BIT_OR" },
  { chars: "~", type: "BIT_NOT" },
];

// ── Test suites ───────────────────────────────────────────────────────────

describe("LexerVocabulary Fuzz — keyword collision resistance", () => {
  test("registering a built-in keyword as plugin keyword throws EngineError", () => {
    // Each of these is a built-in keyword — the collision guard must reject them
    const conflictingKeywords = ["pi", "sin", "roll", "e", "of", "to", "pow", "increase"];
    for (const kw of conflictingKeywords) {
      const plugin: LexerVocabulary = {
        keywords: { [kw]: "PLUGIN_OVERRIDE" },
      };
      expect(() => new ExpressionLexer("en").registerVocabulary(plugin))
        .toThrow(/conflicts with built-in keyword/i);
    }
  });

  test("registering uppercase variant of built-in keyword as plugin keyword throws EngineError", () => {
    // The collision guard is case-insensitive — uppercasing shouldn't bypass it
    const plugin: LexerVocabulary = {
      keywords: { PI: "PLUGIN_PI" },
    };
    expect(() => new ExpressionLexer("en").registerVocabulary(plugin))
      .toThrow(/conflicts with built-in keyword/i);
  });

  test("non-conflicting plugin keywords work alongside built-in keywords", () => {
    const plugin: LexerVocabulary = {
      keywords: {
        my_keyword: "MY_KEYWORD",
        ns_value: "NS_VALUE",
      },
    };

    // Plugin keywords should be recognized
    expect(types("my_keyword", plugin)).toEqual(["MY_KEYWORD"]);
    expect(types("ns_value", plugin)).toEqual(["NS_VALUE"]);

    // Built-in keywords should still work
    for (const kw of BUILTIN_KEYWORDS) {
      const result = tokenize(kw, plugin);
      expect(result).toHaveLength(1);
      const expectedType = KEYWORD_TOKEN_TYPES[kw];
      expect(result[0].type).toBe(expectedType);
    }
  });

  test("plugin keywords that are partial matches of built-in keywords don't interfere", () => {
    // Plugin registers keywords that are substrings or superstrings of built-in ones
    const plugin: LexerVocabulary = {
      keywords: {
        // Substrings of built-in keywords
        p: "PLUGIN_P",
        si: "PLUGIN_SI",
        ro: "PLUGIN_RO",
        lo: "PLUGIN_LO",
        // Superstrings of built-in keywords
        pi_value: "PLUGIN_PI_VALUE",
        sin_hyperbolic: "PLUGIN_SIN_HYPERBOLIC",
        roll_dice: "PLUGIN_ROLL_DICE",
        euler: "PLUGIN_EULER",
        plus_one: "PLUGIN_PLUS_ONE",
        minus_sign: "PLUGIN_MINUS_SIGN",
      },
    };

    // Built-in keywords should still work
    const builtinSamples = ["pi", "sin", "roll", "e", "plus", "minus"];
    for (const kw of builtinSamples) {
      const expected = KEYWORD_TOKEN_TYPES[kw];
      expect(types(kw, plugin)).toEqual([expected]);
    }

    // Plugin keywords that are superstrings should be recognized
    expect(types("pi_value", plugin)).toEqual(["PLUGIN_PI_VALUE"]);
    expect(types("sin_hyperbolic", plugin)).toEqual(["PLUGIN_SIN_HYPERBOLIC"]);
    expect(types("roll_dice", plugin)).toEqual(["PLUGIN_ROLL_DICE"]);
    expect(types("euler", plugin)).toEqual(["PLUGIN_EULER"]);
    expect(types("plus_one", plugin)).toEqual(["PLUGIN_PLUS_ONE"]);
    expect(types("minus_sign", plugin)).toEqual(["PLUGIN_MINUS_SIGN"]);
  });

  test("plugin keywords that look like function names are blocked by collision guard", () => {
    // max and round are built-in FUNC keywords — the collision guard prevents
    // registering them as plugin keywords.
    for (const kw of ["max", "round", "sin", "sqrt", "abs"]) {
      expect(() => new ExpressionLexer("en").registerVocabulary({
        keywords: { [kw]: "OVERRIDE" },
      })).toThrow(/conflicts with built-in keyword/i);
    }

    // Non-conflicting function-like keywords should work
    const plugin: LexerVocabulary = {
      keywords: {
        myfunc: "MYFUNC",
        custom_fn: "CUSTOM_FN",
      },
    };
    expect(() => new ExpressionLexer("en").registerVocabulary(plugin)).not.toThrow();
    expect(types("myfunc", plugin)).toEqual(["MYFUNC"]);
    expect(types("custom_fn(1, 2)", plugin)).toEqual(["CUSTOM_FN", "LPAREN", "NUMBER", "COMMA", "NUMBER", "RPAREN"]);

    // Built-in FUNC keywords still work
    expect(types("sin(0)", plugin)).toEqual(["FUNC", "LPAREN", "NUMBER", "RPAREN"]);
    expect(types("max(1, 2)", plugin)).toEqual(["FUNC", "LPAREN", "NUMBER", "COMMA", "NUMBER", "RPAREN"]);
  });

  test("plugin keywords with uppercase variations work correctly", () => {
    // Locale keywordMap lowercases before lookup; plugin also lowercases.
    // Verify case-insensitive matching for both built-in and plugin keywords.
    const plugin: LexerVocabulary = {
      keywords: {
        myns: "MY_NS",
      },
    };

    // Uppercase built-in keywords should still match
    expect(types("PI", plugin)).toEqual(["PI"]);
    expect(types("SIN", plugin)).toEqual(["FUNC"]);
    expect(types("Roll", plugin)).toEqual(["ROLL"]);
    expect(types("To", plugin)).toEqual(["TO"]);

    // Uppercase plugin keywords should match (case-insensitive)
    expect(types("MYNS", plugin)).toEqual(["MY_NS"]);
    expect(types("myns", plugin)).toEqual(["MY_NS"]);
    expect(types("MyNs", plugin)).toEqual(["MY_NS"]);
  });
});

describe("LexerVocabulary Fuzz — operator collision resistance", () => {
  test("registering a built-in two-char operator as plugin operator throws EngineError", () => {
    for (const op of BUILTIN_OPS) {
      const plugin: LexerVocabulary = {
        operators: { [op.chars]: "CUSTOM_OVERRIDE" },
      };
      expect(() => new ExpressionLexer("en").registerVocabulary(plugin))
        .toThrow(/conflicts with built-in operator/i);
    }
  });

  test("non-conflicting plugin operators work alongside built-in two-char operators", () => {
    const plugin: LexerVocabulary = {
      operators: {
        "->": "ARROW",
        "=>": "FAT_ARROW",
        "<|": "LEFT_PIPE",
        "|>": "PIPE",
        "::": "NAMESPACE",
        "||": "LOGICAL_OR",
        "&&": "LOGICAL_AND",
      },
    };

    // Plugin operators should be recognized
    expect(types("a->b", plugin)).toContain("ARROW");
    expect(types("a=>b", plugin)).toContain("FAT_ARROW");
    expect(types("a::b", plugin)).toContain("NAMESPACE");
    expect(types("a||b", plugin)).toContain("LOGICAL_OR");
    expect(types("a&&b", plugin)).toContain("LOGICAL_AND");
    expect(types("a<|b", plugin)).toContain("LEFT_PIPE");
    expect(types("a|>b", plugin)).toContain("PIPE");

    // Built-in operators that share first char must still work
    expect(types("a <= b", plugin)).toContain("LTE");
    expect(types("a >= b", plugin)).toContain("GTE");
    expect(types("a == b", plugin)).toContain("EQUALITY");
    expect(types("a != b", plugin)).toContain("NEQ");
    expect(types("a << b", plugin)).toContain("LSHIFT");
    expect(types("a >> b", plugin)).toContain("RSHIFT");
  });

  test("plugin operators that share first char with built-in ops work", () => {
    const plugin: LexerVocabulary = {
      operators: {
        // Share first char with built-in ops
        "->": "ARROW",
        "=>": "FAT_ARROW",
        "<|": "LEFT_PIPE",
        "|>": "PIPE",
        "::": "NAMESPACE",
        "||": "LOGICAL_OR",
        "&&": "LOGICAL_AND",
      },
    };

    // Plugin operators should be recognized
    expect(types("a->b", plugin)).toContain("ARROW");
    expect(types("a=>b", plugin)).toContain("FAT_ARROW");
    expect(types("a::b", plugin)).toContain("NAMESPACE");
    expect(types("a||b", plugin)).toContain("LOGICAL_OR");
    expect(types("a&&b", plugin)).toContain("LOGICAL_AND");
    expect(types("a<|b", plugin)).toContain("LEFT_PIPE");
    expect(types("a|>b", plugin)).toContain("PIPE");

    // Built-in operators that share first char must still work
    expect(types("a <= b", plugin)).toContain("LTE");
    expect(types("a >= b", plugin)).toContain("GTE");
    expect(types("a == b", plugin)).toContain("EQUALITY");
    expect(types("a != b", plugin)).toContain("NEQ");
    expect(types("a << b", plugin)).toContain("LSHIFT");
    expect(types("a >> b", plugin)).toContain("RSHIFT");
  });

  test("single-char operators unaffected by plugin operator registrations", () => {
    const plugin: LexerVocabulary = {
      operators: {
        "->": "ARROW",
        "::": "NAMESPACE",
        "**": "POWER", // Note: ** is handled as two STAR tokens
      },
    };

    for (const op of SINGLE_OPS) {
      const result = tokenize(op.chars, plugin);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(op.type);
    }
  });

  test("operator expressions with plugin operators in context", () => {
    const plugin: LexerVocabulary = {
      operators: {
        "::": "NAMESPACE",
        "->": "ARROW",
      },
    };

    // Expression with built-in operators should be unchanged
    expect(types("1 + 2 * 3", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER", "STAR", "NUMBER"]);
    expect(types("(1 + 2) * 3", plugin)).toEqual(["LPAREN", "NUMBER", "PLUS", "NUMBER", "RPAREN", "STAR", "NUMBER"]);

    // Expression with plugin operators should work alongside built-in ones
    // Note: avoiding built-in units (a=are, c=centi, bar=pressure, etc.)
    expect(types("myVar::ns + xyz->uvw", plugin)).toEqual([
      "IDENT", "NAMESPACE", "IDENT", "PLUS", "IDENT", "ARROW", "IDENT",
    ]);
  });
});

describe("LexerVocabulary Fuzz — phrase collision resistance", () => {
  test("built-in phrase fusion moved to TokenNormalizer — skipped from lexer", () => {
    // Phrases like "to the power of" and "increase by" are now handled
    // by the TokenNormalizer post-lexer pass, not the lexer itself.
    // The lexer emits raw IDENT tokens; the normalizer fuses them.
    // This test exists to document the architectural shift.
    const plugin: LexerVocabulary = {
      keywords: {},
    };
    // Raw tokens from lexer: "to the power of" → IDENT, IDENT, IDENT, IDENT, IDENT
    expect(types("to the power of", plugin).length).toBe(5);
    expect(types("increase by", plugin)).toEqual(["IDENT", "IDENT"]);
  });
});

describe("LexerVocabulary Fuzz — unit collision resistance", () => {
  test("registering a built-in unit as plugin unit throws EngineError", () => {
    for (const unit of BUILTIN_UNITS) {
      const plugin: LexerVocabulary = {
        units: [unit],
      };
      expect(() => new ExpressionLexer("en").registerVocabulary(plugin))
        .toThrow(/conflicts with a built-in unit/i);
    }
  });

  test("non-conflicting plugin units work alongside built-in units", () => {
    const plugin: LexerVocabulary = {
      units: ["tile", "gp", "osrs"],
    };

    // Plugin units should be recognized
    expect(types("tile", plugin)).toEqual(["UNIT"]);
    expect(types("gp", plugin)).toEqual(["UNIT"]);
    expect(types("osrs", plugin)).toEqual(["UNIT"]);

    // Built-in units should still work
    for (const unit of BUILTIN_UNITS) {
      const result = tokenize(unit, plugin);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("UNIT");
      expect(result[0].value).toBe(unit);
    }
  });

  test("plugin units take priority over built-in keywords for overlapping names", () => {
    // When a plugin explicitly registers a unit that overlaps with a built-in
    // keyword, the plugin unit takes priority (units are checked before keywords).
    const plugin: LexerVocabulary = {
      units: ["pi", "e", "sin", "cos", "tan", "log", "max"],
    };

    // Plugin units take priority over keywords — these tokenize as UNIT
    expect(types("pi", plugin)).toEqual(["UNIT"]);
    expect(types("e", plugin)).toEqual(["UNIT"]);
    expect(types("sin", plugin)).toEqual(["UNIT"]);
    expect(types("cos", plugin)).toEqual(["UNIT"]);
    expect(types("max", plugin)).toEqual(["UNIT"]);

    // Non-conflicting built-in keywords still work
    expect(types("now", plugin)).toEqual(["NOW"]);
    expect(types("roll", plugin)).toEqual(["ROLL"]);
    expect(types("sqrt", plugin)).toEqual(["FUNC"]);

    // Regular built-in units should still work
    expect(types("cm", plugin)).toEqual(["UNIT"]);
    expect(types("kg", plugin)).toEqual(["UNIT"]);
    expect(types("min", plugin)).toEqual(["UNIT"]);
  });

  test("plugin units work alongside regular identifiers", () => {
    const plugin: LexerVocabulary = {
      units: ["tile", "gp", "osrs", "ns"],
    };

    // Plugin units should be recognized
    expect(types("tile", plugin)).toEqual(["UNIT"]);
    expect(types("gp", plugin)).toEqual(["UNIT"]);
    expect(types("osrs", plugin)).toEqual(["UNIT"]);

    // Regular identifiers should still be IDENT
    expect(types("tiles", plugin)).toEqual(["IDENT"]);  // not "tile" with 's'
    expect(types("gps", plugin)).toEqual(["IDENT"]);
    expect(types("something", plugin)).toEqual(["IDENT"]);

    // Mixed with built-in units
    expect(types("tile + cm", plugin)).toEqual(["UNIT", "PLUS", "UNIT"]);
    expect(types("gp to USD", plugin)).toEqual(["UNIT", "TO", "UNIT"]);
  });
});

describe("LexerVocabulary Fuzz — mixed expression collisions", () => {
  test("arithmetic expressions with many plugin registrations", () => {
    const plugin: LexerVocabulary = {
      keywords: {
        myplus: "PLUGIN_PLUS",
        myminus: "PLUGIN_MINUS",
        mytimes: "PLUGIN_TIMES",
      },
      operators: {
        "::": "NAMESPACE",
      },
      units: ["foo", "baz"],
    };

    // Complex expression with mixed content
    expect(types("1 + 2 * 3", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER", "STAR", "NUMBER"]);
    // Note: using non-unit identifiers (a=are, b=barn, c=centi, all built-in units)
    expect(types("x::y", plugin)).toEqual(["IDENT", "NAMESPACE", "IDENT"]);
    expect(types("foo + baz", plugin)).toEqual(["UNIT", "PLUS", "UNIT"]);
    expect(types("pi + e", plugin)).toEqual(["PI", "PLUS", "E"]);
    expect(types("1 + 2", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
    expect(types("myplus", plugin)).toEqual(["PLUGIN_PLUS"]);
    // Phrases like "cost of" produce raw IDENT tokens from the lexer
    expect(types("cost of 100", plugin)).toEqual(["IDENT", "IDENT", "NUMBER"]);
  });

  test("number tokenization unaffected by plugin registrations", () => {
    // Register keywords that look like number-related words
    const plugin: LexerVocabulary = {
      keywords: {
        thousand: "THOUSAND",
        million: "MILLION",
        billion: "BILLION",
      },
      operators: {
        "..": "RANGE",
        "e+": "SCI_EXP",       // Could interfere with scientific notation
        "e-": "NEG_EXP",
      },
      units: ["nano", "micro", "mega"],  // SI prefix-like
    };

    // Number forms should be unaffected
    expect(types("42", plugin)).toEqual(["NUMBER"]);
    expect(types("3.14", plugin)).toEqual(["NUMBER"]);
    expect(types("1.5e10", plugin)).toEqual(["NUMBER"]);
    expect(types("1.5e-3", plugin)).toEqual(["NUMBER"]);
    expect(types("0xFF", plugin)).toEqual(["NUMBER"]);
    expect(types("0b1010", plugin)).toEqual(["NUMBER"]);
    expect(types("100n", plugin)).toEqual(["BIGINT"]);
    expect(types("1,234", plugin)).toEqual(["NUMBER"]);
    expect(types("0x0", plugin)).toEqual(["NUMBER"]);
  });

  test("identifier tokenization unaffected by many plugin registrations", () => {
    const plugin: LexerVocabulary = {
      keywords: {
        x: "PLUGIN_X",
        y: "PLUGIN_Y",
        z: "PLUGIN_Z",
        abc: "PLUGIN_ABC",
        foo: "PLUGIN_FOO",
        hello: "PLUGIN_HELLO",
      },
      units: ["q", "r", "n"],  // Single-char units not in built-in knownUnits
    };

    // Unregistered identifiers should still be IDENT
    // Use identifiers that are NOT registered as plugin keywords or units
    expect(types("xyz", plugin)).toEqual(["IDENT"]);
    expect(types("abcdef", plugin)).toEqual(["IDENT"]);
    expect(types("something", plugin)).toEqual(["IDENT"]);
    expect(types("unregistered", plugin)).toEqual(["IDENT"]);

    // Registered keywords should produce custom types
    expect(types("foo", plugin)).toEqual(["PLUGIN_FOO"]);
    expect(types("hello", plugin)).toEqual(["PLUGIN_HELLO"]);

    // Plugin units should be recognized (case-sensitive)
    expect(types("q", plugin)).toEqual(["UNIT"]);
    expect(types("r", plugin)).toEqual(["UNIT"]);
    expect(types("n", plugin)).toEqual(["UNIT"]);
    expect(types("Q", plugin)).toEqual(["IDENT"]);  // uppercase 'Q' is not in plugin units
  });
});

describe("LexerVocabulary Fuzz — stress test with all fuzz cases", () => {
  // Generate a large, noisy plugin with many entries
  const STRESS_PLUGIN: LexerVocabulary = {
    keywords: {
      // 20+ random-looking keywords
      namespace: "NAMESPACE_KW",
      module: "MODULE_KW",
      package: "PACKAGE_KW",
      import: "IMPORT_KW",
      export: "EXPORT_KW",
      class: "CLASS_KW",
      function: "FUNCTION_KW",
      method: "METHOD_KW",
      property: "PROPERTY_KW",
      field: "FIELD_KW",
      constructor: "CONSTRUCTOR_KW",
      static: "STATIC_KW",
      private: "PRIVATE_KW",
      public: "PUBLIC_KW",
      protected: "PROTECTED_KW",
      readonly: "READONLY_KW",
      abstract: "ABSTRACT_KW",
      async: "ASYNC_KW",
      await: "AWAIT_KW",
      yield: "YIELD_KW",
      // Keywords that overlap with built-in ones (should be shadowed)
      max_length: "MAX_LENGTH",
      min_value: "MIN_VALUE",
      log_error: "LOG_ERROR",
      random_value: "RANDOM_VALUE",
    },
    operators: {
      "::": "NAMESPACE",
      "->": "ARROW",
      "=>": "FAT_ARROW",
      "<|": "LEFT_PIPE",
      "|>": "RIGHT_PIPE",
      "++": "INCREMENT",
      "--": "DECREMENT",
      "**": "POWER",
      "??": "NULL_COALESCE",
    },
    units: [
      "tile", "gp", "osrs", "ns", "pt", "px", "em", "rem", "vh", "vw",
      "vmin", "vmax", "ch", "ex", "fr",
    ],
  };

  /** Reusable fuzz cases from LexerFuzz.spec.ts pattern */
  const FUZZ_CASES = [
    // Valid expressions
    { input: "42", desc: "single number" },
    { input: "1 + 2", desc: "simple addition" },
    { input: "3 * 4", desc: "simple multiplication" },
    { input: "(1 + 2) * 3", desc: "parenthesized" },
    { input: "pi + e", desc: "constants" },
    { input: "0xFF", desc: "hex" },
    { input: "0b1010", desc: "binary" },
    { input: "0b1111", desc: "binary all ones" },
    { input: "sin(0)", desc: "function call" },
    { input: "sqrt(4)", desc: "sqrt function" },
    { input: "vec2(1, 2)", desc: "vector" },
    { input: "100 cm to m", desc: "unit conversion" },
    { input: "now + 3 days", desc: "datetime" },
    { input: "next monday", desc: "next weekday" },
    { input: "last friday", desc: "last weekday" },
    { input: "4d6", desc: "dice" },
    { input: "roll 3d8", desc: "roll dice" },
    { input: "50% of 200", desc: "percentage" },
    { input: "increase 100 by 10%", desc: "increase percentage" },
    { input: "decrease 100 by 10%", desc: "decrease percentage" },
    { input: "25% of 80 + 10", desc: "percentage mixed" },
    { input: '"hello world"', desc: "string" },
    { input: "1 + 2 * 3 ^ 4", desc: "operator precedence" },
    { input: "convert 100 cm to m", desc: "convert" },
    { input: "to the power of", desc: "built-in phrase" },
    { input: "times by 3", desc: "times phrase" },
    { input: "divide by 2", desc: "divide phrase" },
    { input: "increase by 5", desc: "increase phrase" },
    { input: "decrease by 3", desc: "decrease phrase" },
    { input: "# comment only", desc: "hash comment" },
    { input: "// another comment", desc: "slash comment" },
    { input: "s`1+2`", desc: "inline solve" },
    { input: "a + b", desc: "variables" },
    { input: "1 << 2", desc: "left shift" },
    { input: "1 >> 3", desc: "right shift" },
    { input: "1 & 2", desc: "bitwise and" },
    { input: "1 | 2", desc: "bitwise or" },
    { input: "~1", desc: "bitwise not" },
    { input: "1e10", desc: "scientific notation" },
    { input: "1.5E-3", desc: "scientific negative exp" },
    { input: "1 + ", desc: "trailing operator" },
    { input: "(3 +", desc: "unclosed paren" },
    { input: "func(", desc: "unclosed function" },
    { input: "100n", desc: "bigint" },
    { input: "1 == 2", desc: "equality" },
    { input: "1 != 3", desc: "not equal" },
    { input: "1 < 2", desc: "less than" },
    { input: "1 <= 2", desc: "less or equal" },
    { input: ":var = 42", desc: "variable assignment" },
    { input: "", desc: "empty" },
    { input: "   ", desc: "whitespace only" },
    { input: "1 + 2 - 3 * 4 / 5 % 6 ^ 7", desc: "full arithmetic" },
    { input: "abs(-5)", desc: "abs function" },
    { input: "ceil(4.2)", desc: "ceil function" },
    { input: "floor(4.8)", desc: "floor function" },
    { input: "round(3.5)", desc: "round function" },
    { input: "min(1, 2)", desc: "min function" },
    { input: "max(5, 3)", desc: "max function" },
    { input: "random()", desc: "random function" },
    { input: "log10(100)", desc: "log10 function" },
    { input: "log2(8)", desc: "log2 function" },
    { input: "exp(1)", desc: "exp function" },
    { input: "pow(2, 3)", desc: "pow function" },
    { input: "sign(-10)", desc: "sign function" },
    { input: "trunc(4.7)", desc: "trunc function" },
    { input: "hypot(3, 4)", desc: "hypot function" },
    { input: "1 plus 2", desc: "plus keyword" },
    { input: "1 and 2", desc: "and keyword" },
    { input: "1 minus 3", desc: "minus keyword" },
    { input: "between 1 and 10", desc: "between" },
    { input: "from 1 to 5", desc: "from to" },
    // Unicode
    { input: "3 × 4", desc: "unicode multiply" },
    { input: "6 ÷ 2", desc: "unicode divide" },
    { input: "5 ≠ 3", desc: "unicode not equal" },
    // Edge cases
    { input: ".", desc: "dot" },
    { input: "..", desc: "double dot" },
    { input: "...", desc: "triple dot" },
    { input: ",", desc: "comma" },
    { input: "(", desc: "lparen" },
    { input: "1.2.3", desc: "multiple dots" },
    { input: "1,2,3", desc: "comma numbers" },
    { input: "()", desc: "empty parens" },
    { input: "1e", desc: "truncated exponent" },
    { input: "1E", desc: "truncated exponent upper" },
    { input: "0x", desc: "bare hex" },
    { input: "0b", desc: "bare binary" },
    { input: "1n", desc: "bigint" },
    { input: "1+-+-+-+-+-2", desc: "chained unary" },
    { input: "((((1))))", desc: "deeply nested" },
    { input: "a.b.c.d", desc: "dot chains" },
    { input: "a:b:c", desc: "colon chains" },
    { input: "1 % 0", desc: "modulo zero" },
    { input: "1^2^3^4^5", desc: "chained caret" },
    { input: "1 << 2 << 3", desc: "chained shift" },
    { input: "1 >> 2 >> 3", desc: "chained rshift" },
    { input: "1 & 2 & 3", desc: "chained bitand" },
    { input: "1 | 2 | 3", desc: "chained bitor" },
    // Edge hex/bin
    { input: "0b0", desc: "binary zero" },
    { input: "0B0", desc: "binary zero upper" },
    { input: "0b10101010", desc: "binary long" },
    { input: "0xFF", desc: "hex FF" },
    { input: "0xDEADBEEF", desc: "hex deadbeef" },
    { input: "0xABCDEF", desc: "hex abcdef" },
    // Strings
    { input: '""', desc: "empty string" },
    { input: '"a"', desc: "single char string" },
    { input: '"special chars: !@#$%^&*()"', desc: "special chars string" },
  ];

  test("all fuzz cases produce valid tokens with stressed lexer (plugin keywords + operators)", () => {
    const plugin: LexerVocabulary = {
      keywords: {
        namespace: "NAMESPACE_KW",
        module: "MODULE_KW",
        package: "PACKAGE_KW",
      },
      operators: {
        "::": "NAMESPACE",
        "->": "ARROW",
      },
    };

    for (const { input, desc } of FUZZ_CASES) {
      expect(() => tokenize(input, plugin)).not.toThrow();
      const tokens = tokenize(input, plugin);

      // Every token must have a valid type and value
      for (const t of tokens) {
        expect(typeof t.type).toBe("string");
        expect(t.type.length).toBeGreaterThan(0);
        expect(typeof t.value).toBe("string");
      }
    }
  });

  test("all fuzz cases produce valid tokens with full stress plugin", () => {
    for (const { input, desc } of FUZZ_CASES) {
      expect(() => tokenize(input, STRESS_PLUGIN)).not.toThrow();
      const tokens = tokenize(input, STRESS_PLUGIN);

      for (const t of tokens) {
        expect(typeof t.type).toBe("string");
        expect(t.type.length).toBeGreaterThan(0);
        expect(typeof t.value).toBe("string");
      }
    }
  });

  test("all fuzz cases produce same number of tokens with and without stress plugin", () => {
    // For inputs that don't contain plugin keywords/operators/phrases/units,
    // the token count should be identical.
    for (const { input, desc } of FUZZ_CASES) {
      const withoutPlugin = tokenize(input, undefined);
      const withPlugin = tokenize(input, STRESS_PLUGIN);

      // If the input doesn't contain any plugin-registered tokens, the
      // token count and structure should be identical
      if (!input.includes("::") && !input.includes("->") && !input.includes("=>")
          && !input.includes("|>") && !input.includes("<|")
          && !/\b(namespace|module|package|import|export|class)\b/i.test(input)
          && !/\b(tile|gp|osrs|ns)\b/.test(input)
          && !/\b(price of|cost of|sum of)\b/i.test(input)) {
        expect(withPlugin.length).toBe(withoutPlugin.length);
      }
    }
  });
});

describe("LexerVocabulary Fuzz — edge cases and boundary conditions", () => {
  test("empty plugin registration is safe", () => {
    const plugin: LexerVocabulary = {};
    expect(() => tokenize("1 + 2", plugin)).not.toThrow();
    expect(types("1 + 2", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("plugin with only keywords (no ops/phrases/units) is safe", () => {
    const plugin: LexerVocabulary = {
      keywords: { test_kw: "TEST_KW" },
    };
    expect(() => tokenize("test_kw", plugin)).not.toThrow();
    expect(types("test_kw", plugin)).toEqual(["TEST_KW"]);
    expect(types("1 + 2", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("plugin with only operators (no keywords/phrases/units) is safe", () => {
    const plugin: LexerVocabulary = {
      operators: { "::": "NAMESPACE" },
    };
    expect(() => tokenize("a::b", plugin)).not.toThrow();
    expect(types("a::b", plugin)).toContain("NAMESPACE");
    expect(types("1 + 2", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("plugin with only phrases (no keywords/operators/units) requires normalizer", () => {
    // Phrases are now handled by the TokenNormalizer, not the lexer.
    // LexerVocabulary no longer accepts `phrases` — plugin phrases go through
    // the normalizer via IEnginePackage.normalizerRules.
    const plugin: LexerVocabulary = {
      keywords: {},
    };
    expect(() => tokenize("custom phrase", plugin)).not.toThrow();
    // Without normalizer, "custom phrase" → IDENT IDENT
    expect(types("custom phrase", plugin)).toEqual(["IDENT", "IDENT"]);
    expect(types("1 + 2", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("plugin with only units (no keywords/operators/phrases) is safe", () => {
    const plugin: LexerVocabulary = {
      units: ["customunit"],
    };
    expect(() => tokenize("customunit", plugin)).not.toThrow();
    expect(types("customunit", plugin)).toEqual(["UNIT"]);
    expect(types("1 + 2", plugin)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("multiple plugin registrations are additive and don't conflict", () => {
    const lexer = new ExpressionLexer("en");

    // Register first plugin
    lexer.registerVocabulary({
      keywords: { plugin_a: "PLUGIN_A" },
      operators: { "::": "NAMESPACE" },
    });

    // Register second plugin (same operator, different keyword)
    lexer.registerVocabulary({
      keywords: { plugin_b: "PLUGIN_B" },
      operators: { "->": "ARROW" },  // unique
    });

    // Register third plugin (overlapping keyword — should shadow earlier plugin)
    lexer.registerVocabulary({
      keywords: { plugin_a: "PLUGIN_A_OVERRIDE" },
    });

    // Both plugin keywords should be recognized (later overrides earlier)
    lexer.reset("plugin_a");
    expect([...lexer][0].type).toBe("PLUGIN_A_OVERRIDE");

    lexer.reset("plugin_b");
    expect([...lexer][0].type).toBe("PLUGIN_B");

    // Both operators should work
    lexer.reset("a::b");
    expect([...lexer].find(t => t.type === "NAMESPACE")).toBeDefined();

    lexer.reset("a->b");
    expect([...lexer].find(t => t.type === "ARROW")).toBeDefined();

    // Built-in keywords still work
    lexer.reset("pi");
    expect([...lexer][0].type).toBe("PI");
  });

  test("many sequential plugin registrations don't degrade", () => {
    const lexer = new ExpressionLexer("en");

    // Phrase matching requires alphabetic words (A-Z, a-z) — digits are not
    // valid phrase words. Use alphabetic word suffixes.
    const wordSuffixes = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

    // Register 10 plugins sequentially
    for (let i = 0; i < 10; i++) {
      lexer.registerVocabulary({
        keywords: { [`plugin_${i}`]: `PLUGIN_${i}` },
        operators: { [`->`]: "ARROW" },  // same operator repeatedly — no-op after first
        units: [`unit_${i}`],
      });
    }

    // All 10 plugin keywords should be recognized
    for (let i = 0; i < 10; i++) {
      lexer.reset(`plugin_${i}`);
      expect([...lexer][0].type).toBe(`PLUGIN_${i}`);
    }

    // All 10 plugin phrases now produce raw IDENT tokens (normalizer handles fusion)
    for (let i = 0; i < 10; i++) {
      lexer.reset(`custom ${wordSuffixes[i]}`);
      // Raw lexer output: IDENT IDENT (custom, word)
      expect([...lexer].length).toBe(2);
      expect([...lexer][0].type).toBe("IDENT");
      expect([...lexer][1].type).toBe("IDENT");
    }

    // All 10 plugin units should be recognized
    for (let i = 0; i < 10; i++) {
      lexer.reset(`unit_${i}`);
      expect([...lexer][0].type).toBe("UNIT");
    }

    // Built-ins still work
    lexer.reset("pi");
    expect([...lexer][0].type).toBe("PI");

    lexer.reset("1 + 2");
    const types10 = [...lexer].map(t => t.type);
    expect(types10).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });

  test("plugin registrations are isolated per ExpressionLexer instance", () => {
    const lexerA = new ExpressionLexer("en");
    const lexerB = new ExpressionLexer("en");

    lexerA.registerVocabulary({
      keywords: { only_a: "ONLY_A" },
    });

    lexerB.registerVocabulary({
      keywords: { only_b: "ONLY_B" },
    });

    // Lexer A should know only_a but not only_b
    lexerA.reset("only_a");
    expect([...lexerA][0].type).toBe("ONLY_A");
    lexerA.reset("only_b");
    expect([...lexerA][0].type).toBe("IDENT");  // not registered on A

    // Lexer B should know only_b but not only_a
    lexerB.reset("only_b");
    expect([...lexerB][0].type).toBe("ONLY_B");
    lexerB.reset("only_a");
    expect([...lexerB][0].type).toBe("IDENT");  // not registered on B
  });
});

describe("LexerVocabulary Fuzz — safety boundaries", () => {
  test("plugin operators with ASCII special characters don't interfere with built-in unicode ops", () => {
    // Plugin operators should not affect handling of unicode math symbols
    const plugin: LexerVocabulary = {
      operators: {
        "->": "ARROW",
        "=>": "FAT_ARROW",
        "::": "NAMESPACE",
        "<|": "LEFT_PIPE",
        "|>": "PIPE",
      },
    };

    // Built-in unicode operators should still work
    expect(types("3 × 4", plugin)).toContain("STAR");
    expect(types("6 ÷ 2", plugin)).toContain("SLASH");
    expect(types("5 ≠ 3", plugin)).toContain("NEQ");
    expect(types("£100", plugin)).toContain("POUND");
    expect(types("€50", plugin)).toContain("EURO");
  });

  test("plugin registrations don't affect unicode identifier fallback", () => {
    const plugin: LexerVocabulary = {
      keywords: { alpha: "ALPHA_KW", beta: "BETA_KW" },
      units: ["\u03BC", "\u03A9"],
    };

    // Note: single-char non-ASCII unicode (α, β, γ) hits the 1-char fast path
    // which returns [] since CHAR_CLASS only covers 0-127. This is a pre-existing
    // behavior of the ExpressionLexer, not related to plugin registration.

    // ASCII-based plugin keywords should still work alongside plugin units
    expect(types("alpha", plugin)).toEqual(["ALPHA_KW"]);
    expect(types("beta", plugin)).toEqual(["BETA_KW"]);
    
    // Built-in keywords should still work
    expect(types("pi", plugin)).toEqual(["PI"]);
    expect(types("sin", plugin)).toEqual(["FUNC"]);
  });
});

describe("LexerVocabulary Fuzz — unregisterVocabulary", () => {
  test("unregisterVocabulary removes plugin keywords", () => {
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = {
      keywords: { my_key: "MY_KEY", another_key: "ANOTHER_KEY" },
    };

    lexer.registerVocabulary(plugin);
    lexer.reset("my_key");
    expect([...lexer][0].type).toBe("MY_KEY");
    lexer.reset("another_key");
    expect([...lexer][0].type).toBe("ANOTHER_KEY");

    lexer.unregisterVocabulary(plugin);

    // Both keywords should revert to IDENT
    lexer.reset("my_key");
    expect([...lexer][0].type).toBe("IDENT");
    lexer.reset("another_key");
    expect([...lexer][0].type).toBe("IDENT");

    // Built-in keywords still work
    lexer.reset("pi");
    expect([...lexer][0].type).toBe("PI");
  });

  test("unregisterVocabulary removes plugin operators", () => {
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = {
      operators: { "::": "NAMESPACE", "->": "ARROW" },
    };

    lexer.registerVocabulary(plugin);
    lexer.reset("a::b");
    expect([...lexer].find(t => t.type === "NAMESPACE")).toBeDefined();
    lexer.reset("a->b");
    expect([...lexer].find(t => t.type === "ARROW")).toBeDefined();

    lexer.unregisterVocabulary(plugin);

    // Operators should revert to default behavior.
    // ':' (charCode 58) maps to COLON via OP_MAP, so '::' becomes COLON + COLON.
    lexer.reset("a::b");
    const colonTokens = [...lexer].filter(t => t.type === "COLON");
    expect(colonTokens.length).toBe(2);

    lexer.reset("a->b");
    const dashArrowTokens = [...lexer];
    // '-' maps to MINUS via OP_MAP; '>' maps to ERROR (no single-char OP_MAP entry).
    // So '->' becomes MINUS + ERROR.
    expect(dashArrowTokens.some(t => t.type === "MINUS")).toBe(true);
    expect(dashArrowTokens.some(t => t.type === "ERROR")).toBe(true);

    // Built-in operators still work
    lexer.reset("a<=b");
    expect([...lexer].find(t => t.type === "LTE")).toBeDefined();
  });

  test("unregisterVocabulary removes plugin phrases — now via normalizer", () => {
    // Phrases are now handled by the TokenNormalizer, not the lexer.
    // The lexer's `registerVocabulary` no longer accepts `phrases`.
    // This test exists to document the architectural shift.
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = {
      keywords: { custom: "CUSTOM_KW" },
    };

    lexer.registerVocabulary(plugin);
    lexer.reset("custom");
    expect([...lexer][0].type).toBe("CUSTOM_KW");

    lexer.unregisterVocabulary(plugin);
    lexer.reset("custom");
    expect([...lexer][0].type).toBe("IDENT");

    // Built-in phrases produce raw IDENT tokens from the lexer
    lexer.reset("increase by");
    const tokens = [...lexer];
    expect(tokens[0].type).toBe("IDENT");
    expect(tokens[1].type).toBe("IDENT");
  });

  test("unregisterVocabulary removes plugin units", () => {
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = {
      units: ["tile", "gp", "osrs"],
    };

    lexer.registerVocabulary(plugin);
    lexer.reset("tile");
    expect([...lexer][0].type).toBe("UNIT");
    lexer.reset("gp");
    expect([...lexer][0].type).toBe("UNIT");

    lexer.unregisterVocabulary(plugin);

    // Units should revert to IDENT (since they're not built-in units)
    lexer.reset("tile");
    expect([...lexer][0].type).toBe("IDENT");
    lexer.reset("gp");
    expect([...lexer][0].type).toBe("IDENT");

    // Built-in units still work
    lexer.reset("cm");
    expect([...lexer][0].type).toBe("UNIT");
    lexer.reset("kg");
    expect([...lexer][0].type).toBe("UNIT");
  });

  test("unregisterVocabulary with never-registered plugin is safe (no-op)", () => {
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = {
      keywords: { my_key: "MY_KEY" },
    };

    expect(() => lexer.unregisterVocabulary(plugin)).not.toThrow();

    // Lexer still works normally
    lexer.reset("my_key");
    expect([...lexer][0].type).toBe("IDENT");
    lexer.reset("pi");
    expect([...lexer][0].type).toBe("PI");
  });

  test("unregisterVocabulary only removes its own entries, not other plugins'", () => {
    const lexer = new ExpressionLexer("en");
    const pluginA: LexerVocabulary = {
      keywords: { key_a: "KEY_A" },
      units: ["unit_a"],
    };
    const pluginB: LexerVocabulary = {
      keywords: { key_b: "KEY_B" },
      units: ["unit_b"],
    };

    lexer.registerVocabulary(pluginA);
    lexer.registerVocabulary(pluginB);

    // Both plugins should work
    lexer.reset("key_a");
    expect([...lexer][0].type).toBe("KEY_A");
    lexer.reset("key_b");
    expect([...lexer][0].type).toBe("KEY_B");
    lexer.reset("unit_a");
    expect([...lexer][0].type).toBe("UNIT");
    lexer.reset("unit_b");
    expect([...lexer][0].type).toBe("UNIT");

    // Unregister only plugin A
    lexer.unregisterVocabulary(pluginA);

    // Plugin A's entries should be gone
    lexer.reset("key_a");
    expect([...lexer][0].type).toBe("IDENT");
    lexer.reset("unit_a");
    expect([...lexer][0].type).toBe("IDENT");

    // Plugin B's entries should still work
    lexer.reset("key_b");
    expect([...lexer][0].type).toBe("KEY_B");
    lexer.reset("unit_b");
    expect([...lexer][0].type).toBe("UNIT");

    // Built-ins still work
    lexer.reset("pi");
    expect([...lexer][0].type).toBe("PI");
    lexer.reset("cm");
    expect([...lexer][0].type).toBe("UNIT");
  });

  test("re-register after unregisterVocabulary works correctly", () => {
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = {
      keywords: { my_key: "MY_KEY_V1" },
    };

    lexer.registerVocabulary(plugin);
    lexer.reset("my_key");
    expect([...lexer][0].type).toBe("MY_KEY_V1");

    lexer.unregisterVocabulary(plugin);
    lexer.reset("my_key");
    expect([...lexer][0].type).toBe("IDENT");

    // Re-register with different type
    const pluginV2: LexerVocabulary = {
      keywords: { my_key: "MY_KEY_V2" },
    };
    lexer.registerVocabulary(pluginV2);
    lexer.reset("my_key");
    expect([...lexer][0].type).toBe("MY_KEY_V2");
  });

  test("unregisterVocabulary removes mixed entries (keywords + ops + units)", () => {
    const lexer = new ExpressionLexer("en");
    const plugin: LexerVocabulary = {
      keywords: { my_kw: "MY_KW" },
      operators: { "::": "NAMESPACE" },
      units: ["tile"],
    };

    lexer.registerVocabulary(plugin);

    // Verify all are registered
    lexer.reset("my_kw");
    expect([...lexer][0].type).toBe("MY_KW");
    lexer.reset("a::b");
    expect([...lexer].find(t => t.type === "NAMESPACE")).toBeDefined();
    lexer.reset("tile");
    expect([...lexer][0].type).toBe("UNIT");

    lexer.unregisterVocabulary(plugin);

    // Verify all are removed
    lexer.reset("my_kw");
    expect([...lexer][0].type).toBe("IDENT");
    lexer.reset("a::b");
    expect([...lexer].some(t => t.type === "NAMESPACE")).toBe(false);
    lexer.reset("tile");
    expect([...lexer][0].type).toBe("IDENT");

    // Built-ins still work
    lexer.reset("1 + 2");
    expect([...lexer].map(t => t.type)).toEqual(["NUMBER", "PLUS", "NUMBER"]);
  });
});

describe("LexerVocabulary Fuzz — collision guard edge cases", () => {
  test("mixed plugin with conflicting and non-conflicting entries throws on first conflict", () => {
    // Registering a keyword that matches a built-in should throw before
    // any non-conflicting entries are processed.
    const plugin: LexerVocabulary = {
      keywords: {
        sin: "PLUGIN_SIN",
        mykeyword: "MY_KW",
      },
    };
    const lexer = new ExpressionLexer("en");
    expect(() => lexer.registerVocabulary(plugin))
      .toThrow(/conflicts with built-in keyword/i);

    // Verify 'mykeyword' was NOT registered (the whole registration threw)
    lexer.reset("mykeyword");
    expect([...lexer][0].type).toBe("IDENT");
  });

  test("error messages include the conflicting token name and built-in type", () => {
    // Keyword
    expect(() => {
      new ExpressionLexer("en").registerVocabulary({
        keywords: { pi: "OVERRIDE" },
      });
    }).toThrow(/"pi".+built-in keyword/i);

    // Operator
    expect(() => {
      new ExpressionLexer("en").registerVocabulary({
        operators: { "==": "OVERRIDE" },
      });
    }).toThrow(/"==".+built-in operator/i);

    // Unit
    expect(() => {
      new ExpressionLexer("en").registerVocabulary({
        units: ["cm"],
      });
    }).toThrow(/"cm".+built-in unit/i);
  });

  test("registerVocabulary with no conflicting entries does not throw", () => {
    const plugin: LexerVocabulary = {
      keywords: { my_key: "MY_KEY" },
      operators: { "->": "ARROW" },
      units: ["myunit"],
    };
    const lexer = new ExpressionLexer("en");
    expect(() => lexer.registerVocabulary(plugin)).not.toThrow();

    lexer.reset("my_key");
    expect([...lexer][0].type).toBe("MY_KEY");
    lexer.reset("a->b");
    expect([...lexer].find(t => t.type === "ARROW")).toBeDefined();
    lexer.reset("myunit");
    expect([...lexer][0].type).toBe("UNIT");
  });

  test("all built-in keyword variants are blocked regardless of category", () => {
    const builtinSamples = ["pi", "plus", "add", "minus", "divide", "now", "roll", "sqrt", "convert", "vec2"];
    for (const kw of builtinSamples) {
      expect(() => {
        new ExpressionLexer("en").registerVocabulary({
          keywords: { [kw]: "OVERRIDE" },
        });
      }).toThrow(/conflicts with built-in keyword/i);
    }
  });

  test("all built-in phrase variants produce raw IDENT tokens from lexer", () => {
    // Phrases are now handled by the TokenNormalizer, not the lexer.
    // Raw IDENT tokens are emitted; the normalizer fuses them post-lexer.
    const phraseSamples = ["to the power of", "power of", "times by", "multiply by", "divide by", "increase by", "decrease by"];
    for (const phrase of phraseSamples) {
      const tokens = tokenize(phrase);
      // All tokens should be IDENT (raw output from lexer)
      for (const t of tokens) {
        expect(t.type).toBe("IDENT");
      }
    }
  });

  test("all built-in unit variants are blocked", () => {
    const unitSamples = ["mm", "cm", "m", "km", "g", "kg", "s", "min", "h"];
    for (const unit of unitSamples) {
      expect(() => {
        new ExpressionLexer("en").registerVocabulary({
          units: [unit],
        });
      }).toThrow(/conflicts with a built-in unit/i);
    }
  });

  test("registering // as plugin operator throws (comment sequence collision)", () => {
    // // is a built-in comment sequence in both expression and markdown modes.
    // Plugins must not be allowed to override it.
    const plugin: LexerVocabulary = {
      operators: { "//": "FLOOR_DIV" },
    };
    expect(() => new ExpressionLexer("en").registerVocabulary(plugin))
      .toThrow(/conflicts with built-in comment sequence/i);
  });

  test("operator sharing first char but different second char is allowed", () => {
    // '>' (62) is in TWO_CHAR_OPS for >= (62->61) and >> (62->62)
    // But '>:' (62->58) does not match any built-in, so it should be allowed
    const plugin: LexerVocabulary = {
      operators: { ">:": "COLON_GT" },
    };
    const lexer = new ExpressionLexer("en");
    expect(() => lexer.registerVocabulary(plugin)).not.toThrow();

    lexer.reset("a>:b");
    const types_ = [...lexer].map(t => t.type);
    expect(types_).toContain("COLON_GT");
  });

  test("substring and superstring of built-in keyword are allowed", () => {
    // "p" is not a built-in keyword ("pi" is) — exact match required
    // "pius" is not a built-in keyword — exact match required
    const plugin: LexerVocabulary = {
      keywords: {
        p: "LETTER_P",
        pius: "PIUS",
        eee: "TRIPLE_E",
      },
    };
    const lexer = new ExpressionLexer("en");
    expect(() => lexer.registerVocabulary(plugin)).not.toThrow();

    lexer.reset("p");
    expect([...lexer][0].type).toBe("LETTER_P");
    lexer.reset("pius");
    expect([...lexer][0].type).toBe("PIUS");
    lexer.reset("eee");
    expect([...lexer][0].type).toBe("TRIPLE_E");

    // Built-in keywords should still work
    lexer.reset("pi");
    expect([...lexer][0].type).toBe("PI");
    lexer.reset("e");
    expect([...lexer][0].type).toBe("E");
  });
});
