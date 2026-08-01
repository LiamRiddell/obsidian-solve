import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { CurrencySymbolParselet } from "./parselets/CurrencySymbolParselet";
import { InParselet } from "./parselets/InParselet";
import { CurrencyAsyncResolver } from "@solve-js/uom/CurrencyResolver";

/** Currency: `$10`, `£10`, `€10`, `10 USD in GBP` — rates are fetched asynchronously (via {@link CurrencyAsyncResolver}) and the expression shows Pending until they resolve. */
export const CURRENCY_PACKAGE: IEnginePackage = {
  name: "solve-currency",
  asyncResolvers: [new CurrencyAsyncResolver()],
  prefixParselets: [
    { tokenType: "DOLLAR", parselet: new CurrencySymbolParselet() },
    { tokenType: "POUND", parselet: new CurrencySymbolParselet() },
    { tokenType: "EURO", parselet: new CurrencySymbolParselet() },
  ],
  infixParselets: [
    { tokenType: "IN", parselet: new InParselet() },
  ],
};
