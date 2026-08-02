import { Parser } from "@solve-js/parser/Parser";
import { BytecodeBuilder, type BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { BindingPower } from "@solve-js/parser/BindingPower";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { builtinNameToIndex } from "@solve-js/packages/function/parselets/FunctionCallParselet";

/**
 * A resolved `map`/`reduce` transform — the first argument to either call.
 * `kind` matches the `MAP_INVOKE`/`REDUCE_INVOKE` opcode's own operand
 * (see `vm/VM.ts`'s handlers): 0 = an inline anonymous body (compiled to
 * its own independent `BytecodeProgram`, registered via
 * `BytecodeBuilder.emitAnonymousBody()`), 1 = a builtin function (resolved
 * at PARSE time against `FunctionCallParselet`'s own name table), 2 = a
 * user-defined function (deferred to RUNTIME — resolved dynamically via
 * `vm.getUserFunction()`, since it may be defined later in the document,
 * mirroring `CALL_USER_FUNCTION`'s own forward-reference philosophy).
 */
export type TransformSpec =
  | { kind: 0; program: BytecodeProgram }
  | { kind: 1; builtinIdx: number }
  | { kind: 2; name: string };

/**
 * Parses `map`/`reduce`'s first argument — the "transform" — disambiguating
 * a bare function-name reference from a genuine inline expression.
 *
 * SCOPE NOTE: a bare single identifier immediately followed by a comma is
 * ALWAYS interpreted as a function-name reference (builtin if known,
 * otherwise deferred as a user-defined-function reference) — NEVER as the
 * trivial "identity" inline expression that's just that one variable.
 * Every spec example uses a genuine multi-token expression (`10*x`,
 * `acc+x`) for the inline form, so this keeps the two cases unambiguous
 * with no fuzzy runtime fallback heuristics needed. The one real cost:
 * you can't write `map(x, [1,2,3])` to mean an identity map — a vanishingly
 * rare thing to want (why not just use the array directly?), and not
 * something any spec example shows.
 */
export function parseTransform(parser: Parser, builder: BytecodeBuilder): TransformSpec {
  const next = parser.peek();
  const afterNext = parser.peekAt(1);
  if (next && (next.type === "IDENT" || next.type === "UNIT" || next.type === "FUNC") && afterNext?.type === "COMMA") {
    parser.consume();
    const name = next.value;
    const builtinIdx = builtinNameToIndex[name.toLowerCase()];
    if (builtinIdx !== undefined) {
      return { kind: 1, builtinIdx };
    }
    return { kind: 2, name };
  }

  // Genuine inline expression — compiled into its OWN independent
  // BytecodeProgram, exactly like a user-defined function's body
  // (PrecedenceParser.ts's parseUserFunctionDefinition): parseExpression()
  // sets `this.builder` to the isolated builder with NO automatic
  // restore, so setBuilder(builder) explicitly restores it afterward.
  const transformBuilder = new BytecodeBuilder();
  parser.parseExpression(BindingPower.Lowest, transformBuilder);
  parser.setBuilder(builder);
  const program = transformBuilder.build();
  if (program.hasAsync) {
    throw ErrorFactory.parsing(
      "MAP_REDUCE_TRANSFORM_MUST_BE_SYNCHRONOUS",
      `map/reduce transform expressions must be synchronous (no weather/stocks/currency calls).`,
    );
  }
  return { kind: 0, program };
}

/** Whether the upcoming argument uses the explicit zipped `name=collection` form (peek-only, nothing consumed). */
export function isZippedCollectionForm(parser: Parser): boolean {
  const next = parser.peek();
  const afterNext = parser.peekAt(1);
  return !!next && (next.type === "IDENT" || next.type === "UNIT") && afterNext?.type === "EQUALS";
}

/** Consumes a zipped-form collection name (`name` in `name=collection`). */
export function consumeCollectionName(parser: Parser): string {
  const token = parser.peek();
  if (token && (token.type === "IDENT" || token.type === "UNIT")) {
    parser.consume();
    return token.value;
  }
  throw ErrorFactory.parsing(
    "MAP_REDUCE_EXPECTED_COLLECTION_NAME",
    `Expected a collection name (e.g. "x" in "x=[1,2,3]") but got ${token ? `"${token.value}"` : "end of input"}.`,
  );
}

/**
 * Parses one "collection" argument — a plain expression, or `expr : expr`
 * for a bare Range (`map(f, 0:3)`'s own spec example) — hand-consuming the
 * `:` locally exactly like `MatrixIndexParselet` does, for the same
 * reason: a general infix COLON operator would break the shipped
 * labeled-line fallback feature (see that parselet's own doc comment for
 * the full explanation).
 */
export function parseCollectionExpr(parser: Parser, builder: BytecodeBuilder): void {
  parser.parseExpression(0, builder);
  if (parser.match("COLON")) {
    parser.parseExpression(0, builder);
    builder.emitOpcode(OpCode.RANGE_NEW);
  }
}

/**
 * Emits a resolved transform + its `MAP_INVOKE`/`REDUCE_INVOKE` opcode —
 * `kind`/`ref` are common to both opcodes; `thirdOperand` is
 * `collectionCount` for `MAP_INVOKE` or `hasInitial` (0|1) for
 * `REDUCE_INVOKE`. Registers an inline (kind 0) body into `builder`'s own
 * `anonymousBodies` side-table only NOW — after every collection argument
 * has already been parsed — so `paramNames` (fixed `["acc","x"]` for
 * reduce, or the zipped-form's declared names for map) is fully known.
 */
export function emitInvoke(
  builder: BytecodeBuilder,
  opcode: OpCode.MAP_INVOKE | OpCode.REDUCE_INVOKE,
  transform: TransformSpec,
  paramNames: string[],
  thirdOperand: number,
): void {
  builder.emitOpcode(opcode);
  builder.emitIndex(transform.kind);
  if (transform.kind === 0) {
    const idx = builder.emitAnonymousBody(paramNames, transform.program);
    builder.emitIndex(idx);
  } else if (transform.kind === 1) {
    builder.emitIndex(transform.builtinIdx);
  } else {
    builder.emitString(transform.name);
  }
  builder.emitIndex(thirdOperand);
}
