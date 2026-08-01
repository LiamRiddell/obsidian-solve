import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { convertLatexToSolve } from "./LatexConverter";

/**
 * Evaluate arithmetic written inside Obsidian's own `$...$` inline-math
 * delimiters — see GitHub issue #37. `$\triangle V = (2.14e-5)*2*70$`
 * evaluates the same as `(2.14e-5)*2*70`: everything up to and including
 * the LAST `=` inside the delimiters is treated as an inert label (the
 * same "ignore the LaTeX name, keep the number" idea the issue itself
 * proposed — not full LaTeX parsing, which even the label alone would
 * make out of reach), and the remainder is converted from a documented
 * LaTeX subset (`LatexConverter.ts`) into ordinary Solve syntax before
 * evaluating it completely normally.
 *
 * **Not a member of `BUILTIN_PACKAGES`** — opt-in, same reasoning as
 * `packages/stocks`/`packages/knowledge`: `$` is ALREADY a real Solve
 * token (the USD currency prefix, e.g. `$5 + $3`), so silently claiming
 * a wrapped-in-dollars line by default for every host would be a real
 * behavior change, not an additive one. The trigger below only fires
 * when the line's FIRST and LAST characters are both `$` (currency usage
 * never produces that shape — `$5 + $3` starts with `$` but ends in
 * `3`), so it can't misfire on ordinary currency once a host opts in,
 * but a host who genuinely never wants `$...$` claimed at all should
 * simply not register this package.
 *
 * Architecturally this is the first real consumer of
 * `IEnginePackage.rawTextPreprocessors` (see that field's own doc
 * comment in `api/PackageRegistry.ts`) — the mechanism exists because
 * this package needs the converted text to be RE-LEXED AND RE-PARSED as
 * ordinary Solve syntax (arithmetic, function calls, everything), which
 * `rawLinePatterns` (a single opaque token) can't do.
 */
export function createLatexPackage(): IEnginePackage {
  return {
    name: "solve-latex",
    rawTextPreprocessors: [
      (lineText: string): string | null => {
        const trimmed = lineText.trim();
        if (trimmed.length < 2) return null;
        if (trimmed[0] !== "$" || trimmed[trimmed.length - 1] !== "$") return null;
        const inner = trimmed.slice(1, -1);
        // A clean pair has no OTHER "$" inside — guards against a shape
        // like "$5$3$" (not something real currency usage produces
        // either, but not a well-formed single $...$ span to unwrap).
        if (inner.length === 0 || inner.includes("$")) return null;

        const eqIdx = inner.lastIndexOf("=");
        const expression = eqIdx === -1 ? inner : inner.slice(eqIdx + 1);
        return convertLatexToSolve(expression);
      },
    ],
  };
}
