/**
 * Parser type — re-exports PrecedenceParser for convenience.
 *
 * The legacy Parser class has been removed in favor of the optimized
 * PrecedenceParser (two-tier dispatch: inline switch for built-ins,
 * ParseletRegistry fallback for plugins). This re-export preserves
 * the `Parser` name for existing parselet type annotations.
 */
export { PrecedenceParser as Parser } from "./PrecedenceParser";
