import { ILocale } from "./en";

/**
 * French locale — see GitHub issue #77 ("Please allow for localized day
 * of the week"). Matches `de.ts`'s scope, not `en.ts`'s full coverage: a
 * confident, reviewed core set (arithmetic words, date keywords, weekday
 * names, a handful of common functions), not a guess at every FUNC/phrase
 * keyword across every package. Widening this is a good first issue for
 * a native French speaker — PRs welcome, same as this project's existing
 * convention for locale gaps.
 *
 * "aujourd'hui" (today) is deliberately spelled without its apostrophe
 * here (`aujourdhui`) — `ExpressionLexer`'s identifier reader only
 * accepts `[a-zA-Z_][a-zA-Z0-9_]*` plus Unicode, so the standard spelling
 * can't lex as a single IDENT token at all. This is a real, disclosed
 * limitation, not a translation choice — anyone typing the standard
 * apostrophed spelling won't get a match today.
 */
export const frLocale: ILocale = {
  code: "fr",
  label: "Français",
  keywordMap: {
    pi: "PI", e: "E",
    plus: "PLUS", ajouter: "PLUS", et: "PLUS",
    moins: "MINUS", soustraire: "MINUS", enlever: "MINUS",
    fois: "STAR", multiplier: "STAR",
    diviser: "SLASH",
    modulo: "MOD", mod: "MOD",
    exposant: "CARET", puissance: "CARET",
    xor: "BIT_XOR",
    maintenant: "NOW",
    // "aujourd'hui" — see this file's own doc comment for why the
    // apostrophe is dropped here.
    aujourdhui: "TODAY",
    demain: "TOMORROW", hier: "YESTERDAY",
    lancer: "ROLL",
    // Same spellings as English on purpose, not a translation gap: the
    // FUNC token's NAME is looked up in a separate, locale-independent
    // dispatch table (FunctionCallParselet.ts's builtinNameToIndex) that
    // only knows English names — "racine" (root) would lex fine as a
    // FUNC token via this keywordMap but then fail at call time with
    // "Unknown function", so it's deliberately left out rather than
    // shipped half-working. Widening that dispatch table to be
    // locale-aware is a separate, larger change (it would need the same
    // fix for German too — "wurzel" has this identical problem today).
    abs: "FUNC", sin: "FUNC", cos: "FUNC", tan: "FUNC",
    log: "FUNC", min: "FUNC", max: "FUNC",
    convertir: "CONVERT",
    prochain: "NEXT", dernier: "LAST",
    dimanche: "SUNDAY", lundi: "MONDAY", mardi: "TUESDAY", mercredi: "WEDNESDAY",
    jeudi: "THURSDAY", vendredi: "FRIDAY", samedi: "SATURDAY",
    entre: "BETWEEN",
    augmenter: "INCREASE", diminuer: "DECREASE",
    vec2: "VEC2", vec3: "VEC3", vec4: "VEC4",
    vrai: "TRUE", faux: "FALSE",
    si: "IF", alors: "THEN", sinon: "ELSE",
  },
  display: {
    resultPrefix: "= ",
    dateFormat: "default",
    decimalSeparator: ",",
    thousandsSeparator: " ",
    vectorFormat: "[{values}]",
    percentageSuffix: "%",
  },
};
