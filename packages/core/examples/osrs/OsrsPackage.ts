import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { osrsLexerVocabulary } from "./OsrsLexerVocabulary";
import { osrsItemNormalizerRule } from "./OsrsItemNormalizer";
import { GameItemParselet, OsrsKeywordParselet, OSRS_PLUGIN_FN_IDX } from "./OsrsParselet";
import { resolveGameItem } from "./OsrsVmHandler";
import { OsrsAsyncResolver } from "./OsrsAsyncResolver";
import { OSRS_ITEMS } from "./OsrsItemVocabulary";

export const OSRS_PACKAGE: IEnginePackage = {
  name: "osrs",

  // Demonstrates IEnginePackage.engineVersion for third-party package
  // authors reading this example — not because OSRS itself needs a real
  // floor. See PackageRegistry.ts's engineVersion doc comment and
  // ARCHITECTURE.md §5.3.
  engineVersion: "^0.1.0",

  lexerVocabulary: osrsLexerVocabulary,

  normalizerRules: [
    osrsItemNormalizerRule(),
  ],

  prefixParselets: [
    { tokenType: "GAME_ITEM", parselet: new GameItemParselet() },
    { tokenType: "OSRS_KEYWORD", parselet: new OsrsKeywordParselet() },
  ],

  // Dispatched via CALL_PLUGIN bytecode (see OsrsParselet.ts) — registered
  // and unregistered by ExpressionEngine alongside this package's other
  // shared-registry contributions, instead of a standalone module-level
  // side effect.
  pluginFunctions: [
    { index: OSRS_PLUGIN_FN_IDX, handler: resolveGameItem },
  ],

  asyncResolvers: [
    new OsrsAsyncResolver(),
  ],

  // "osrs-item" is a plugin-defined category (not one of the built-in
  // TokenCategory values) — proves categories are genuinely
  // open-ended, and gets a matching `cm-solve-osrs-item` CSS class "for
  // free" from the CodeMirror adapter's `cm-solve-${category}` convention,
  // no adapter changes required.
  tokenCategories: {
    OSRS_KEYWORD: "keyword",
    GAME_ITEM: "osrs-item",
  },

  // Real (if currently stub-sized, pending the generated ~3,800-item list)
  // item-name completions — proves IEnginePackage.completionItems works
  // end-to-end the same way tokenCategories's "osrs-item" did for
  // highlighting. Scales automatically once OsrsItemVocabulary.ts grows;
  // no changes needed here.
  completionItems: OSRS_ITEMS.map((item) => ({
    label: item.name,
    category: "osrs-item",
    detail: "OSRS item",
  })),
};
