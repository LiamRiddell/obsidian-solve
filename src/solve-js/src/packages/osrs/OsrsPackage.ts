import type { ISolvePackage } from "@solve-js/api/SolveAPI";
import { osrsLexerPlugin } from "./OsrsLexerPlugin";
import { osrsItemNormalizerRule } from "./OsrsItemNormalizer";
import { GameItemParselet, OsrsKeywordParselet } from "./OsrsParselet";
import { registerOsrsPluginFunction } from "./OsrsVmHandler";
import { OsrsAsyncResolver } from "./OsrsAsyncResolver";
import { OSRS_ITEMS } from "./OsrsItemVocabulary";

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

  // "osrs-item" is a plugin-defined category (not one of the built-in
  // SolveTokenCategory values) — proves categories are genuinely
  // open-ended, and gets a matching `cm-solve-osrs-item` CSS class "for
  // free" from the CodeMirror adapter's `cm-solve-${category}` convention,
  // no adapter changes required.
  tokenCategories: {
    OSRS_KEYWORD: "keyword",
    GAME_ITEM: "osrs-item",
  },

  // Real (if currently stub-sized, pending the generated ~3,800-item list)
  // item-name completions — proves ISolvePackage.completionItems works
  // end-to-end the same way tokenCategories's "osrs-item" did for
  // highlighting. Scales automatically once OsrsItemVocabulary.ts grows;
  // no changes needed here.
  completionItems: OSRS_ITEMS.map((item) => ({
    label: item.name,
    category: "osrs-item",
    detail: "OSRS item",
  })),
};
