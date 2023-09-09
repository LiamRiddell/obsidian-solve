'use strict';const {makeRecipe}=require('ohm-js');const result=makeRecipe(["grammar",{"source":"Datetime {\r\n  Expression\r\n    = Addition\r\n    | Subtraction\r\n    | TimeUnitUntilDate\r\n    | TimeUnitSinceDate\r\n    | Primitive\r\n\r\n  Addition\r\n    = Primitive add Timespan\r\n\r\n  Subtraction\r\n    = Primitive subtract Timespan\r\n  \r\n  Primitive\r\n    = Datetime\r\n    | Now\r\n    | Today\r\n    | Tomorrow\r\n    | Yesterday\r\n    | NextDayOfWeek\r\n    | LastDayOfWeek\r\n\r\n  Timespan\r\n    = number unitsOfTime\r\n\r\n  Now \r\n    = now\r\n\r\n  Today \r\n    = today\r\n\r\n  Tomorrow \r\n    = tomorrow\r\n\r\n  Yesterday \r\n    = yesterday\r\n  \r\n  // e.g. 1/10/23 or 01.10.2023\r\n  Datetime \r\n  \t= datetimeIso8601\r\n    | datetimeFormatEuropeanOrUs\r\n  \r\n  // e.g. Next Monday\r\n  NextDayOfWeek\r\n    = caseInsensitive<\"next\"> dayOfWeek\r\n  \r\n  // e.g. Last Tuesday\r\n  LastDayOfWeek\r\n    = caseInsensitive<\"last\"> dayOfWeek\r\n    \r\n  TimeUnitUntilDate\r\n  \t= (year | month | week | day) until Datetime\r\n    \r\n  TimeUnitSinceDate\r\n  \t= (year | month | week | day) since Datetime\r\n\r\n  // Lexical Rules\r\n  oneDigit\r\n    = digit\r\n\r\n  twoDigit \r\n    = digit digit\r\n  \r\n  fourDigit\r\n    = digit digit digit digit\r\n\r\n  time\r\n    =  (twoDigit | oneDigit) \":\" (twoDigit | oneDigit) \":\" (twoDigit | oneDigit)\r\n\r\n  datetimeIso8601\r\n    = fourDigit \"-\" twoDigit \"-\" twoDigit \"T\"? (twoDigit \":\" twoDigit \":\" twoDigit)? (\".\" digit+)? (\"Z\" | timeZone)?\r\n\r\n  datetimeFormatEuropeanOrUs\r\n    = (twoDigit | oneDigit) \"/\" (twoDigit | oneDigit) \"/\" (fourDigit | twoDigit) time?\r\n    | (twoDigit | oneDigit) \"-\" (twoDigit | oneDigit) \"-\" (fourDigit | twoDigit) time?\r\n    | (twoDigit | oneDigit) \".\" (twoDigit | oneDigit) \".\" (fourDigit | twoDigit) time?\r\n    \r\n  timeZone\r\n \t = \"+\" digit+ \":\" digit+\r\n \t | \"-\" digit+ \":\" digit+\r\n\r\n  add \r\n  \t= \"+\"\r\n  \t| caseInsensitive<\"add\">\r\n    | caseInsensitive<\"plus\">\r\n\r\n  subtract \r\n    = \"-\"\r\n    | caseInsensitive<\"take\">\r\n    | caseInsensitive<\"minus\">\r\n    | caseInsensitive<\"subtract\">\r\n\r\n  now\r\n    = caseInsensitive<\"now\">\r\n\r\n  today\r\n    = caseInsensitive<\"today\">\r\n\r\n  tomorrow\r\n    = caseInsensitive<\"tomorrow\">\r\n\r\n  yesterday\r\n    = caseInsensitive<\"yesterday\">\r\n\r\n  dayOfWeek\r\n    = monday\r\n    | tuesday\r\n    | wednesday\r\n    | thursday\r\n    | friday\r\n    | saturday\r\n    | sunday\r\n\r\n  monday\r\n    = caseInsensitive<\"monday\">\r\n\r\n  tuesday\r\n    = caseInsensitive<\"tuesday\">\r\n\r\n  wednesday\r\n    = caseInsensitive<\"wednesday\">\r\n\r\n  thursday\r\n    = caseInsensitive<\"thursday\">\r\n  \r\n  friday\r\n    = caseInsensitive<\"friday\">\r\n\r\n  saturday\r\n    = caseInsensitive<\"saturday\">\r\n\r\n  sunday\r\n    = caseInsensitive<\"sunday\">\r\n\r\n  unitsOfTime\r\n    = year\r\n    | month\r\n    | week\r\n    | day\r\n    | hour\r\n    | minute\r\n    | second\r\n    | millisecond\r\n\r\n  year\r\n    = caseInsensitive<\"years\">\r\n    | caseInsensitive<\"year\">\r\n    | \"y\"\r\n\r\n  month\r\n    = caseInsensitive<\"months\">\r\n    | caseInsensitive<\"month\">\r\n    | \"M\"\r\n\r\n  week\r\n    = caseInsensitive<\"weeks\">\r\n    | caseInsensitive<\"week\">\r\n    | \"w\"\r\n\r\n  day\r\n    = caseInsensitive<\"days\">\r\n    | caseInsensitive<\"day\">\r\n    | \"d\"\r\n\r\n  hour\r\n    = caseInsensitive<\"hours\">\r\n    | caseInsensitive<\"hour\">\r\n    | \"h\"\r\n\r\n  minute\r\n    = caseInsensitive<\"minutes\">\r\n    | caseInsensitive<\"minute\">\r\n    | \"m\"\r\n    \r\n  second\r\n    = caseInsensitive<\"seconds\">\r\n    | caseInsensitive<\"second\">\r\n    | \"s\"\r\n\r\n  millisecond\r\n    = caseInsensitive<\"milliseconds\">\r\n    | caseInsensitive<\"millisecond\">\r\n    | \"ms\"\r\n    \r\n  until\r\n  \t= \"until\"\r\n    | \"before\"\r\n    \r\n  since\r\n  \t= \"since\"\r\n    | \"after\"\r\n\r\n  number\r\n    = digit* \".\" digit+  -- fract\r\n    | digit+             -- whole\r\n    \r\n  integer\r\n  \t= digit+\r\n}"},"Datetime",null,"Expression",{"Expression":["define",{"sourceInterval":[14,126]},null,[],["alt",{"sourceInterval":[32,126]},["app",{"sourceInterval":[32,40]},"Addition",[]],["app",{"sourceInterval":[48,59]},"Subtraction",[]],["app",{"sourceInterval":[67,84]},"TimeUnitUntilDate",[]],["app",{"sourceInterval":[92,109]},"TimeUnitSinceDate",[]],["app",{"sourceInterval":[117,126]},"Primitive",[]]]],"Addition":["define",{"sourceInterval":[132,170]},null,[],["seq",{"sourceInterval":[148,170]},["app",{"sourceInterval":[148,157]},"Primitive",[]],["app",{"sourceInterval":[158,161]},"add",[]],["app",{"sourceInterval":[162,170]},"Timespan",[]]]],"Subtraction":["define",{"sourceInterval":[176,222]},null,[],["seq",{"sourceInterval":[195,222]},["app",{"sourceInterval":[195,204]},"Primitive",[]],["app",{"sourceInterval":[205,213]},"subtract",[]],["app",{"sourceInterval":[214,222]},"Timespan",[]]]],"Primitive":["define",{"sourceInterval":[230,354]},null,[],["alt",{"sourceInterval":[247,354]},["app",{"sourceInterval":[247,255]},"Datetime",[]],["app",{"sourceInterval":[263,266]},"Now",[]],["app",{"sourceInterval":[274,279]},"Today",[]],["app",{"sourceInterval":[287,295]},"Tomorrow",[]],["app",{"sourceInterval":[303,312]},"Yesterday",[]],["app",{"sourceInterval":[320,333]},"NextDayOfWeek",[]],["app",{"sourceInterval":[341,354]},"LastDayOfWeek",[]]]],"Timespan":["define",{"sourceInterval":[360,394]},null,[],["seq",{"sourceInterval":[376,394]},["app",{"sourceInterval":[376,382]},"number",[]],["app",{"sourceInterval":[383,394]},"unitsOfTime",[]]]],"Now":["define",{"sourceInterval":[400,415]},null,[],["app",{"sourceInterval":[412,415]},"now",[]]],"Today":["define",{"sourceInterval":[421,440]},null,[],["app",{"sourceInterval":[435,440]},"today",[]]],"Tomorrow":["define",{"sourceInterval":[446,471]},null,[],["app",{"sourceInterval":[463,471]},"tomorrow",[]]],"Yesterday":["define",{"sourceInterval":[477,504]},null,[],["app",{"sourceInterval":[495,504]},"yesterday",[]]],"Datetime":["define",{"sourceInterval":[545,610]},null,[],["alt",{"sourceInterval":[561,610]},["app",{"sourceInterval":[561,576]},"datetimeIso8601",[]],["app",{"sourceInterval":[584,610]},"datetimeFormatEuropeanOrUs",[]]]],"NextDayOfWeek":["define",{"sourceInterval":[641,695]},null,[],["seq",{"sourceInterval":[662,695]},["app",{"sourceInterval":[662,685]},"caseInsensitive",[["terminal",{"sourceInterval":[678,684]},"next"]]],["app",{"sourceInterval":[686,695]},"dayOfWeek",[]]]],"LastDayOfWeek":["define",{"sourceInterval":[727,781]},null,[],["seq",{"sourceInterval":[748,781]},["app",{"sourceInterval":[748,771]},"caseInsensitive",[["terminal",{"sourceInterval":[764,770]},"last"]]],["app",{"sourceInterval":[772,781]},"dayOfWeek",[]]]],"TimeUnitUntilDate":["define",{"sourceInterval":[791,857]},null,[],["seq",{"sourceInterval":[815,857]},["alt",{"sourceInterval":[816,841]},["app",{"sourceInterval":[816,820]},"year",[]],["app",{"sourceInterval":[823,828]},"month",[]],["app",{"sourceInterval":[831,835]},"week",[]],["app",{"sourceInterval":[838,841]},"day",[]]],["app",{"sourceInterval":[843,848]},"until",[]],["app",{"sourceInterval":[849,857]},"Datetime",[]]]],"TimeUnitSinceDate":["define",{"sourceInterval":[867,933]},null,[],["seq",{"sourceInterval":[891,933]},["alt",{"sourceInterval":[892,917]},["app",{"sourceInterval":[892,896]},"year",[]],["app",{"sourceInterval":[899,904]},"month",[]],["app",{"sourceInterval":[907,911]},"week",[]],["app",{"sourceInterval":[914,917]},"day",[]]],["app",{"sourceInterval":[919,924]},"since",[]],["app",{"sourceInterval":[925,933]},"Datetime",[]]]],"oneDigit":["define",{"sourceInterval":[959,980]},null,[],["app",{"sourceInterval":[975,980]},"digit",[]]],"twoDigit":["define",{"sourceInterval":[986,1014]},null,[],["seq",{"sourceInterval":[1003,1014]},["app",{"sourceInterval":[1003,1008]},"digit",[]],["app",{"sourceInterval":[1009,1014]},"digit",[]]]],"fourDigit":["define",{"sourceInterval":[1022,1062]},null,[],["seq",{"sourceInterval":[1039,1062]},["app",{"sourceInterval":[1039,1044]},"digit",[]],["app",{"sourceInterval":[1045,1050]},"digit",[]],["app",{"sourceInterval":[1051,1056]},"digit",[]],["app",{"sourceInterval":[1057,1062]},"digit",[]]]],"time":["define",{"sourceInterval":[1068,1154]},null,[],["seq",{"sourceInterval":[1081,1154]},["alt",{"sourceInterval":[1082,1101]},["app",{"sourceInterval":[1082,1090]},"twoDigit",[]],["app",{"sourceInterval":[1093,1101]},"oneDigit",[]]],["terminal",{"sourceInterval":[1103,1106]},":"],["alt",{"sourceInterval":[1108,1127]},["app",{"sourceInterval":[1108,1116]},"twoDigit",[]],["app",{"sourceInterval":[1119,1127]},"oneDigit",[]]],["terminal",{"sourceInterval":[1129,1132]},":"],["alt",{"sourceInterval":[1134,1153]},["app",{"sourceInterval":[1134,1142]},"twoDigit",[]],["app",{"sourceInterval":[1145,1153]},"oneDigit",[]]]]],"datetimeIso8601":["define",{"sourceInterval":[1160,1293]},null,[],["seq",{"sourceInterval":[1183,1293]},["app",{"sourceInterval":[1183,1192]},"fourDigit",[]],["terminal",{"sourceInterval":[1193,1196]},"-"],["app",{"sourceInterval":[1197,1205]},"twoDigit",[]],["terminal",{"sourceInterval":[1206,1209]},"-"],["app",{"sourceInterval":[1210,1218]},"twoDigit",[]],["opt",{"sourceInterval":[1219,1223]},["terminal",{"sourceInterval":[1219,1222]},"T"]],["opt",{"sourceInterval":[1224,1261]},["seq",{"sourceInterval":[1225,1259]},["app",{"sourceInterval":[1225,1233]},"twoDigit",[]],["terminal",{"sourceInterval":[1234,1237]},":"],["app",{"sourceInterval":[1238,1246]},"twoDigit",[]],["terminal",{"sourceInterval":[1247,1250]},":"],["app",{"sourceInterval":[1251,1259]},"twoDigit",[]]]],["opt",{"sourceInterval":[1262,1275]},["seq",{"sourceInterval":[1263,1273]},["terminal",{"sourceInterval":[1263,1266]},"."],["plus",{"sourceInterval":[1267,1273]},["app",{"sourceInterval":[1267,1272]},"digit",[]]]]],["opt",{"sourceInterval":[1276,1293]},["alt",{"sourceInterval":[1277,1291]},["terminal",{"sourceInterval":[1277,1280]},"Z"],["app",{"sourceInterval":[1283,1291]},"timeZone",[]]]]]],"datetimeFormatEuropeanOrUs":["define",{"sourceInterval":[1299,1589]},null,[],["alt",{"sourceInterval":[1333,1589]},["seq",{"sourceInterval":[1333,1413]},["alt",{"sourceInterval":[1334,1353]},["app",{"sourceInterval":[1334,1342]},"twoDigit",[]],["app",{"sourceInterval":[1345,1353]},"oneDigit",[]]],["terminal",{"sourceInterval":[1355,1358]},"/"],["alt",{"sourceInterval":[1360,1379]},["app",{"sourceInterval":[1360,1368]},"twoDigit",[]],["app",{"sourceInterval":[1371,1379]},"oneDigit",[]]],["terminal",{"sourceInterval":[1381,1384]},"/"],["alt",{"sourceInterval":[1386,1406]},["app",{"sourceInterval":[1386,1395]},"fourDigit",[]],["app",{"sourceInterval":[1398,1406]},"twoDigit",[]]],["opt",{"sourceInterval":[1408,1413]},["app",{"sourceInterval":[1408,1412]},"time",[]]]],["seq",{"sourceInterval":[1421,1501]},["alt",{"sourceInterval":[1422,1441]},["app",{"sourceInterval":[1422,1430]},"twoDigit",[]],["app",{"sourceInterval":[1433,1441]},"oneDigit",[]]],["terminal",{"sourceInterval":[1443,1446]},"-"],["alt",{"sourceInterval":[1448,1467]},["app",{"sourceInterval":[1448,1456]},"twoDigit",[]],["app",{"sourceInterval":[1459,1467]},"oneDigit",[]]],["terminal",{"sourceInterval":[1469,1472]},"-"],["alt",{"sourceInterval":[1474,1494]},["app",{"sourceInterval":[1474,1483]},"fourDigit",[]],["app",{"sourceInterval":[1486,1494]},"twoDigit",[]]],["opt",{"sourceInterval":[1496,1501]},["app",{"sourceInterval":[1496,1500]},"time",[]]]],["seq",{"sourceInterval":[1509,1589]},["alt",{"sourceInterval":[1510,1529]},["app",{"sourceInterval":[1510,1518]},"twoDigit",[]],["app",{"sourceInterval":[1521,1529]},"oneDigit",[]]],["terminal",{"sourceInterval":[1531,1534]},"."],["alt",{"sourceInterval":[1536,1555]},["app",{"sourceInterval":[1536,1544]},"twoDigit",[]],["app",{"sourceInterval":[1547,1555]},"oneDigit",[]]],["terminal",{"sourceInterval":[1557,1560]},"."],["alt",{"sourceInterval":[1562,1582]},["app",{"sourceInterval":[1562,1571]},"fourDigit",[]],["app",{"sourceInterval":[1574,1582]},"twoDigit",[]]],["opt",{"sourceInterval":[1584,1589]},["app",{"sourceInterval":[1584,1588]},"time",[]]]]]],"timeZone":["define",{"sourceInterval":[1599,1663]},null,[],["alt",{"sourceInterval":[1614,1663]},["seq",{"sourceInterval":[1614,1635]},["terminal",{"sourceInterval":[1614,1617]},"+"],["plus",{"sourceInterval":[1618,1624]},["app",{"sourceInterval":[1618,1623]},"digit",[]]],["terminal",{"sourceInterval":[1625,1628]},":"],["plus",{"sourceInterval":[1629,1635]},["app",{"sourceInterval":[1629,1634]},"digit",[]]]],["seq",{"sourceInterval":[1642,1663]},["terminal",{"sourceInterval":[1642,1645]},"-"],["plus",{"sourceInterval":[1646,1652]},["app",{"sourceInterval":[1646,1651]},"digit",[]]],["terminal",{"sourceInterval":[1653,1656]},":"],["plus",{"sourceInterval":[1657,1663]},["app",{"sourceInterval":[1657,1662]},"digit",[]]]]]],"add":["define",{"sourceInterval":[1669,1743]},null,[],["alt",{"sourceInterval":[1680,1743]},["terminal",{"sourceInterval":[1680,1683]},"+"],["app",{"sourceInterval":[1690,1712]},"caseInsensitive",[["terminal",{"sourceInterval":[1706,1711]},"add"]]],["app",{"sourceInterval":[1720,1743]},"caseInsensitive",[["terminal",{"sourceInterval":[1736,1742]},"plus"]]]]],"subtract":["define",{"sourceInterval":[1749,1867]},null,[],["alt",{"sourceInterval":[1766,1867]},["terminal",{"sourceInterval":[1766,1769]},"-"],["app",{"sourceInterval":[1777,1800]},"caseInsensitive",[["terminal",{"sourceInterval":[1793,1799]},"take"]]],["app",{"sourceInterval":[1808,1832]},"caseInsensitive",[["terminal",{"sourceInterval":[1824,1831]},"minus"]]],["app",{"sourceInterval":[1840,1867]},"caseInsensitive",[["terminal",{"sourceInterval":[1856,1866]},"subtract"]]]]],"now":["define",{"sourceInterval":[1873,1906]},null,[],["app",{"sourceInterval":[1884,1906]},"caseInsensitive",[["terminal",{"sourceInterval":[1900,1905]},"now"]]]],"today":["define",{"sourceInterval":[1912,1949]},null,[],["app",{"sourceInterval":[1925,1949]},"caseInsensitive",[["terminal",{"sourceInterval":[1941,1948]},"today"]]]],"tomorrow":["define",{"sourceInterval":[1955,1998]},null,[],["app",{"sourceInterval":[1971,1998]},"caseInsensitive",[["terminal",{"sourceInterval":[1987,1997]},"tomorrow"]]]],"yesterday":["define",{"sourceInterval":[2004,2049]},null,[],["app",{"sourceInterval":[2021,2049]},"caseInsensitive",[["terminal",{"sourceInterval":[2037,2048]},"yesterday"]]]],"dayOfWeek":["define",{"sourceInterval":[2055,2170]},null,[],["alt",{"sourceInterval":[2072,2170]},["app",{"sourceInterval":[2072,2078]},"monday",[]],["app",{"sourceInterval":[2086,2093]},"tuesday",[]],["app",{"sourceInterval":[2101,2110]},"wednesday",[]],["app",{"sourceInterval":[2118,2126]},"thursday",[]],["app",{"sourceInterval":[2134,2140]},"friday",[]],["app",{"sourceInterval":[2148,2156]},"saturday",[]],["app",{"sourceInterval":[2164,2170]},"sunday",[]]]],"monday":["define",{"sourceInterval":[2176,2215]},null,[],["app",{"sourceInterval":[2190,2215]},"caseInsensitive",[["terminal",{"sourceInterval":[2206,2214]},"monday"]]]],"tuesday":["define",{"sourceInterval":[2221,2262]},null,[],["app",{"sourceInterval":[2236,2262]},"caseInsensitive",[["terminal",{"sourceInterval":[2252,2261]},"tuesday"]]]],"wednesday":["define",{"sourceInterval":[2268,2313]},null,[],["app",{"sourceInterval":[2285,2313]},"caseInsensitive",[["terminal",{"sourceInterval":[2301,2312]},"wednesday"]]]],"thursday":["define",{"sourceInterval":[2319,2362]},null,[],["app",{"sourceInterval":[2335,2362]},"caseInsensitive",[["terminal",{"sourceInterval":[2351,2361]},"thursday"]]]],"friday":["define",{"sourceInterval":[2370,2409]},null,[],["app",{"sourceInterval":[2384,2409]},"caseInsensitive",[["terminal",{"sourceInterval":[2400,2408]},"friday"]]]],"saturday":["define",{"sourceInterval":[2415,2458]},null,[],["app",{"sourceInterval":[2431,2458]},"caseInsensitive",[["terminal",{"sourceInterval":[2447,2457]},"saturday"]]]],"sunday":["define",{"sourceInterval":[2464,2503]},null,[],["app",{"sourceInterval":[2478,2503]},"caseInsensitive",[["terminal",{"sourceInterval":[2494,2502]},"sunday"]]]],"unitsOfTime":["define",{"sourceInterval":[2509,2627]},null,[],["alt",{"sourceInterval":[2528,2627]},["app",{"sourceInterval":[2528,2532]},"year",[]],["app",{"sourceInterval":[2540,2545]},"month",[]],["app",{"sourceInterval":[2553,2557]},"week",[]],["app",{"sourceInterval":[2565,2568]},"day",[]],["app",{"sourceInterval":[2576,2580]},"hour",[]],["app",{"sourceInterval":[2588,2594]},"minute",[]],["app",{"sourceInterval":[2602,2608]},"second",[]],["app",{"sourceInterval":[2616,2627]},"millisecond",[]]]],"year":["define",{"sourceInterval":[2633,2711]},null,[],["alt",{"sourceInterval":[2645,2711]},["app",{"sourceInterval":[2645,2669]},"caseInsensitive",[["terminal",{"sourceInterval":[2661,2668]},"years"]]],["app",{"sourceInterval":[2677,2700]},"caseInsensitive",[["terminal",{"sourceInterval":[2693,2699]},"year"]]],["terminal",{"sourceInterval":[2708,2711]},"y"]]],"month":["define",{"sourceInterval":[2717,2798]},null,[],["alt",{"sourceInterval":[2730,2798]},["app",{"sourceInterval":[2730,2755]},"caseInsensitive",[["terminal",{"sourceInterval":[2746,2754]},"months"]]],["app",{"sourceInterval":[2763,2787]},"caseInsensitive",[["terminal",{"sourceInterval":[2779,2786]},"month"]]],["terminal",{"sourceInterval":[2795,2798]},"M"]]],"week":["define",{"sourceInterval":[2804,2882]},null,[],["alt",{"sourceInterval":[2816,2882]},["app",{"sourceInterval":[2816,2840]},"caseInsensitive",[["terminal",{"sourceInterval":[2832,2839]},"weeks"]]],["app",{"sourceInterval":[2848,2871]},"caseInsensitive",[["terminal",{"sourceInterval":[2864,2870]},"week"]]],["terminal",{"sourceInterval":[2879,2882]},"w"]]],"day":["define",{"sourceInterval":[2888,2963]},null,[],["alt",{"sourceInterval":[2899,2963]},["app",{"sourceInterval":[2899,2922]},"caseInsensitive",[["terminal",{"sourceInterval":[2915,2921]},"days"]]],["app",{"sourceInterval":[2930,2952]},"caseInsensitive",[["terminal",{"sourceInterval":[2946,2951]},"day"]]],["terminal",{"sourceInterval":[2960,2963]},"d"]]],"hour":["define",{"sourceInterval":[2969,3047]},null,[],["alt",{"sourceInterval":[2981,3047]},["app",{"sourceInterval":[2981,3005]},"caseInsensitive",[["terminal",{"sourceInterval":[2997,3004]},"hours"]]],["app",{"sourceInterval":[3013,3036]},"caseInsensitive",[["terminal",{"sourceInterval":[3029,3035]},"hour"]]],["terminal",{"sourceInterval":[3044,3047]},"h"]]],"minute":["define",{"sourceInterval":[3053,3137]},null,[],["alt",{"sourceInterval":[3067,3137]},["app",{"sourceInterval":[3067,3093]},"caseInsensitive",[["terminal",{"sourceInterval":[3083,3092]},"minutes"]]],["app",{"sourceInterval":[3101,3126]},"caseInsensitive",[["terminal",{"sourceInterval":[3117,3125]},"minute"]]],["terminal",{"sourceInterval":[3134,3137]},"m"]]],"second":["define",{"sourceInterval":[3147,3231]},null,[],["alt",{"sourceInterval":[3161,3231]},["app",{"sourceInterval":[3161,3187]},"caseInsensitive",[["terminal",{"sourceInterval":[3177,3186]},"seconds"]]],["app",{"sourceInterval":[3195,3220]},"caseInsensitive",[["terminal",{"sourceInterval":[3211,3219]},"second"]]],["terminal",{"sourceInterval":[3228,3231]},"s"]]],"millisecond":["define",{"sourceInterval":[3237,3337]},null,[],["alt",{"sourceInterval":[3256,3337]},["app",{"sourceInterval":[3256,3287]},"caseInsensitive",[["terminal",{"sourceInterval":[3272,3286]},"milliseconds"]]],["app",{"sourceInterval":[3295,3325]},"caseInsensitive",[["terminal",{"sourceInterval":[3311,3324]},"millisecond"]]],["terminal",{"sourceInterval":[3333,3337]},"ms"]]],"until":["define",{"sourceInterval":[3347,3382]},null,[],["alt",{"sourceInterval":[3359,3382]},["terminal",{"sourceInterval":[3359,3366]},"until"],["terminal",{"sourceInterval":[3374,3382]},"before"]]],"since":["define",{"sourceInterval":[3392,3426]},null,[],["alt",{"sourceInterval":[3404,3426]},["terminal",{"sourceInterval":[3404,3411]},"since"],["terminal",{"sourceInterval":[3419,3426]},"after"]]],"number_fract":["define",{"sourceInterval":[3446,3473]},null,[],["seq",{"sourceInterval":[3446,3463]},["star",{"sourceInterval":[3446,3452]},["app",{"sourceInterval":[3446,3451]},"digit",[]]],["terminal",{"sourceInterval":[3453,3456]},"."],["plus",{"sourceInterval":[3457,3463]},["app",{"sourceInterval":[3457,3462]},"digit",[]]]]],"number_whole":["define",{"sourceInterval":[3481,3508]},null,[],["plus",{"sourceInterval":[3481,3487]},["app",{"sourceInterval":[3481,3486]},"digit",[]]]],"number":["define",{"sourceInterval":[3432,3508]},null,[],["alt",{"sourceInterval":[3446,3508]},["app",{"sourceInterval":[3446,3463]},"number_fract",[]],["app",{"sourceInterval":[3481,3487]},"number_whole",[]]]],"integer":["define",{"sourceInterval":[3518,3538]},null,[],["plus",{"sourceInterval":[3532,3538]},["app",{"sourceInterval":[3532,3537]},"digit",[]]]]}]);module.exports=result;