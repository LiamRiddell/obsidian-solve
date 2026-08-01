import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { basicLexerVocabulary } from "./BasicLexerVocabulary";
import { ReverseKeywordParselet, REVERSE_PLUGIN_FN_IDX } from "./BasicParselet";
import { reverseString } from "./BasicVmHandler";

/**
 * Minimal worked example of an {@link IEnginePackage} — a single custom
 * keyword (`reverse("text")`) dispatched through a plugin function. See
 * `examples/osrs` for a fuller example that also covers async resolvers,
 * a custom highlight category, and completion items.
 */
export const BASIC_PACKAGE: IEnginePackage = {
  name: "basic-example",

  lexerVocabulary: basicLexerVocabulary,

  prefixParselets: [
    { tokenType: "REVERSE_KEYWORD", parselet: new ReverseKeywordParselet() },
  ],

  pluginFunctions: [
    { index: REVERSE_PLUGIN_FN_IDX, handler: reverseString },
  ],
};
