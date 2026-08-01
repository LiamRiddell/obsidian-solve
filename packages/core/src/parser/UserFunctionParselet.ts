import type { Parser } from "@solve-js/parser/Parser";
import { Token, TokenTypes } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { userFunctionRegistry } from "@solve-js/vm/UserFunctionRegistry";

/**
 * User-defined, parameterized, reusable functions — Calca-parity Phase 1
 * (`f(x) = 2*x + 1`, then `f(5)` -> `11`; see `OTHER_APPS_FEATURE_AUDIT.md`'s
 * Calca section, originally surfaced from Notes Calculator's identical
 * syntax). Called from `PrecedenceParser.ts`'s `IDENT_ID` Tier-1 case
 * directly (not from a normal registry-dispatched parselet, and NOT from
 * `packages/variables/parselets/IdentifierParselet.ts` — that class is a
 * registry-introspection shim only, since IDENT is one of the Tier-1
 * fast-path token types PrecedenceParser hardcodes and never consults the
 * `ParseletRegistry` for; see that file's own doc comment and
 * `NumberParselet.ts`'s identical, earlier-established precedent for the
 * same reason). Lives in `parser/` rather than a package directory for the
 * same reason: PrecedenceParser (a foundational, package-agnostic module)
 * cannot import from a higher-level `packages/*` directory without an
 * import cycle — matches how the bare-tuple vector literal and other
 * Tier-1 domain logic already live inline in `PrecedenceParser.ts` itself.
 *
 * Grammar disambiguation: a bare `IDENT` immediately followed by `(` is
 * ambiguous between three things until more tokens are seen —
 * - `f(x) = expr` — a DEFINITION (a trailing `=` after the matching `)`).
 * - `f(5)` — a CALL to a previously-defined function (`f` already in
 *   {@link userFunctionRegistry}).
 * - anything else — NOT this feature at all; falls through unchanged to
 *   the historical plain-variable-read + separately-grouped-`(...)`
 *   behavior (implicit-multiply territory), so code that predates this
 *   feature keeps working exactly as before.
 *
 * The one-token-past-the-matching-`)` lookahead is done via
 * {@link Parser.peekAt}, tracking paren depth so nested parens inside
 * params/args (`f(2 * (3 + 4))`) don't confuse the scan for the matching
 * close — no backtracking needed since nothing is consumed until the shape
 * is known.
 */
export function tryParseUserFunction(parser: Parser, nameToken: Token, builder: BytecodeBuilder): boolean {
  // offset 0 is the LPAREN itself (already confirmed present by the caller).
  let depth = 0;
  let offset = 0;
  for (;;) {
    const t = parser.peekAt(offset);
    if (!t) return false; // ran off the end of input -- not a well-formed shape, let the caller fall through
    if (t.type === TokenTypes.LPAREN) depth++;
    else if (t.type === TokenTypes.RPAREN) {
      depth--;
      if (depth === 0) break;
    }
    offset++;
    if (offset > 500) return false; // safety bound against pathological/malformed input
  }
  const afterClose = parser.peekAt(offset + 1);
  const isDefinition = afterClose?.type === TokenTypes.EQUALS;

  if (isDefinition) {
    parseDefinition(parser, nameToken, builder);
    return true;
  }

  // Not a definition. `IDENT` immediately followed by `(...)` with no
  // trailing `=` was NEVER valid syntax before this feature either --
  // confirmed via BuiltinNormalizerRules.ts's implicitMultiplyRule(), which
  // only fires for `NUMBER/RPAREN` immediately before `IDENT/LPAREN`, never
  // for a bare `IDENT` immediately before `LPAREN` -- so there is no
  // pre-existing "plain variable read + separately grouped (...)" behavior
  // to preserve here. Always commit to treating this as an attempted CALL;
  // an unregistered name still produces a clear "Undefined function" error
  // (see CALL_USER_FUNCTION's VM handler) instead of the far more
  // confusing generic "Unexpected token" parse error this shape used to
  // produce.
  parseCall(parser, nameToken, builder);
  return true;
}

/**
 * A parameter/argument NAME token, accepted as either `IDENT` or `UNIT` --
 * matches this codebase's established `:name = value` variable-name policy
 * (`VariableParselet.ts` explicitly accepts `UNIT`-typed tokens too, e.g.
 * `:b = 5` for the "b" bits unit) since common short parameter names like
 * `h`/`l`/`b`/`t`/`s`/`m` collide with real unit abbreviations (hour,
 * liter, bits, ton, second, meter, ...) and lex as `UNIT`, not `IDENT`.
 */
function consumeParamName(parser: Parser): string {
  const token = parser.peek();
  if (token?.type === TokenTypes.IDENT || token?.type === TokenTypes.UNIT) {
    parser.consume();
    return token.value;
  }
  throw ErrorFactory.parsing(
    "USER_FUNCTION_INVALID_PARAM_NAME",
    `Expected a parameter name but got "${token?.type ?? "end of input"}"${token ? ` ("${token.value}")` : ""}`,
    { actualType: token?.type },
  );
}

function parseDefinition(parser: Parser, nameToken: Token, builder: BytecodeBuilder): void {
  parser.consume(TokenTypes.LPAREN);
  const params: string[] = [];
  if (parser.peek()?.type !== TokenTypes.RPAREN) {
    params.push(consumeParamName(parser));
    while (parser.match(TokenTypes.COMMA)) {
      params.push(consumeParamName(parser));
    }
  }
  parser.consume(TokenTypes.RPAREN);
  parser.consume(TokenTypes.EQUALS);

  if (params.length === 0) {
    throw ErrorFactory.parsing(
      "USER_FUNCTION_NO_PARAMS",
      `"${nameToken.value}()" has no parameters -- user-defined functions need at least one (a zero-argument definition is indistinguishable from a plain function CALL with no args, which this grammar doesn't otherwise support)`,
      { name: nameToken.value },
    );
  }

  // Compile the body into its OWN independent BytecodeProgram, reusing the
  // SAME parser/token stream but directing emission into a fresh builder.
  // `setCurrentFunctionParams` makes the IDENT_ID Tier-1 case (see
  // PrecedenceParser.ts) emit LOAD_PARAM instead of LOAD_VAR for any bare
  // identifier matching one of THIS function's own parameter names, for
  // the duration of this one body-compile only -- restored in `finally`
  // no matter how parsing finishes (including a thrown parse error), since
  // it's parser-instance state, not scoped to a single call automatically.
  const bodyBuilder = new BytecodeBuilder();
  const previousParams = parser.setCurrentFunctionParams(params);
  try {
    parser.parseExpression(BindingPower.Lowest, bodyBuilder);
  } finally {
    parser.setCurrentFunctionParams(previousParams);
  }

  userFunctionRegistry.set(nameToken.value, { params, program: bodyBuilder.build() });

  // A definition line has no single input value to echo back the way an
  // assignment does -- push a plain confirmation string, matching this
  // codebase's "never silently produce a misleading numeric 0" principle.
  builder.emitOpcode(OpCode.PUSH_STRING);
  builder.emitString(`${nameToken.value}(${params.join(", ")}) defined`);
}

function parseCall(parser: Parser, nameToken: Token, builder: BytecodeBuilder): void {
  parser.consume(TokenTypes.LPAREN);
  let argCount = 0;
  if (parser.peek()?.type !== TokenTypes.RPAREN) {
    parser.parseExpression(BindingPower.Lowest, builder);
    argCount++;
    while (parser.match(TokenTypes.COMMA)) {
      parser.parseExpression(BindingPower.Lowest, builder);
      argCount++;
    }
  }
  parser.consume(TokenTypes.RPAREN);

  builder.emitOpcode(OpCode.CALL_USER_FUNCTION);
  builder.emitString(nameToken.value);
  builder.emitByte(argCount);
}
