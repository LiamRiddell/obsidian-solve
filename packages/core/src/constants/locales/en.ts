export interface ILocale {
  code: string;
  label: string;
  keywordMap: Record<string, string>;
  display: {
    resultPrefix: string;
    dateFormat: string;
    decimalSeparator: string;
    thousandsSeparator: string;
    vectorFormat: string;
    percentageSuffix: string;
  };
}

export const enLocale: ILocale = {
  code: "en",
  label: "English",
  keywordMap: {
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
    // Long-form aliases for asin/acos/atan (Numi/older-calculator naming
    // convention) — same FunctionCallParselet indices, not new behavior.
    arcsin: "FUNC", arccos: "FUNC", arctan: "FUNC",
    sinh: "FUNC", cosh: "FUNC", tanh: "FUNC",
    asinh: "FUNC", acosh: "FUNC", atanh: "FUNC",
    cbrt: "FUNC", clz32: "FUNC", expm1: "FUNC", exp: "FUNC",
    // root(n, x) -- n-th root; fact/factorial(n) -- factorial. Bare FUNC
    // keywords, matching gcd/lcm/cbrt's precedent above (technical,
    // call-syntax-only names, not plausible :variableName choices).
    root: "FUNC", fact: "FUNC", factorial: "FUNC",
    fround: "FUNC", hypot: "FUNC", imul: "FUNC",
    log10: "FUNC", log1p: "FUNC", log2: "FUNC",
    pow: "FUNC", random: "FUNC", sign: "FUNC", trunc: "FUNC",
    degtorad: "FUNC", radtodeg: "FUNC",
    gcd: "FUNC", lcm: "FUNC", permutation: "FUNC", combination: "FUNC",
    // hex/bin double as CONVERTER_NAME below ("255 as hex") AND as FUNC
    // call-syntax ("hex(255)") — a word can only have one lexer token
    // type, so these win FUNC (removed from the CONVERTER_NAME list
    // below) and AsConverterParselet.ts's "as <name>" check was widened
    // to also accept a FUNC-typed token, preserving "as hex"/"as bin"
    // unchanged. See AsConverterParselet.ts's class doc for the full
    // reasoning.
    hex: "FUNC", bin: "FUNC", int: "FUNC",
    // Finance (packages/finance/) function-call forms. Bare keywords, not
    // phrase-fused — these are camelCase call-only names (e.g.
    // "compoundInterest(...)"), not natural-language words a user would
    // plausibly choose as a variable name, so the bare-keyword collision
    // risk that blocks "interest"/"tax"/"principal" etc. doesn't apply here
    // (matches "gcd"/"lcm"/... above, not "clamp" below).
    compoundinterest: "FUNC", interestearned: "FUNC",
    compoundinterestrate: "FUNC", compoundinterestyears: "FUNC",
    loanrepayment: "FUNC", loaninterest: "FUNC", monthlypayment: "FUNC",
    taxadd: "FUNC", taxremove: "FUNC",
    // Inflation-adjusted value function-call form (packages/finance/).
    inflationadjust: "FUNC",
    // Matrix (packages/matrix/) function-call forms -- also reachable via
    // `^T`/`^-1` operator syntax and `|a|` (see FunctionCallParselet.ts's
    // builtinNameToIndex comment for indices 63-66).
    transpose: "FUNC", det: "FUNC", inv: "FUNC", dot: "FUNC",
    // map/reduce/sum/prod (packages/mapreduce/) are NOT bare keywordMap
    // entries — see packages/mapreduce/normalizer/MapReduceCallNormalizerRule.ts,
    // which fuses them ONLY when immediately followed by "(" (same
    // "conditional-on-LPAREN" pattern as packages/lines/'s own
    // sum(/total(/average( fusion), so `:map = [...]`/`:sum = 100`/etc.
    // keep working as ordinary variable names.
    clamp: "CLAMP",
    convert: "CONVERT", to: "TO", best: "BEST", in: "IN",
    next: "NEXT", last: "LAST", until: "UNTIL", since: "SINCE",
    sunday: "SUNDAY", monday: "MONDAY", tuesday: "TUESDAY", wednesday: "WEDNESDAY",
    thursday: "THURSDAY", friday: "FRIDAY", saturday: "SATURDAY",
    between: "BETWEEN", from: "FROM",
    increase: "INCREASE", decrease: "DECREASE",
    // Finance (packages/finance/) phrase-grammar connectors. Bare
    // prepositions, same accepted-risk category as "between"/"from" above —
    // see Token.ts's OVER/RATE_AT doc comment.
    over: "OVER", at: "RATE_AT",
    by: "BY",
    vec2: "VEC2", vec3: "VEC3", vec4: "VEC4",
     float: "FLOAT",
    global: "GLOBAL",
    or: "OR",
    true: "TRUE", false: "FALSE",
    if: "IF", then: "THEN", else: "ELSE",
    as: "AS",
    percent: "CONVERTER_NAME", percentage: "CONVERTER_NAME",
    decimal: "CONVERTER_NAME", dec: "CONVERTER_NAME", number: "CONVERTER_NAME",
    fraction: "CONVERTER_NAME",
    multiplier: "CONVERTER_NAME",
    sci: "CONVERTER_NAME", scientific: "CONVERTER_NAME",
    // hex/bin are FUNC (see above), not CONVERTER_NAME — "as hex"/"as bin"
    // still work via AsConverterParselet.ts's widened token-type check.
    binary: "CONVERTER_NAME",
    octal: "CONVERTER_NAME", oct: "CONVERTER_NAME",
  },
  display: {
    resultPrefix: "= ",
    dateFormat: "default",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    vectorFormat: "[{values}]",
    percentageSuffix: "%",
  },
};
