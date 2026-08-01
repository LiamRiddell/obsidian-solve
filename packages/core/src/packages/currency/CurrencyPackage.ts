import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { CurrencySymbolParselet } from "./parselets/CurrencySymbolParselet";
import { InParselet } from "./parselets/InParselet";
import { CurrencyAsyncResolver } from "@solve-js/uom/CurrencyResolver";

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
