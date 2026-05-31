# PROJECT ETHOS — solve-js

> **This document is the single source of truth for what this project is, what it values, and how every decision is made.**
> Every AI agent working on this project must read and internalise these principles before touching code.

---

## 1. The One Line

**Sub-millisecond total processing. Nanosecond-level components. Anything slower is a bug to fix.**

Every design decision ladders up to this. The full pipeline — lex, parse, compile, execute, cache hit — must complete in under 1ms. Individual components target nanoseconds. If a change makes things slower — no matter how "clean" or "correct" it seems — it's wrong until proven otherwise.

---

## 2. Five Guiding Principles

### 2.1 Stabilise before optimising
Wrong answers fast are worse than right answers slow. Correctness first. Tests first. Benchmarks first. Then speed.

### 2.2 Commit in small chunks
Every phase produces a working, testable, committable state. No phase should be landed with failing tests. No large-bang rewrites.

### 2.3 Measure everything
No optimisation without benchmark proof. No regression without a threshold that catches it. Intuition is not a valid performance argument.

### 2.4 Backwards compatible
The plugin/parselet API must never break. Obsidian plugin users cannot be forced to update. Every change is additive or opt-in.

### 2.5 Safety first
Execution limits enforced before any performance work. A nanosecond response that can be crashed or exploited is not production-ready.

---

## 3. The Priority Stack (in order)

| Priority | What it means | When it's violated |
|----------|--------------|-------------------|
| **P0 — Correctness** | Right answers, always | Never. This is non-negotiable. |
| **P1 — Safety** | No infinite loops, no overflows, no crashes | Before any perf work |
| **P2 — Testability** | Every behaviour covered by a test | Before any refactor |
| **P3 — Sub-1ms pipeline** | Full eval pipeline < 1ms; components in nanoseconds | Before shipping |
| **P4 — Clean code** | No `any`, TSDoc on **every** exported symbol, clear module boundaries | Ongoing, never blocks shipping |
| **P5 — Extensibility** | Plugin system, custom providers, runtime loading | Post-1.0 only |

---

## 4. Current State

- **2,000+ tests** across 86+ test suites — all passing, all PascalCase named
- **9 built-in provider packages**: Arithmetic, Percentage, Function, Datetime, UoM, Vector, BigInteger, Dice, Variables
- **Sub-microsecond VM execution** on pre-built bytecode; **~1µs warm pipeline** with cached bytecode
- **Safety limits enforced** in Configuration.ts — length, complexity, nesting, instruction count, stack depth
- **PrecedenceParser** (Pratt-style with two-tier inline dispatch) as the primary parser; Parser kept for backwards compatibility
- **DAG-driven incremental re-evaluation** — changing one variable only re-executes dependent lines in topological order
- **Async streaming** via EvalResult discriminated union — no throw-based control flow in VM hot path
- **Feature flags off by default** — autoBalanceParens and other non-essential features opt-in
- **Full TSDoc coverage** — **every exported symbol** (class, interface, type, function, enum, const) carries a TSDoc comment with `@param`, `@returns`, `@throws`, and `@example` as applicable. No undocumented public surface. See `CODING_STANDARDS.md §5.4` for the complete standard.

---

## 5. Architecture in One Sentence

**The user writes natural markdown — `10 + 2`, `£100 in GBP`, `Now + 20 days` — and the engine evaluates it in real time.** For inline solves (`s\`1+2\``), the frontend renders the result directly in the document. The engine never writes back to the document — the frontend controls presentation.

The pipeline powering all of this: Raw text → Lexer → PrecedenceParser (inline dispatch) → BytecodeCompiler → VM executes against typed Value stack → Result returned to frontend. Every module in `src/solve-js/src/` exists to serve this pipeline. If a module doesn't fit here, it's in the wrong place.

---

## 6. What This Project Is NOT

- Not a general-purpose calculation library — it's an **inline expression evaluator** for a note-taking context
- Not a CAS (computer algebra system) — numeric only, no symbolic manipulation
- Not a server — it runs entirely in-process (or in-web-worker for parallelism)
- Not an AI/ML project — deterministic parsing, no learned models

---

## 7. How AI Agents Should Work Here

1. **Read this file first**, then `CODING_STANDARDS.md`
2. **Never change behaviour without a test** — existing tests are the contract
3. **Never optimise without a benchmark** — benchmark specs live in `__tests__/benchmarks/`
4. **Never add an `any` type** — if you can't type it, ask, don't punt
5. **Never bypass the error framework** — `SolveError` / `Result<T, E>` everywhere
6. **Keep it small** — one commit, one phase, one acceptance gate
7. **Measure before and after** — every change has a before/after number
8. **Think in nanoseconds** — if a function takes microseconds and is called thousands of times, it's a bottleneck. Aim for sub-microsecond on hot-path components
9. **Document every export** — no exported symbol ships without a TSDoc comment. This is non-negotiable for contributor onboarding and API discoverability.

---

*Last updated: 2026-05-31*
*This is the single source of truth for project direction and priorities.*