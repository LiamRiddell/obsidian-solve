import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/**
 * A single slot in a phrase-grammar alternative.
 *
 * - `keyword`: consumes exactly one token whose type is in `tokenTypes`. Its
 *   matched token is recorded in the `captures` array passed to `emit()`
 *   (in slot order) — this is how an alternative distinguishes "between X
 *   and Y" from "from X to Y" if it needs to.
 * - `expr`: parses a full sub-expression via `parser.parseExpression()`.
 *   Its bytecode is emitted inline, in slot order, exactly like a
 *   hand-written parselet calling `parseExpression()` directly. Not
 *   recorded in `captures` (there's no single token to record).
 */
export type PhraseSlot =
  | { kind: "keyword"; tokenTypes: string[] }
  | { kind: "expr"; bindingPower?: number };

/** A keyword slot's matched token, recorded for `emit()` to inspect. */
export interface PhraseCapture {
  type: string;
  value: string;
}

/**
 * One alternative phrasing of a pattern. The FIRST slot must be a
 * `keyword` slot — this is what lets {@link definePhrasePattern} choose
 * which alternative applies via a single `parser.peek()`, before
 * consuming or emitting anything. Bytecode is append-only
 * ({@link BytecodeBuilder} has no rollback), so an alternative can only be
 * committed to, never speculatively tried and abandoned — every phrase
 * grammar in this codebase is naturally leading-keyword-disambiguated
 * (that's what makes it parseable as a phrase at all), so this is not a
 * real limitation in practice.
 */
export interface PhraseAlternative {
  slots: PhraseSlot[];
  /**
   * Called once every slot has been consumed (and every `expr` slot's
   * bytecode already emitted, in slot order). Emit whatever final
   * opcode(s) turn the already-pushed operands into a result here —
   * e.g. `builder.emitOpcode(OpCode.CALL_BUILTIN); builder.emitIndex(...)`.
   */
  emit(builder: BytecodeBuilder, captures: PhraseCapture[]): void;
}

/**
 * Build a {@link PrefixParselet} from a declarative list of phrase
 * alternatives, instead of hand-writing `parser.consume()`/
 * `parser.parseExpression()` call sequences.
 *
 * Covers the "keyword slot keyword slot keyword" shape shared by most of
 * this codebase's phrase-grammar parselets (`roll between X and Y`,
 * `clamp X between Y and Z`, `average of X, Y, Z`'s single-item case,
 * etc.) with one well-tested consumption/error-handling core, rather than
 * each parselet re-deriving its own — the class of bug this is meant to
 * prevent (a hand-rolled parselet mishandling an alternative-phrasing or
 * precedence edge case) is exactly what produced real, shipped bugs this
 * session (Dice's bare-hyphen range, Vector's tuple-vs-group ambiguity).
 *
 * @example
 * ```ts
 * // "roll between X and Y" / "roll from X to Y"
 * definePhrasePattern({
 *   category: "Dice",
 *   alternatives: [
 *     {
 *       slots: [
 *         { kind: "keyword", tokenTypes: ["BETWEEN"] },
 *         { kind: "expr" },
 *         { kind: "keyword", tokenTypes: ["AND"] },
 *         { kind: "expr" },
 *       ],
 *       emit: (builder) => {
 *         builder.emitOpcode(OpCode.CALL_BUILTIN);
 *         builder.emitIndex(DICE_ROLL_BUILTIN);
 *         builder.emitIndex(2);
 *       },
 *     },
 *   ],
 * });
 * ```
 */
export function definePhrasePattern(opts: {
  category: string;
  alternatives: PhraseAlternative[];
}): PrefixParselet {
  for (const alt of opts.alternatives) {
    const first = alt.slots[0];
    if (!first || first.kind !== "keyword") {
      throw ErrorFactory.config(
        "INVALID_PHRASE_PATTERN",
        "Every PhraseAlternative's first slot must be a `keyword` slot — alternatives are chosen by peeking the next token, which only works if the choice is decidable from one leading keyword.",
        { category: opts.category }
      );
    }
  }

  return {
    category: opts.category,
    parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
      const next = parser.peek();
      const alternative = opts.alternatives.find((alt) => {
        const first = alt.slots[0] as { kind: "keyword"; tokenTypes: string[] };
        return next !== undefined && first.tokenTypes.includes(next.type);
      });

      if (!alternative) {
        const expected = opts.alternatives
          .map((alt) => (alt.slots[0] as { kind: "keyword"; tokenTypes: string[] }).tokenTypes.join("|"))
          .join(", ");
        throw ErrorFactory.parsing(
          "NO_MATCHING_PHRASE_ALTERNATIVE",
          `Expected one of [${expected}] but got "${next?.type ?? "end of input"}" ("${next?.value ?? ""}")`,
          { category: opts.category, expected, actualType: next?.type, actualValue: next?.value }
        );
      }

      const captures: PhraseCapture[] = [];
      for (const slot of alternative.slots) {
        if (slot.kind === "keyword") {
          const token = parser.peek();
          if (!token || !slot.tokenTypes.includes(token.type)) {
            throw ErrorFactory.parsing(
              "PHRASE_KEYWORD_MISMATCH",
              `Expected one of [${slot.tokenTypes.join("|")}] but got "${token?.type ?? "end of input"}" ("${token?.value ?? ""}")`,
              { category: opts.category, expected: slot.tokenTypes, actualType: token?.type, actualValue: token?.value }
            );
          }
          parser.consume();
          captures.push({ type: token.type, value: token.value });
        } else {
          parser.parseExpression(slot.bindingPower ?? 0, builder);
        }
      }

      alternative.emit(builder, captures);
    },
  };
}
