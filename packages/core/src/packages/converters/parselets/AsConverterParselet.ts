import { InfixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";

/** Recognized `as <name>` targets that dispatch to a dedicated fast opcode. */
const BUILTIN_CONVERTERS: Record<string, OpCode> = {
  percent: OpCode.TO_PERCENTAGE,
  percentage: OpCode.TO_PERCENTAGE,
  decimal: OpCode.TO_NUMBER,
  dec: OpCode.TO_NUMBER,
  number: OpCode.TO_NUMBER,
  hex: OpCode.TO_HEX,
  fraction: OpCode.TO_FRACTION,
  multiplier: OpCode.TO_MULTIPLIER,
  sci: OpCode.TO_SCI,
  scientific: OpCode.TO_SCI,
  binary: OpCode.TO_BINARY,
  bin: OpCode.TO_BINARY,
  octal: OpCode.TO_OCTAL,
  oct: OpCode.TO_OCTAL,
};

/**
 * `<expr> as <type>` — general value/display conversion, e.g.
 * `50% as decimal` -> `0.5`, `255 as hex` -> `0xFF`, `0.5 as fraction` ->
 * `"1/2"`.
 *
 * The target-name position is read as raw token text — like UOM's `to
 * <unit>` (see `packages/uom/parselets/ConvertParselet.ts`) — never parsed
 * as a sub-expression, since "hex"/"fraction"/etc. are type names, not
 * values. `decimal`/`dec`/`number` are deliberately aliases of the same
 * TO_NUMBER opcode: this VM's Percentage representation already stores
 * the raw decimal fraction (0.5 for 50%, see vm/Value.ts's
 * percentageValue()), so "as decimal" and "as number" compute the exact
 * same thing — there's no second, distinct meaning to invent.
 *
 * Any name NOT in {@link BUILTIN_CONVERTERS} falls through to
 * `OpCode.CALL_AS_CONVERTER`, resolved at VM-execution time against
 * `vm/VMBuiltins.ts`'s `asConverterRegistry` — the
 * `IEnginePackage.asConverters` SDK extension point. `CONVERTER_NAME`
 * (this package's reserved words, via the locale's keywordMap) and bare
 * `IDENT` tokens are accepted as the target, so a third-party converter
 * name works without needing a locale change.
 *
 * `FUNC` tokens are ALSO accepted here: `hex`/`bin` do double duty as
 * both a converter name (`255 as hex`) and a Python/JS-style callable
 * builtin (`hex(255)`, see `vm/VMBuiltins.ts` indices 48/49) — a word can
 * only lex as one token type, and `FunctionCallParselet`'s call-syntax
 * needs `FUNC`, so `hex`/`bin`'s locale keywordMap entry was moved from
 * `CONVERTER_NAME` to `FUNC` and this check widened to match, rather than
 * inventing a second token type for the same two words. The only
 * observable behavior change: `<expr> as <any-other-FUNC-keyword>` (e.g.
 * `5 as sqrt`) now reaches this method instead of failing to lex — it
 * still isn't a real converter, so it now surfaces as a runtime "unknown
 * as-converter" error via `CALL_AS_CONVERTER` instead of this method's
 * parse-time `AS_CONVERTER_EXPECTED_NAME` error. No such input was ever
 * valid before or after this change.
 *
 * `UNIT` tokens are accepted for exactly the same reason, added for the
 * Datetime package's `as month` / `as week` converters: "month" and "week"
 * lex as time UNITs (they have to — `90 days in weeks`), so without this
 * they could never reach the registry. Note `as <unit>` is NOT a unit
 * conversion and never was — `100cm as m` was a parse error before this
 * widening and is an unknown-as-converter error after it; the unit-
 * conversion syntaxes are `to <unit>` and `in <unit>`.
 */
export class AsConverterParselet implements InfixParselet {
  readonly category = "Converters";
  readonly bindingPower = BindingPower.Conditional;

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    const nextToken = parser.peek();

    // "as %" — the bare percent SYMBOL, not the word "percent".
    if (nextToken?.type === "PERCENT") {
      parser.consume();
      builder.emitOpcode(OpCode.TO_PERCENTAGE);
      return;
    }

    if (
      !nextToken ||
      (nextToken.type !== "CONVERTER_NAME" &&
        nextToken.type !== "IDENT" &&
        nextToken.type !== "FUNC" &&
        nextToken.type !== "UNIT")
    ) {
      throw ErrorFactory.parsing(
        "AS_CONVERTER_EXPECTED_NAME",
        `Expected a converter name after "as" (e.g. "as hex", "as decimal") but got ${nextToken ? `"${nextToken.value}"` : "end of input"}`,
      );
    }
    parser.consume();
    const name = nextToken.value.toLowerCase();

    const builtinOp = BUILTIN_CONVERTERS[name];
    if (builtinOp !== undefined) {
      builder.emitOpcode(builtinOp);
      return;
    }

    // Not a built-in name — defer to the runtime asConverters registry so
    // third-party packages can contribute names without touching this file.
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(name);
    builder.emitOpcode(OpCode.CALL_AS_CONVERTER);
  }
}
