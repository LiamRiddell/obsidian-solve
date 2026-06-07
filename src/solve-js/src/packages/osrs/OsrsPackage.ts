import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import { osrsLexerPlugin } from "./OsrsLexerPlugin";
import { osrsItemNormalizerRule } from "./OsrsItemNormalizer";
import { GameItemParselet, OsrsKeywordParselet } from "./OsrsParselet";
import { registerOsrsPluginFunction } from "./OsrsVmHandler";
import { OsrsAsyncResolver } from "./OsrsAsyncResolver";

// Ensure the OSRS plugin function is registered before the package is used.
registerOsrsPluginFunction();

export const OSRS_PACKAGE: ISolvePackage = {
  name: "osrs",

  lexerPlugin: osrsLexerPlugin,

  normalizerRules: [
    osrsItemNormalizerRule(),
  ],

  prefixParselets: [
    { tokenType: "GAME_ITEM", parselet: new GameItemParselet() },
    { tokenType: "OSRS_KEYWORD", parselet: new OsrsKeywordParselet() },
  ],

  asyncResolvers: [
    new OsrsAsyncResolver(),
  ],
};
