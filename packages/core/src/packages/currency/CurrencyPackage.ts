import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { CurrencySymbolParselet } from "./parselets/CurrencySymbolParselet";
import { InParselet } from "./parselets/InParselet";
import { CurrencyAsyncResolver } from "@solve-js/uom/CurrencyResolver";

/**
 * Currency: `$10`, `£10`, `€10`, `¥10`, `₽10`, `₩10`, `₹10`, `₺10`, `₴10`,
 * `₪10`, `₫10`, `₦10`, `₱10`, `10 USD in GBP`, and word forms like
 * `10 euros`/`10 dollars` (see `uom/CurrencyAliases.ts` for the full
 * symbol/word alias tables and the ambiguity decisions behind them) —
 * rates are fetched asynchronously (via {@link CurrencyAsyncResolver}) and
 * the expression shows Pending until they resolve.
 */
export const CURRENCY_PACKAGE: IEnginePackage = {
  name: "solve-currency",
  asyncResolvers: [new CurrencyAsyncResolver()],
  prefixParselets: [
    { tokenType: "DOLLAR", parselet: new CurrencySymbolParselet() },
    { tokenType: "POUND", parselet: new CurrencySymbolParselet() },
    { tokenType: "EURO", parselet: new CurrencySymbolParselet() },
    { tokenType: "YEN", parselet: new CurrencySymbolParselet() },
    { tokenType: "RUBLE", parselet: new CurrencySymbolParselet() },
    { tokenType: "WON", parselet: new CurrencySymbolParselet() },
    // Every currency symbol added after the original six above shares this
    // one generic token type — see Token.ts's CURRENCY_SYMBOL doc comment.
    { tokenType: "CURRENCY_SYMBOL", parselet: new CurrencySymbolParselet() },
  ],
  infixParselets: [
    { tokenType: "IN", parselet: new InParselet() },
  ],
};
