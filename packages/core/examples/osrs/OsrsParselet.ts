import { PrefixParselet } from "@solve-js/parser/Parselet";
import { Parser } from "@solve-js/parser/Parser";
import { Token } from "@solve-js/lexer/Token";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";
import { OpCode } from "@solve-js/parser/OpCode";
import { allocatePluginFunctionIndex } from "@solve-js/vm/VMBuiltins";
import { ErrorFactory } from "@solve-js/errors/UnifiedErrorFramework";
import { GAME_ITEM_TYPE } from "./OsrsItemNormalizer";
import { stripQuotes } from "@solve-js/utilities/Strings";

/** Index in pluginFunctionRegistry for the OSRS resolveGameItem function. */
export const OSRS_PLUGIN_FN_IDX: number = allocatePluginFunctionIndex();

/** Prefix parselet for GAME_ITEM tokens. The token parameter IS the consumed GAME_ITEM token. */
export class GameItemParselet implements PrefixParselet {
  readonly category = "OSRS";

  parse(parser: Parser, token: Token, builder: BytecodeBuilder): void {
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(token.value);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(OSRS_PLUGIN_FN_IDX);
    builder.emitIndex(1); // argCount = 1 (the item name string)
  }
}

/**
 * Prefix parselet for OSRS_KEYWORD tokens.
 *
 * Supports three syntax forms:
 *   - `osrs Iron Axe`       — keyword + GAME_ITEM (item name fused by normalizer)
 *   - `ge("Iron Axe")`      — function-call style with quoted item name
 *   - `osrs price of Abyssal Whip` — keyword with optional filler words
 */
export class OsrsKeywordParselet implements PrefixParselet {
  readonly category = "OSRS";

  parse(parser: Parser, _token: Token, builder: BytecodeBuilder): void {
    const next = parser.peek();

    // ── Dot-notation: osrs.ge(Iron Axe) / osrs.price("Abyssal Whip") ──
    if (next?.type === "DOT") {
      parser.consume("DOT"); // consume DOT
      parser.consume();        // consume method name (IDENT like "ge", "price")
      parser.consume("LPAREN");

      const arg = parser.peek();
      let itemName: string;

      if (arg?.type === "STRING") {
        // osrs.ge("Iron Axe")
        parser.consume();
        itemName = stripQuotes(arg.value);
      } else if (arg?.type === GAME_ITEM_TYPE) {
        // osrs.ge(Iron Axe) — normalizer fused bare item name to GAME_ITEM
        parser.consume(GAME_ITEM_TYPE);
        itemName = arg.value;
      } else {
        // Unknown argument — surface a parse error rather than silently
        // pushing 0, which read as a real (and wrong) price of zero gp.
        throw ErrorFactory.parsing(
          "OSRS_INVALID_ARGUMENT",
          `Expected a quoted item name or item reference inside osrs.ge(...)/osrs.price(...), got ${arg?.type ?? "nothing"}`,
          { tokenType: arg?.type }
        );
      }

      parser.consume("RPAREN");
      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(itemName);
      builder.emitOpcode(OpCode.CALL_PLUGIN);
      builder.emitIndex(OSRS_PLUGIN_FN_IDX);
      builder.emitIndex(1);
      return;
    }

    // ── Function-call syntax: ge("Iron Axe") / osrs("Iron Axe") ──
    if (next?.type === "LPAREN") {
      parser.consume(); // consume LPAREN
      const stringToken = parser.consume(); // consume STRING
      parser.consume("RPAREN"); // consume RPAREN

      const itemName = stripQuotes(stringToken.value);

      builder.emitOpcode(OpCode.PUSH_STRING);
      builder.emitString(itemName);
      builder.emitOpcode(OpCode.CALL_PLUGIN);
      builder.emitIndex(OSRS_PLUGIN_FN_IDX);
      builder.emitIndex(1);
      return;
    }

    // ── Filler words: price / of ──
    // "price" may be IDENT (if not a registered keyword) or OSRS_KEYWORD
    // (if registering the price→OSRS_KEYWORD mapping for function-call syntax).
    if ((next?.type === "IDENT" || next?.type === "OSRS_KEYWORD")
        && next.value.toLowerCase() === "price") {
      parser.consume();
    }
    if (parser.peek()?.type === "OF") {
      parser.consume("OF");
    }

    // ── Keyword + GAME_ITEM path: osrs Iron Axe ──
    const itemToken = parser.peek();
    if (!itemToken || itemToken.type !== GAME_ITEM_TYPE) {
      // No recognized item name followed "osrs" — surfacing a parse error
      // instead of silently pushing 0, which read as a real (and wrong)
      // price of zero gp for whatever was typed.
      // The bare `osrs Iron Axe` form below is grammatically supported, but
      // isn't reliably reachable in practice (e.g. the playground's own
      // line classifier treats a plain "osrs Iron Axe" line as prose and
      // never evaluates it at all) and isn't shown anywhere as a documented
      // example. Only advertise the function-call form here, since that's
      // the one that's actually discoverable and works everywhere.
      throw ErrorFactory.parsing(
        "OSRS_MISSING_ITEM_NAME",
        itemToken
          ? `Expected an OSRS item name after 'osrs', got "${itemToken.value}"`
          : `Expected an OSRS item name after 'osrs', e.g. osrs("Iron Axe")`,
        { tokenType: itemToken?.type }
      );
    }

    parser.consume(GAME_ITEM_TYPE);
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(itemToken.value);
    builder.emitOpcode(OpCode.CALL_PLUGIN);
    builder.emitIndex(OSRS_PLUGIN_FN_IDX);
    builder.emitIndex(1);
  }
}
