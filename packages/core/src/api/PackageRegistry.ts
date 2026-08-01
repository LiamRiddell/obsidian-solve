import { sharedParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { PrefixParselet, InfixParselet } from "@solve-js/parser/Parselet";
import { Value } from "@solve-js/vm/Value";
import { IVariableSource } from "@solve-js/variables/IVariableSource";
import { sharedVariableResolver } from "@solve-js/variables/VariableResolver";
import { sharedLexer } from "@solve-js/lexer/Lexer";
import type { LexerVocabulary } from "@solve-js/lexer/ExpressionLexer";
import type { IAsyncResolver } from "@solve-js/resolvers/ResolverRegistry";
import type { NormalizerRule } from "@solve-js/normalizer/NormalizerRule";
import type { TokenCategory } from "@solve-js/language/TokenCategory";
import type { CompletionItem } from "@solve-js/language/LanguageService";
import type { LineExecutionContext } from "@solve-js/vm/VM";
import { assertEngineVersionCompatible } from "./EngineVersionCompatibility";

/**
 * Public API for registering plugins with the solve-js engine.
 *
 * All registration goes through this interface — parselets, variable
 * sources, and full packages. The default implementation is
 * {@link PackageRegistry} (singleton via {@link packageRegistry}).
 *
 * @example
 * ```typescript
 * import { packageRegistry } from "@solve/core";
 * packageRegistry.registerPackage(myCustomPackage);
 * ```
 */
export interface IPackageRegistry {
  /** Register a prefix parselet (e.g., `GE`, `NOW`, `floor`). */
  registerPrefixParselet(tokenType: string, parselet: PrefixParselet): void;
  /** Register an infix parselet (e.g., `+`, `in`, `to`). */
  registerInfixParselet(tokenType: string, parselet: InfixParselet): void;
  /** Register a variable source (provides variable values at runtime). */
  registerVariableSource(source: IVariableSource): void;
  /** Register a complete package (parselets + variable sources). */
  registerPackage(pkg: IEnginePackage): void;
  /** Convenience reference to the Value class for creating typed values. */
  Value: typeof Value;
}

/**
 * Package descriptor for registering a complete provider with the engine.
 *
 * A package bundles all the pieces needed for a domain-specific provider:
 * lexer plugins for custom token recognition, parselets for Pratt parsing,
 * plugin functions dispatched via CALL_PLUGIN bytecode, variable sources,
 * and optional async resolvers for data that loads asynchronously (e.g.,
 * exchange rates, game prices).
 *
 * @example
 * ```typescript
 * const myPackage: IEnginePackage = {
 *   name: "MyProvider",
 *   lexerVocabulary: myLexerVocabulary,
 *   prefixParselets: [{ tokenType: "MY_FUNC", parselet: new MyParselet() }],
 *   pluginFunctions: [{ index: MY_FN_IDX, handler: myHandler }],
 *   asyncResolvers: [myAsyncResolver],
 * };
 * packageRegistry.registerPackage(myPackage);
 * ```
 */
export interface IEnginePackage {
  /** Human-readable name for debugging and error attribution. */
  name: string;
  /**
   * Semver range of `@solve/core` versions this package is compatible with
   * (e.g. `"^0.1.0"`, `">=0.1.0 <0.3.0"`), checked against the engine's own
   * running version ({@link ENGINE_VERSION}, `@solve-js/constants/version`)
   * via `checkEngineVersionCompatibility()`/`assertEngineVersionCompatible()`
   * (`@solve-js/api/EngineVersionCompatibility`) at registration time.
   *
   * Optional — omitted means "no declared constraint," so every package
   * that predates this field (all built-ins, `examples/osrs`) keeps
   * registering exactly as before.
   *
   * Unlike every other compatibility signal in this codebase (e.g.
   * `checkPackageCompatibility()`'s sibling-package collision warnings,
   * which always log and proceed — see `api/PackageCompatibility.ts`), a
   * declared `engineVersion` range the running engine does NOT satisfy is
   * a deliberate, hard REJECTION: `registerPackage()` throws rather than
   * warning. See `ARCHITECTURE.md` §5.3.
   */
  engineVersion?: string;
  /** Optional lexer vocabulary (keywords/operators/units) for recognizing custom tokens (e.g., `GE`, `£`). */
  lexerVocabulary?: LexerVocabulary;
  /** Prefix parselets for this package's custom functions/operators. */
  prefixParselets?: Array<{ tokenType: string; parselet: PrefixParselet }>;
  /** Infix parselets for this package's custom binary operators. */
  infixParselets?: Array<{ tokenType: string; parselet: InfixParselet }>;
  /**
   * Functions dispatched via CALL_PLUGIN bytecode (emitted by this package's
   * parselets with `builder.emitIndex(index)`).
   *
   * Each entry's `index` MUST come from {@link allocatePluginFunctionIndex}
   * (`@solve-js/vm/VMBuiltins`) — never hardcode a number. Two packages
   * independently picking the same index would silently overwrite each
   * other's handler in the shared registry.
   *
   * The handler's optional second parameter, `context`, carries the
   * current line's {@link LineExecutionContext} (line number, and — only
   * inside a real document, never `evaluateExpression()`'s single-shot
   * path — closures for reading another line's cached result). Every
   * handler that doesn't need cross-line data can ignore it entirely.
   *
   * @example
   * ```ts
   * const MY_FN_IDX = allocatePluginFunctionIndex();
   * // In a parselet's parse(): builder.emitOpcode(OpCode.CALL_PLUGIN); builder.emitIndex(MY_FN_IDX); builder.emitIndex(argCount);
   * pluginFunctions: [{ index: MY_FN_IDX, handler: myHandler }]
   * ```
   */
  pluginFunctions?: Array<{ index: number; handler: (args: Value[], context?: LineExecutionContext) => Value | Promise<Value> }>;
  /** Variable sources that provide values at runtime. */
  variableSources?: IVariableSource[];
  /**
   * Async resolvers for this package's domain.
   * When set, the ExpressionEngine runs preflight() before VM execution
   * for each resolver. If async data is needed, a Pending result is
   * returned immediately and the line re-evaluates when the data resolves.
   *
   * Each resolver must have a unique `namespace` — the ResolverRegistry
   * is keyed by namespace. Multiple resolvers let a package handle
   * distinct async operations (e.g., `fetch`, `wait`, `poll`) in
   * separate, focused classes rather than one monolithic preflight().
   */
  asyncResolvers?: IAsyncResolver[];
  /**
   * Multi-word phrases to fuse into single compound tokens.
   * Each key is a space-separated phrase (e.g., "to the power of"),
   * each value is the target token type after fusion (e.g., "CARET").
   *
   * Registered into the engine's {@link PhraseTrie} for single-pass
   * O(depth) matching — no separate rule scanning per phrase.
   *
   * @example
   * ```ts
   * phrases: {
   *   "to the power of": "CARET",
   *   "abyssal whip": "ITEM",
   * }
   * ```
   */
  phrases?: Record<string, string>;
  /**
   * Normalizer rules for post-lexer token transformation.
   * Applied by the TokenNormalizer between lexing and parsing.
   * For phrase fusion, prefer the declarative {@link phrases} field
   * which uses the faster PhraseTrie. Use this for non-phrase rules
   * like implicit operator insertion.
   */
  normalizerRules?: NormalizerRule[];
  /**
   * Semantic highlight categories for this package's custom token types
   * (introduced via {@link lexerVocabulary} or {@link normalizerRules}) — the
   * plugin-facing half of solve-js's editor-agnostic language service (see
   * `language/TokenCategoryMap.ts`). Without an entry here, a package's
   * custom tokens (e.g. a game-item name fused from several identifiers)
   * are still lexed and parsed correctly, but render with no highlight
   * category in any editor integration.
   *
   * @example
   * ```ts
   * tokenCategories: { MY_KEYWORD: "keyword", MY_ITEM: "my-plugin-item" }
   * ```
   */
  tokenCategories?: Record<string, TokenCategory>;
  /**
   * Completion candidates for this package — the plugin-facing half of
   * solve-js's editor-agnostic completions API
   * (`LanguageService.getCompletions()`). A package's single-word
   * keywords (via {@link lexerVocabulary}) already flow into completions
   * automatically; this field is for candidates that AREN'T lexer
   * keywords, such as a vocabulary of item/entity names. A plain,
   * pre-built list, not a callback — completion candidate lists are
   * meant to be cheap and static within one engine configuration.
   *
   * @example
   * ```ts
   * completionItems: [{ label: "Abyssal whip", category: "my-plugin-item", detail: "Item" }]
   * ```
   */
  completionItems?: CompletionItem[];
  /**
   * Custom `as <name>` converters — the extension point for the
   * Converters package's general `<expr> as <type>` grammar (e.g.
   * `50% as decimal`, `255 as hex`). The built-in converter names
   * (`percent`, `decimal`, `hex`, `fraction`, `multiplier`, `sci`,
   * `binary`, `octal`, ...) dispatch to dedicated fast opcodes; anything
   * else — including any name a third-party package registers here —
   * resolves through `OpCode.CALL_AS_CONVERTER` against
   * `vm/VMBuiltins.ts`'s `asConverterRegistry` at runtime. No lexer
   * keyword registration is needed for a custom name: the AS parselet
   * accepts any bare-word token after "as" and reads its raw text.
   *
   * Each handler is a pure, synchronous `(value: Value) => Value` — for
   * async conversions (e.g. a live currency-style lookup), use
   * {@link asyncResolvers} instead.
   *
   * @example
   * ```ts
   * asConverters: { roman: (v) => stringValue(toRomanNumeral(v.toNumber())) }
   * ```
   */
  asConverters?: Record<string, (value: Value) => Value>;
}

/**
 * Default implementation of {@link IPackageRegistry} — the plugin registration API.
 *
 * All registrations delegate to shared singletons (parselet registry,
 * variable resolver, lexer). This ensures that packages registered through
 * any PackageRegistry instance are visible engine-wide.
 *
 * @example
 * ```typescript
 * import { packageRegistry } from "@solve/core";
 *
 * // Register a complete provider package
 * packageRegistry.registerPackage({
 *   name: "MyProvider",
 *   prefixParselets: [{ tokenType: "MY_FUNC", parselet: new MyParselet() }],
 * });
 * ```
 */
export class PackageRegistry implements IPackageRegistry {
  Value = Value;

  registerPrefixParselet(tokenType: string, parselet: PrefixParselet): void {
    sharedParseletRegistry.registerPrefix(tokenType, parselet);
  }

  registerInfixParselet(tokenType: string, parselet: InfixParselet): void {
    sharedParseletRegistry.registerInfix(tokenType, parselet);
  }

  registerVariableSource(source: IVariableSource): void {
    sharedVariableResolver.registerSource(source);
  }

  registerPackage(pkg: IEnginePackage): void {
    // Same hard engine-version gate ExpressionEngine.registerPackage() uses
    // (see its own comment and ARCHITECTURE.md §5.3) — this weaker,
    // shared-singleton path had no compatibility checking of any kind
    // before this, so without this call the version gate would be
    // trivially bypassable through this entry point.
    assertEngineVersionCompatible(pkg);

    if (pkg.lexerVocabulary) {
      sharedLexer.registerVocabulary(pkg.lexerVocabulary);
    }
    if (pkg.prefixParselets) {
      for (const pp of pkg.prefixParselets) {
        this.registerPrefixParselet(pp.tokenType, pp.parselet);
      }
    }
    if (pkg.infixParselets) {
      for (const ip of pkg.infixParselets) {
        this.registerInfixParselet(ip.tokenType, ip.parselet);
      }
    }
    if (pkg.variableSources) {
      for (const vs of pkg.variableSources) {
        this.registerVariableSource(vs);
      }
    }
    // Note: asyncResolvers are NOT registered here — the shared PackageRegistry singleton
    // doesn't have a ResolverRegistry (that lives inside ExpressionEngine).
    // Use ExpressionEngine.registerPackage() directly if you need async resolvers.
  }
}

/**
 * Singleton PackageRegistry instance — the default plugin registration API.
 *
 * All packages should register through this instance. The underlying registries
 * are shared singletons, so multiple PackageRegistry instances would be redundant.
 */
export const packageRegistry = new PackageRegistry();
