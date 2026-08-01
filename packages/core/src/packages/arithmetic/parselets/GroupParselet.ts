import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";

/**
 * Parses a parenthesized prefix expression starting at `(`.
 *
 * `(1 + 2)` is plain grouping for precedence. `(x, y)` / `(x, y, z)` /
 * `(x, y, z, w)` is the bare-tuple vector literal documented as an
 * alternative to `vec2(...)`/`vec3(...)`/`vec4(...)` (wiki:
 * Arithmetic/Vector). Both forms share the LPAREN token, so this one
 * parselet must own both: the Vector package never registers its own
 * LPAREN handler, which would otherwise silently win or lose depending on
 * package registration order (ParseletRegistry has no collision detection).
 */
export class GroupParselet implements PrefixParselet {
	readonly category = "Arithmetic";

	parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    parser.parseExpression(0, builder);
    let count = 1;
    while (parser.match("COMMA")) {
      parser.parseExpression(0, builder);
      count++;
    }
    parser.consume("RPAREN");
    if (count > 1) {
      builder.emitOpcode(OpCode.ARR_NEW);
      builder.emitIndex(count);
    }
  }
}
