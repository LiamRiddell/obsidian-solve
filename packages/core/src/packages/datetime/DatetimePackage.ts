import type { IEnginePackage } from "@solve-js/api/PackageRegistry";
import { NowParselet } from "./parselets/NowParselet";
import { NextLastParselet } from "./parselets/NextLastParselet";

export const DATETIME_PACKAGE: IEnginePackage = {
  name: "solve-datetime",
  prefixParselets: [
    { tokenType: "NOW", parselet: new NowParselet() },
    { tokenType: "TODAY", parselet: new NowParselet() },
    { tokenType: "TOMORROW", parselet: new NowParselet() },
    { tokenType: "YESTERDAY", parselet: new NowParselet() },
    { tokenType: "NEXT", parselet: new NextLastParselet(7) },
    { tokenType: "LAST", parselet: new NextLastParselet(-7) },
  ],
};
