export interface ILocale {
  code: string;
  label: string;
  keywordMap: Record<string, string>;
  display: {
    resultPrefix: string;
    dateFormat: string;
    decimalSeparator: string;
    thousandsSeparator: string;
    vectorFormat: string;
    percentageSuffix: string;
  };
}

export const enLocale: ILocale = {
  code: "en",
  label: "English",
  keywordMap: {
    pi: "PI", e: "E",
    plus: "PLUS", add: "PLUS", and: "PLUS",
    minus: "MINUS", subtract: "MINUS", remove: "MINUS", take: "MINUS",
    times: "STAR", multiply: "STAR",
    divide: "SLASH",
    modulo: "MOD", mod: "MOD",
    exponent: "CARET", prime: "CARET",
    of: "OF",
    now: "NOW", today: "TODAY", tomorrow: "TOMORROW", yesterday: "YESTERDAY",
    days: "DURATION_DAY", day: "DURATION_DAY",
    weeks: "DURATION_WEEK", week: "DURATION_WEEK",
    months: "DURATION_MONTH", month: "DURATION_MONTH",
    years: "DURATION_YEAR", year: "DURATION_YEAR",
    hours: "DURATION_HOUR", hour: "DURATION_HOUR",
    minutes: "DURATION_MINUTE", minute: "DURATION_MINUTE",
    seconds: "DURATION_SECOND", second: "DURATION_SECOND",
    roll: "ROLL",
    sqrt: "FUNC", abs: "FUNC", sin: "FUNC", cos: "FUNC", tan: "FUNC",
    log: "FUNC", ceil: "FUNC", floor: "FUNC", round: "FUNC", min: "FUNC", max: "FUNC",
    asin: "FUNC", acos: "FUNC", atan: "FUNC", atan2: "FUNC",
    sinh: "FUNC", cosh: "FUNC", tanh: "FUNC",
    asinh: "FUNC", acosh: "FUNC", atanh: "FUNC",
    cbrt: "FUNC", clz32: "FUNC", expm1: "FUNC", exp: "FUNC",
    fround: "FUNC", hypot: "FUNC", imul: "FUNC",
    log10: "FUNC", log1p: "FUNC", log2: "FUNC",
    pow: "FUNC", random: "FUNC", sign: "FUNC", trunc: "FUNC",
    degtorad: "FUNC", radtodeg: "FUNC",
    convert: "CONVERT", to: "TO", best: "BEST",
    next: "NEXT", last: "LAST", until: "UNTIL", since: "SINCE",
    between: "BETWEEN", from: "FROM",
    increase: "INCREASE", decrease: "DECREASE",
    vec2: "VEC2", vec3: "VEC3", vec4: "VEC4",
  },
  display: {
    resultPrefix: "= ",
    dateFormat: "default",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    vectorFormat: "[{values}]",
    percentageSuffix: "%",
  },
};