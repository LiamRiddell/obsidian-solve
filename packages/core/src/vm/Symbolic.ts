/**
 * Symbolic algebra — a deliberately bounded second evaluation mode
 * alongside the ordinary numeric VM, for expressions containing an
 * unassigned free variable (`v = a^-1 * b` where `a`/`b`'s entries
 * themselves contain unassigned names). NOT a general computer-algebra
 * system: this module explicitly does NOT implement polynomial
 * expansion/factoring, trig/log identities, collecting terms inside
 * products, or symbolic exponentiation. What it DOES implement:
 * - Constant folding (`2+3` inside a symbolic expression → `5`).
 * - Additive/multiplicative identities (`x+0`, `x*1`, `x*0`, `x/1`, `--x`).
 * - Flatten-and-collect-like-terms for top-level sums ONLY — a chain of
 *   `+`/`-`/unary-`-` over bare constants and bare variable names (e.g.
 *   `1+2+b+3+b` → `2b+6`). A `mul`/`div` node is never flattened THROUGH
 *   — `2*b + 3*b` does NOT collect into `5b` (that would need collecting
 *   terms inside products, explicitly out of scope for this pass).
 * - One narrow exception to the above: `div` cancels a single common
 *   factor when the denominator is STRUCTURALLY identical to one whole
 *   factor of a top-level product (`sx*tx/sx` → `tx`) — needed for
 *   triangular-matrix symbolic inverses. Not a general GCD/polynomial-
 *   division capability; see `simplifySymbolic()`'s `div` case.
 *
 * See `vm/VMConversion.ts`'s `binaryOp()` for where this plugs into the
 * ordinary arithmetic opcodes (a `symbolicOp` parameter, present only for
 * ADD/SUB/MUL/DIV — the "four arithmetic opcodes" the plan scopes this
 * to), and `format/FormatEngine.ts`'s `formatSymbolic()` for display.
 */

/** A symbolic/algebraic expression tree — free-variable formula, not a concrete number. */
export type SymbolicNode =
  | { kind: "const"; value: number }
  | { kind: "var"; name: string }
  | { kind: "add"; left: SymbolicNode; right: SymbolicNode }
  | { kind: "sub"; left: SymbolicNode; right: SymbolicNode }
  | { kind: "mul"; left: SymbolicNode; right: SymbolicNode }
  | { kind: "div"; left: SymbolicNode; right: SymbolicNode }
  | { kind: "neg"; operand: SymbolicNode };

export function constNode(value: number): SymbolicNode {
  return { kind: "const", value };
}

export function varNode(name: string): SymbolicNode {
  return { kind: "var", name };
}

// ── Flatten-and-collect (top-level sums only) ──────────────────────────────

interface FlatTerm {
  coeff: number;
  /** `null` means this term is the accumulated constant. */
  name: string | null;
}

/**
 * Recursively unrolls an `add`/`sub`/`neg` chain into a flat list of signed
 * terms. Returns `false` (without partially populating `out`'s meaning —
 * callers discard `out` on a `false` return) the moment it hits a `mul`/
 * `div` node, since collecting terms THROUGH a product is explicitly out
 * of scope — the whole node is left as a single opaque, un-collected
 * shape instead of flattened.
 */
function flattenSum(node: SymbolicNode, sign: number, out: FlatTerm[]): boolean {
  switch (node.kind) {
    case "add":
      return flattenSum(node.left, sign, out) && flattenSum(node.right, sign, out);
    case "sub":
      return flattenSum(node.left, sign, out) && flattenSum(node.right, -sign, out);
    case "neg":
      return flattenSum(node.operand, -sign, out);
    case "const":
      out.push({ coeff: sign * node.value, name: null });
      return true;
    case "var":
      out.push({ coeff: sign, name: node.name });
      return true;
    default:
      return false;
  }
}

/**
 * Collects like terms in a fully-flattenable `add`/`sub` chain — e.g.
 * `1+2+b+3+b` → `2b+6` (variable terms first, in first-seen order, then
 * the combined constant last; a zero-coefficient term is dropped
 * entirely, matching `x+0 -> x`'s identity). Returns `node` UNCHANGED if
 * it isn't fully flattenable (contains a `mul`/`div`) — this is the only
 * "term collection" this module performs; it never reaches inside a
 * product.
 */
function collectTerms(node: SymbolicNode): SymbolicNode {
  const flat: FlatTerm[] = [];
  if (!flattenSum(node, 1, flat)) return node;

  const order: string[] = [];
  const coeffByName = new Map<string, number>();
  let constant = 0;
  for (const t of flat) {
    if (t.name === null) {
      constant += t.coeff;
      continue;
    }
    if (!coeffByName.has(t.name)) {
      coeffByName.set(t.name, 0);
      order.push(t.name);
    }
    coeffByName.set(t.name, coeffByName.get(t.name)! + t.coeff);
  }

  const termNodes: SymbolicNode[] = [];
  for (const name of order) {
    const coeff = coeffByName.get(name)!;
    if (coeff === 0) continue;
    if (coeff === 1) termNodes.push(varNode(name));
    else if (coeff === -1) termNodes.push({ kind: "neg", operand: varNode(name) });
    else termNodes.push({ kind: "mul", left: constNode(coeff), right: varNode(name) });
  }

  if (termNodes.length === 0) return constNode(constant);

  let result = termNodes[0];
  for (let i = 1; i < termNodes.length; i++) {
    result = { kind: "add", left: result, right: termNodes[i] };
  }
  if (constant !== 0) {
    result = { kind: "add", left: result, right: constNode(constant) };
  }
  return result;
}

// ── simplify ────────────────────────────────────────────────────────────

/**
 * Bounded, bottom-up simplification — see this module's own doc comment
 * for the exact, deliberately-limited rule set. Always terminates (no
 * rule ever grows the tree; every rewrite either folds two nodes into one
 * or leaves the shape unchanged) and is idempotent (`simplify(simplify(x))
 * === simplify(x)` in structural terms) — safe to call repeatedly, e.g.
 * once per `binaryOp()` call, without accumulating unbounded tree depth
 * across a long chain of operations.
 */
export function simplifySymbolic(node: SymbolicNode): SymbolicNode {
  switch (node.kind) {
    case "const":
    case "var":
      return node;

    case "neg": {
      const operand = simplifySymbolic(node.operand);
      if (operand.kind === "const") return constNode(-operand.value);
      if (operand.kind === "neg") return operand.operand; // --x -> x
      return { kind: "neg", operand };
    }

    case "add": {
      const left = simplifySymbolic(node.left);
      const right = simplifySymbolic(node.right);
      if (left.kind === "const" && right.kind === "const") return constNode(left.value + right.value);
      if (left.kind === "const" && left.value === 0) return right;
      if (right.kind === "const" && right.value === 0) return left;
      return collectTerms({ kind: "add", left, right });
    }

    case "sub": {
      const left = simplifySymbolic(node.left);
      const right = simplifySymbolic(node.right);
      if (left.kind === "const" && right.kind === "const") return constNode(left.value - right.value);
      if (right.kind === "const" && right.value === 0) return left;
      if (left.kind === "const" && left.value === 0) return simplifySymbolic({ kind: "neg", operand: right });
      return collectTerms({ kind: "sub", left, right });
    }

    case "mul": {
      const left = simplifySymbolic(node.left);
      const right = simplifySymbolic(node.right);
      if (left.kind === "const" && right.kind === "const") return constNode(left.value * right.value);
      if ((left.kind === "const" && left.value === 0) || (right.kind === "const" && right.value === 0)) return constNode(0);
      if (left.kind === "const" && left.value === 1) return right;
      if (right.kind === "const" && right.value === 1) return left;
      if (left.kind === "const" && left.value === -1) return simplifySymbolic({ kind: "neg", operand: right });
      if (right.kind === "const" && right.value === -1) return simplifySymbolic({ kind: "neg", operand: left });
      // Canonicalize a reciprocal factor into division: (1/a)*b -> b/a,
      // a*(1/b) -> a/b. A narrow display-canonicalization rule (mirrors the
      // `div` case's own common-factor cancellation above) — needed
      // because matrix multiply builds cells as `mul(matrixEntry,
      // matrixEntry)` in encounter order, so a symbolic inverse's `1/sx`
      // entry times a `vx` cell produces `(1/sx)*vx` rather than the
      // spec's own `vx/sx` — mathematically identical, just a different
      // tree shape. Not a general reciprocal-detection rule: only fires
      // when a factor is LITERALLY `1/x` (already reduced by the `div`
      // case above), never an arbitrary fraction.
      if (left.kind === "div" && left.left.kind === "const" && left.left.value === 1) {
        return simplifySymbolic({ kind: "div", left: right, right: left.right });
      }
      if (right.kind === "div" && right.left.kind === "const" && right.left.value === 1) {
        return simplifySymbolic({ kind: "div", left, right: right.right });
      }
      return { kind: "mul", left, right };
    }

    case "div": {
      const left = simplifySymbolic(node.left);
      const right = simplifySymbolic(node.right);
      if (left.kind === "const" && right.kind === "const") return constNode(left.value / right.value);
      if (right.kind === "const" && right.value === 1) return left;
      if (left.kind === "const" && left.value === 0) return constNode(0);
      // Cancel a single common factor: (a*b)/a -> b, (a*b)/b -> a. A narrow,
      // disclosed exception to "never collects through mul/div" (see this
      // module's doc comment) — needed for the symbolic-triangular-matrix-
      // inverse case (e.g. `sx*tx/sx -> tx`), not a general GCD/polynomial-
      // division capability: it only fires when the denominator is
      // STRUCTURALLY identical to one whole factor of a top-level product,
      // never a partial or nested match.
      if (left.kind === "mul") {
        if (nodesEqual(left.left, right)) return left.right;
        if (nodesEqual(left.right, right)) return left.left;
      }
      return { kind: "div", left, right };
    }
  }
}

/** Structural equality — used only by {@link simplifySymbolic}'s narrow common-factor cancellation in the `div` case. */
function nodesEqual(a: SymbolicNode, b: SymbolicNode): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "const":
      return a.value === (b as typeof a).value;
    case "var":
      return a.name === (b as typeof a).name;
    case "neg":
      return nodesEqual(a.operand, (b as typeof a).operand);
    case "add":
    case "sub":
    case "mul":
    case "div": {
      const bb = b as typeof a;
      return nodesEqual(a.left, bb.left) && nodesEqual(a.right, bb.right);
    }
  }
}

// ── Display ─────────────────────────────────────────────────────────────

/** Extracts `{coeff, name}` from a canonical `const*var`/`var*const` shape, or `null` if `node` isn't one. */
function tryExtractCoeffVar(node: SymbolicNode & { kind: "mul" }): { coeff: number; name: string } | null {
  if (node.left.kind === "const" && node.right.kind === "var") return { coeff: node.left.value, name: node.right.name };
  if (node.right.kind === "const" && node.left.kind === "var") return { coeff: node.right.value, name: node.left.name };
  return null;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e10) / 1e10);
}

/** Formats a factor — wraps a nested `add`/`sub` in parens (needed when it appears inside a `mul`/`div`/`neg`). */
function formatFactor(node: SymbolicNode): string {
  switch (node.kind) {
    case "const":
      return formatNumber(node.value);
    case "var":
      return node.name;
    case "add":
    case "sub":
      return `(${formatSymbolic(node)})`;
    case "neg":
      return `-${formatFactor(node.operand)}`;
    case "mul": {
      const coeffVar = tryExtractCoeffVar(node);
      if (coeffVar) {
        if (coeffVar.coeff === 1) return coeffVar.name;
        if (coeffVar.coeff === -1) return `-${coeffVar.name}`;
        return `${formatNumber(coeffVar.coeff)}${coeffVar.name}`;
      }
      return `${formatFactor(node.left)}*${formatFactor(node.right)}`;
    }
    case "div":
      return `${formatFactor(node.left)}/${formatFactor(node.right)}`;
  }
}

/**
 * Collects a (possibly un-simplified) `add`/`sub`/`neg` chain into signed
 * display terms — mirrors {@link flattenSum}'s traversal, but tolerant of
 * `mul`/`div`/opaque sub-nodes (rendered as one signed term via
 * {@link formatFactor} rather than requiring full flattenability).
 */
function collectDisplayTerms(node: SymbolicNode, sign: number, out: { sign: number; text: string }[]): void {
  switch (node.kind) {
    case "add":
      collectDisplayTerms(node.left, sign, out);
      collectDisplayTerms(node.right, sign, out);
      return;
    case "sub":
      collectDisplayTerms(node.left, sign, out);
      collectDisplayTerms(node.right, -sign, out);
      return;
    case "neg":
      collectDisplayTerms(node.operand, -sign, out);
      return;
    case "const": {
      if (node.value === 0) return; // an embedded zero term contributes nothing to display
      const effectiveSign = node.value < 0 ? -sign : sign;
      out.push({ sign: effectiveSign, text: formatNumber(Math.abs(node.value)) });
      return;
    }
    default:
      out.push({ sign, text: formatFactor(node) });
      return;
  }
}

/**
 * Renders a SymbolicNode as spec-matching display text — `2b` (no `*`/
 * space between a coefficient and its variable), correct sign-joining for
 * sums (`2b+6`, `x-3`, not `2b+-6`). Does not itself simplify — call
 * {@link simplifySymbolic} first for a canonical, minimal display.
 */
export function formatSymbolic(node: SymbolicNode): string {
  const terms: { sign: number; text: string }[] = [];
  collectDisplayTerms(node, 1, terms);
  if (terms.length === 0) return "0";
  let out = "";
  terms.forEach((t, i) => {
    if (i === 0) {
      out += t.sign < 0 ? `-${t.text}` : t.text;
    } else {
      out += t.sign < 0 ? `-${t.text}` : `+${t.text}`;
    }
  });
  return out;
}
