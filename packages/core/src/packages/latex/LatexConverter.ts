import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * Converts a documented SUBSET of LaTeX math notation into ordinary Solve
 * syntax, which the normal lex/parse/execute pipeline then handles
 * completely unchanged — see GitHub issue #37 and `LatexPackage.ts`'s own
 * doc comment for the overall design (this file is the pure, engine-free
 * text transform; `LatexPackage.ts` is the thin wrapper wiring it into
 * `rawTextPreprocessors`).
 *
 * Deliberately NOT a full LaTeX parser — LaTeX's real grammar is large
 * and this only recognizes a practical subset (`\frac`, `\sqrt`/`\sqrt[n]`,
 * `\times`/`\cdot`/`\div`, `\left`/`\right`, a handful of Greek letters,
 * `^{...}` exponent grouping, and bare `{...}` grouping). Any OTHER
 * backslash command still present after those substitutions is a clear,
 * loud error (`LATEX_UNSUPPORTED_COMMAND`) — never silently stripped or
 * guessed at. A wrong "clean parse error" is recoverable; a confidently
 * wrong number is not, matching this codebase's standing policy on
 * ambiguous input everywhere else.
 */

const GREEK_LETTERS: Record<string, string> = {
  pi: "pi", // matches the real PI constant, not just a bare identifier
  alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta",
  epsilon: "epsilon", zeta: "zeta", eta: "eta", theta: "theta",
  iota: "iota", kappa: "kappa", lambda: "lambda", mu: "mu",
  nu: "nu", xi: "xi", rho: "rho", sigma: "sigma", tau: "tau",
  upsilon: "upsilon", phi: "phi", chi: "chi", psi: "psi", omega: "omega",
};

/** Finds the index of the `}` matching the `{` at `openIdx`, or -1 if unmatched (handles nesting). */
function findMatchingBrace(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipSpaces(s: string, i: number): number {
  while (s[i] === " ") i++;
  return i;
}

/** `\frac{a}{b}` -> `(a)/(b)`, recursing into `a`/`b` first so nested `\frac`/`\sqrt` inside either half convert too. */
function convertFrac(s: string): string {
  const idx = s.indexOf("\\frac");
  if (idx === -1) return s;

  let pos = skipSpaces(s, idx + 5);
  if (s[pos] !== "{") {
    throw ErrorFactory.parsing("LATEX_MALFORMED_FRAC", `\\frac must be followed by {numerator}{denominator}`);
  }
  const numEnd = findMatchingBrace(s, pos);
  if (numEnd === -1) throw ErrorFactory.parsing("LATEX_UNMATCHED_BRACE", `Unmatched { in \\frac`);
  const numerator = s.slice(pos + 1, numEnd);

  let pos2 = skipSpaces(s, numEnd + 1);
  if (s[pos2] !== "{") {
    throw ErrorFactory.parsing("LATEX_MALFORMED_FRAC", `\\frac must be followed by {numerator}{denominator}`);
  }
  const denEnd = findMatchingBrace(s, pos2);
  if (denEnd === -1) throw ErrorFactory.parsing("LATEX_UNMATCHED_BRACE", `Unmatched { in \\frac`);
  const denominator = s.slice(pos2 + 1, denEnd);

  const replacement = `(${convertFrac(numerator)})/(${convertFrac(denominator)})`;
  return convertFrac(s.slice(0, idx) + replacement + s.slice(denEnd + 1));
}

/** `\sqrt{x}` -> `sqrt(x)`, `\sqrt[n]{x}` -> `root(n, x)`. */
function convertSqrt(s: string): string {
  const idx = s.indexOf("\\sqrt");
  if (idx === -1) return s;

  let pos = skipSpaces(s, idx + 5);
  let degree: string | null = null;
  if (s[pos] === "[") {
    const close = s.indexOf("]", pos);
    if (close === -1) throw ErrorFactory.parsing("LATEX_UNMATCHED_BRACE", `Unmatched [ in \\sqrt[n]{...}`);
    degree = s.slice(pos + 1, close);
    pos = skipSpaces(s, close + 1);
  }
  if (s[pos] !== "{") {
    throw ErrorFactory.parsing("LATEX_MALFORMED_SQRT", `\\sqrt must be followed by {expression}`);
  }
  const end = findMatchingBrace(s, pos);
  if (end === -1) throw ErrorFactory.parsing("LATEX_UNMATCHED_BRACE", `Unmatched { in \\sqrt`);
  const arg = convertSqrt(convertFrac(s.slice(pos + 1, end)));

  const replacement = degree ? `root(${degree}, ${arg})` : `sqrt(${arg})`;
  return convertSqrt(s.slice(0, idx) + replacement + s.slice(end + 1));
}

/** `^{...}` -> `^(...)`, recursing into the exponent so a nested `^{2^{3}}` converts fully. Bare `^n` (no braces) is already valid Solve syntax and passes through untouched. */
function convertExponentBraces(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "^" && s[i + 1] === "{") {
      const end = findMatchingBrace(s, i + 1);
      if (end === -1) throw ErrorFactory.parsing("LATEX_UNMATCHED_BRACE", `Unmatched { after ^`);
      result += "^(" + convertExponentBraces(s.slice(i + 2, end)) + ")";
      i = end + 1;
    } else {
      result += s[i];
      i++;
    }
  }
  return result;
}

/** Inserts an explicit `*` for the juxtaposition shapes LaTeX relies on that Solve doesn't already infer: `)5` and `)(`  and `5(`. */
function insertImplicitMultiply(s: string): string {
  let result = "";
  for (let i = 0; i < s.length; i++) {
    result += s[i];
    const cur = s[i];
    const next = s[i + 1];
    if (next === undefined) continue;
    const curCloses = cur === ")";
    const curIsDigit = /[0-9]/.test(cur);
    const nextOpens = next === "(";
    const nextIsDigit = /[0-9]/.test(next);
    if ((curCloses && (nextOpens || nextIsDigit)) || (curIsDigit && nextOpens)) {
      result += "*";
    }
  }
  return result;
}

/**
 * Converts one LaTeX-subset expression string into Solve syntax. Throws
 * `LATEX_UNSUPPORTED_COMMAND` (or a more specific `LATEX_*` code) rather
 * than silently dropping anything it doesn't recognize.
 */
export function convertLatexToSolve(latex: string): string {
  let s = latex;
  s = s.replace(/\\left/g, "").replace(/\\right/g, "");
  s = convertFrac(s);
  s = convertSqrt(s);
  s = s.replace(/\\times/g, "*").replace(/\\cdot/g, "*").replace(/\\div/g, "/");
  for (const [name, replacement] of Object.entries(GREEK_LETTERS)) {
    s = s.replace(new RegExp(`\\\\${name}\\b`, "g"), replacement);
  }
  s = convertExponentBraces(s);

  const unrecognized = s.match(/\\[a-zA-Z]+/);
  if (unrecognized) {
    throw ErrorFactory.parsing(
      "LATEX_UNSUPPORTED_COMMAND",
      `Unsupported LaTeX command: ${unrecognized[0]} — only a subset of LaTeX is understood (\\frac, \\sqrt, \\times, \\cdot, \\div, \\left/\\right, a handful of Greek letters, ^{...}); anything else is a clear error rather than a guess.`,
      { command: unrecognized[0] },
    );
  }

  // Any remaining braces are plain grouping (not consumed by \frac/\sqrt/^{}).
  s = s.replace(/\{/g, "(").replace(/\}/g, ")");
  s = insertImplicitMultiply(s);
  return s.trim();
}
