'use strict';const {makeRecipe}=require('ohm-js');const result=makeRecipe(["grammar",{"source":"Datetime {\r\n  Expression\r\n    = Addition\r\n    | Subtraction\r\n    | TimeUnitUntilDate\r\n    | TimeUnitSinceDate\r\n    | Primitive\r\n\r\n  Addition\r\n    = Primitive add Timespan\r\n\r\n  Subtraction\r\n    = Primitive subtract Timespan\r\n  \r\n  Primitive\r\n    = Datetime\r\n    | Now\r\n    | Today\r\n    | Tomorrow\r\n    | Yesterday\r\n    | NextDayOfWeek\r\n    | LastDayOfWeek\r\n\r\n  Timespan\r\n    = number unitsOfTime\r\n\r\n  Now \r\n    = now\r\n\r\n  Today \r\n    = today\r\n\r\n  Tomorrow \r\n    = tomorrow\r\n\r\n  Yesterday \r\n    = yesterday\r\n  \r\n  // e.g. 1/10/23 or 01.10.2023\r\n  Datetime \r\n  \t= (twoDigit | oneDigit) \"/\" (twoDigit | oneDigit) \"/\" (fourDigit | twoDigit) time?\r\n    | (twoDigit | oneDigit) \"-\" (twoDigit | oneDigit) \"-\" (fourDigit | twoDigit) time?\r\n    | (twoDigit | oneDigit) \".\" (twoDigit | oneDigit) \".\" (fourDigit | twoDigit) time?\r\n  \r\n  // e.g. Next Monday\r\n  NextDayOfWeek\r\n    = caseInsensitive<\"next\"> dayOfWeek\r\n  \r\n  // e.g. Last Tuesday\r\n  LastDayOfWeek\r\n    = caseInsensitive<\"last\"> dayOfWeek\r\n    \r\n  TimeUnitUntilDate\r\n  \t= (year | month | week | day) until Datetime\r\n    \r\n  TimeUnitSinceDate\r\n  \t= (year | month | week | day) since Datetime\r\n\r\n  // Lexical Rules\r\n  oneDigit\r\n    = digit\r\n\r\n  twoDigit \r\n    = digit digit\r\n  \r\n  fourDigit\r\n    = digit digit digit digit\r\n\r\n  time\r\n  =  (twoDigit | oneDigit) \":\" (twoDigit | oneDigit) \":\" (twoDigit | oneDigit)\r\n\r\n  add \r\n  \t= \"+\"\r\n  \t| caseInsensitive<\"add\">\r\n    | caseInsensitive<\"plus\">\r\n\r\n  subtract \r\n    = \"-\"\r\n    | caseInsensitive<\"take\">\r\n    | caseInsensitive<\"minus\">\r\n\r\n  now\r\n    = caseInsensitive<\"now\">\r\n\r\n  today\r\n    = caseInsensitive<\"today\">\r\n\r\n  tomorrow\r\n    = caseInsensitive<\"tomorrow\">\r\n\r\n  yesterday\r\n    = caseInsensitive<\"yesterday\">\r\n\r\n  dayOfWeek\r\n    = monday\r\n    | tuesday\r\n    | wednesday\r\n    | thursday\r\n    | friday\r\n    | saturday\r\n    | sunday\r\n\r\n  monday\r\n    = caseInsensitive<\"monday\">\r\n\r\n  tuesday\r\n    = caseInsensitive<\"tuesday\">\r\n\r\n  wednesday\r\n    = caseInsensitive<\"wednesday\">\r\n\r\n  thursday\r\n    = caseInsensitive<\"thursday\">\r\n  \r\n  friday\r\n    = caseInsensitive<\"friday\">\r\n\r\n  saturday\r\n    = caseInsensitive<\"saturday\">\r\n\r\n  sunday\r\n    = caseInsensitive<\"sunday\">\r\n\r\n  unitsOfTime\r\n    = year\r\n    | month\r\n    | week\r\n    | day\r\n    | hour\r\n    | minute\r\n    | second\r\n    | millisecond\r\n\r\n  year\r\n    = caseInsensitive<\"years\">\r\n    | caseInsensitive<\"year\">\r\n    | \"y\"\r\n\r\n  month\r\n    = caseInsensitive<\"months\">\r\n    | caseInsensitive<\"month\">\r\n    | \"M\"\r\n\r\n  week\r\n    = caseInsensitive<\"weeks\">\r\n    | caseInsensitive<\"week\">\r\n    | \"w\"\r\n\r\n  day\r\n    = caseInsensitive<\"days\">\r\n    | caseInsensitive<\"day\">\r\n    | \"d\"\r\n\r\n  hour\r\n    = caseInsensitive<\"hours\">\r\n    | caseInsensitive<\"hour\">\r\n    | \"h\"\r\n\r\n  minute\r\n    = caseInsensitive<\"minutes\">\r\n    | caseInsensitive<\"minute\">\r\n    | \"m\"\r\n    \r\n  second\r\n    = caseInsensitive<\"seconds\">\r\n    | caseInsensitive<\"second\">\r\n    | \"s\"\r\n\r\n  millisecond\r\n    = caseInsensitive<\"milliseconds\">\r\n    | caseInsensitive<\"millisecond\">\r\n    | \"ms\"\r\n    \r\n  until\r\n  \t= \"until\"\r\n    | \"before\"\r\n    \r\n  since\r\n  \t= \"since\"\r\n    | \"after\"\r\n\r\n  number\r\n    = digit* \".\" digit+  -- fract\r\n    | digit+             -- whole\r\n    \r\n  integer\r\n  \t= digit+\r\n}"},"Datetime",null,"Expression",{"Expression":["define",{"sourceInterval":[14,126]},null,[],["alt",{"sourceInterval":[32,126]},["app",{"sourceInterval":[32,40]},"Addition",[]],["app",{"sourceInterval":[48,59]},"Subtraction",[]],["app",{"sourceInterval":[67,84]},"TimeUnitUntilDate",[]],["app",{"sourceInterval":[92,109]},"TimeUnitSinceDate",[]],["app",{"sourceInterval":[117,126]},"Primitive",[]]]],"Addition":["define",{"sourceInterval":[132,170]},null,[],["seq",{"sourceInterval":[148,170]},["app",{"sourceInterval":[148,157]},"Primitive",[]],["app",{"sourceInterval":[158,161]},"add",[]],["app",{"sourceInterval":[162,170]},"Timespan",[]]]],"Subtraction":["define",{"sourceInterval":[176,222]},null,[],["seq",{"sourceInterval":[195,222]},["app",{"sourceInterval":[195,204]},"Primitive",[]],["app",{"sourceInterval":[205,213]},"subtract",[]],["app",{"sourceInterval":[214,222]},"Timespan",[]]]],"Primitive":["define",{"sourceInterval":[230,354]},null,[],["alt",{"sourceInterval":[247,354]},["app",{"sourceInterval":[247,255]},"Datetime",[]],["app",{"sourceInterval":[263,266]},"Now",[]],["app",{"sourceInterval":[274,279]},"Today",[]],["app",{"sourceInterval":[287,295]},"Tomorrow",[]],["app",{"sourceInterval":[303,312]},"Yesterday",[]],["app",{"sourceInterval":[320,333]},"NextDayOfWeek",[]],["app",{"sourceInterval":[341,354]},"LastDayOfWeek",[]]]],"Timespan":["define",{"sourceInterval":[360,394]},null,[],["seq",{"sourceInterval":[376,394]},["app",{"sourceInterval":[376,382]},"number",[]],["app",{"sourceInterval":[383,394]},"unitsOfTime",[]]]],"Now":["define",{"sourceInterval":[400,415]},null,[],["app",{"sourceInterval":[412,415]},"now",[]]],"Today":["define",{"sourceInterval":[421,440]},null,[],["app",{"sourceInterval":[435,440]},"today",[]]],"Tomorrow":["define",{"sourceInterval":[446,471]},null,[],["app",{"sourceInterval":[463,471]},"tomorrow",[]]],"Yesterday":["define",{"sourceInterval":[477,504]},null,[],["app",{"sourceInterval":[495,504]},"yesterday",[]]],"Datetime":["define",{"sourceInterval":[545,817]},null,[],["alt",{"sourceInterval":[561,817]},["seq",{"sourceInterval":[561,641]},["alt",{"sourceInterval":[562,581]},["app",{"sourceInterval":[562,570]},"twoDigit",[]],["app",{"sourceInterval":[573,581]},"oneDigit",[]]],["terminal",{"sourceInterval":[583,586]},"/"],["alt",{"sourceInterval":[588,607]},["app",{"sourceInterval":[588,596]},"twoDigit",[]],["app",{"sourceInterval":[599,607]},"oneDigit",[]]],["terminal",{"sourceInterval":[609,612]},"/"],["alt",{"sourceInterval":[614,634]},["app",{"sourceInterval":[614,623]},"fourDigit",[]],["app",{"sourceInterval":[626,634]},"twoDigit",[]]],["opt",{"sourceInterval":[636,641]},["app",{"sourceInterval":[636,640]},"time",[]]]],["seq",{"sourceInterval":[649,729]},["alt",{"sourceInterval":[650,669]},["app",{"sourceInterval":[650,658]},"twoDigit",[]],["app",{"sourceInterval":[661,669]},"oneDigit",[]]],["terminal",{"sourceInterval":[671,674]},"-"],["alt",{"sourceInterval":[676,695]},["app",{"sourceInterval":[676,684]},"twoDigit",[]],["app",{"sourceInterval":[687,695]},"oneDigit",[]]],["terminal",{"sourceInterval":[697,700]},"-"],["alt",{"sourceInterval":[702,722]},["app",{"sourceInterval":[702,711]},"fourDigit",[]],["app",{"sourceInterval":[714,722]},"twoDigit",[]]],["opt",{"sourceInterval":[724,729]},["app",{"sourceInterval":[724,728]},"time",[]]]],["seq",{"sourceInterval":[737,817]},["alt",{"sourceInterval":[738,757]},["app",{"sourceInterval":[738,746]},"twoDigit",[]],["app",{"sourceInterval":[749,757]},"oneDigit",[]]],["terminal",{"sourceInterval":[759,762]},"."],["alt",{"sourceInterval":[764,783]},["app",{"sourceInterval":[764,772]},"twoDigit",[]],["app",{"sourceInterval":[775,783]},"oneDigit",[]]],["terminal",{"sourceInterval":[785,788]},"."],["alt",{"sourceInterval":[790,810]},["app",{"sourceInterval":[790,799]},"fourDigit",[]],["app",{"sourceInterval":[802,810]},"twoDigit",[]]],["opt",{"sourceInterval":[812,817]},["app",{"sourceInterval":[812,816]},"time",[]]]]]],"NextDayOfWeek":["define",{"sourceInterval":[848,902]},null,[],["seq",{"sourceInterval":[869,902]},["app",{"sourceInterval":[869,892]},"caseInsensitive",[["terminal",{"sourceInterval":[885,891]},"next"]]],["app",{"sourceInterval":[893,902]},"dayOfWeek",[]]]],"LastDayOfWeek":["define",{"sourceInterval":[934,988]},null,[],["seq",{"sourceInterval":[955,988]},["app",{"sourceInterval":[955,978]},"caseInsensitive",[["terminal",{"sourceInterval":[971,977]},"last"]]],["app",{"sourceInterval":[979,988]},"dayOfWeek",[]]]],"TimeUnitUntilDate":["define",{"sourceInterval":[998,1064]},null,[],["seq",{"sourceInterval":[1022,1064]},["alt",{"sourceInterval":[1023,1048]},["app",{"sourceInterval":[1023,1027]},"year",[]],["app",{"sourceInterval":[1030,1035]},"month",[]],["app",{"sourceInterval":[1038,1042]},"week",[]],["app",{"sourceInterval":[1045,1048]},"day",[]]],["app",{"sourceInterval":[1050,1055]},"until",[]],["app",{"sourceInterval":[1056,1064]},"Datetime",[]]]],"TimeUnitSinceDate":["define",{"sourceInterval":[1074,1140]},null,[],["seq",{"sourceInterval":[1098,1140]},["alt",{"sourceInterval":[1099,1124]},["app",{"sourceInterval":[1099,1103]},"year",[]],["app",{"sourceInterval":[1106,1111]},"month",[]],["app",{"sourceInterval":[1114,1118]},"week",[]],["app",{"sourceInterval":[1121,1124]},"day",[]]],["app",{"sourceInterval":[1126,1131]},"since",[]],["app",{"sourceInterval":[1132,1140]},"Datetime",[]]]],"oneDigit":["define",{"sourceInterval":[1166,1187]},null,[],["app",{"sourceInterval":[1182,1187]},"digit",[]]],"twoDigit":["define",{"sourceInterval":[1193,1221]},null,[],["seq",{"sourceInterval":[1210,1221]},["app",{"sourceInterval":[1210,1215]},"digit",[]],["app",{"sourceInterval":[1216,1221]},"digit",[]]]],"fourDigit":["define",{"sourceInterval":[1229,1269]},null,[],["seq",{"sourceInterval":[1246,1269]},["app",{"sourceInterval":[1246,1251]},"digit",[]],["app",{"sourceInterval":[1252,1257]},"digit",[]],["app",{"sourceInterval":[1258,1263]},"digit",[]],["app",{"sourceInterval":[1264,1269]},"digit",[]]]],"time":["define",{"sourceInterval":[1275,1359]},null,[],["seq",{"sourceInterval":[1286,1359]},["alt",{"sourceInterval":[1287,1306]},["app",{"sourceInterval":[1287,1295]},"twoDigit",[]],["app",{"sourceInterval":[1298,1306]},"oneDigit",[]]],["terminal",{"sourceInterval":[1308,1311]},":"],["alt",{"sourceInterval":[1313,1332]},["app",{"sourceInterval":[1313,1321]},"twoDigit",[]],["app",{"sourceInterval":[1324,1332]},"oneDigit",[]]],["terminal",{"sourceInterval":[1334,1337]},":"],["alt",{"sourceInterval":[1339,1358]},["app",{"sourceInterval":[1339,1347]},"twoDigit",[]],["app",{"sourceInterval":[1350,1358]},"oneDigit",[]]]]],"add":["define",{"sourceInterval":[1365,1439]},null,[],["alt",{"sourceInterval":[1376,1439]},["terminal",{"sourceInterval":[1376,1379]},"+"],["app",{"sourceInterval":[1386,1408]},"caseInsensitive",[["terminal",{"sourceInterval":[1402,1407]},"add"]]],["app",{"sourceInterval":[1416,1439]},"caseInsensitive",[["terminal",{"sourceInterval":[1432,1438]},"plus"]]]]],"subtract":["define",{"sourceInterval":[1445,1528]},null,[],["alt",{"sourceInterval":[1462,1528]},["terminal",{"sourceInterval":[1462,1465]},"-"],["app",{"sourceInterval":[1473,1496]},"caseInsensitive",[["terminal",{"sourceInterval":[1489,1495]},"take"]]],["app",{"sourceInterval":[1504,1528]},"caseInsensitive",[["terminal",{"sourceInterval":[1520,1527]},"minus"]]]]],"now":["define",{"sourceInterval":[1534,1567]},null,[],["app",{"sourceInterval":[1545,1567]},"caseInsensitive",[["terminal",{"sourceInterval":[1561,1566]},"now"]]]],"today":["define",{"sourceInterval":[1573,1610]},null,[],["app",{"sourceInterval":[1586,1610]},"caseInsensitive",[["terminal",{"sourceInterval":[1602,1609]},"today"]]]],"tomorrow":["define",{"sourceInterval":[1616,1659]},null,[],["app",{"sourceInterval":[1632,1659]},"caseInsensitive",[["terminal",{"sourceInterval":[1648,1658]},"tomorrow"]]]],"yesterday":["define",{"sourceInterval":[1665,1710]},null,[],["app",{"sourceInterval":[1682,1710]},"caseInsensitive",[["terminal",{"sourceInterval":[1698,1709]},"yesterday"]]]],"dayOfWeek":["define",{"sourceInterval":[1716,1831]},null,[],["alt",{"sourceInterval":[1733,1831]},["app",{"sourceInterval":[1733,1739]},"monday",[]],["app",{"sourceInterval":[1747,1754]},"tuesday",[]],["app",{"sourceInterval":[1762,1771]},"wednesday",[]],["app",{"sourceInterval":[1779,1787]},"thursday",[]],["app",{"sourceInterval":[1795,1801]},"friday",[]],["app",{"sourceInterval":[1809,1817]},"saturday",[]],["app",{"sourceInterval":[1825,1831]},"sunday",[]]]],"monday":["define",{"sourceInterval":[1837,1876]},null,[],["app",{"sourceInterval":[1851,1876]},"caseInsensitive",[["terminal",{"sourceInterval":[1867,1875]},"monday"]]]],"tuesday":["define",{"sourceInterval":[1882,1923]},null,[],["app",{"sourceInterval":[1897,1923]},"caseInsensitive",[["terminal",{"sourceInterval":[1913,1922]},"tuesday"]]]],"wednesday":["define",{"sourceInterval":[1929,1974]},null,[],["app",{"sourceInterval":[1946,1974]},"caseInsensitive",[["terminal",{"sourceInterval":[1962,1973]},"wednesday"]]]],"thursday":["define",{"sourceInterval":[1980,2023]},null,[],["app",{"sourceInterval":[1996,2023]},"caseInsensitive",[["terminal",{"sourceInterval":[2012,2022]},"thursday"]]]],"friday":["define",{"sourceInterval":[2031,2070]},null,[],["app",{"sourceInterval":[2045,2070]},"caseInsensitive",[["terminal",{"sourceInterval":[2061,2069]},"friday"]]]],"saturday":["define",{"sourceInterval":[2076,2119]},null,[],["app",{"sourceInterval":[2092,2119]},"caseInsensitive",[["terminal",{"sourceInterval":[2108,2118]},"saturday"]]]],"sunday":["define",{"sourceInterval":[2125,2164]},null,[],["app",{"sourceInterval":[2139,2164]},"caseInsensitive",[["terminal",{"sourceInterval":[2155,2163]},"sunday"]]]],"unitsOfTime":["define",{"sourceInterval":[2170,2288]},null,[],["alt",{"sourceInterval":[2189,2288]},["app",{"sourceInterval":[2189,2193]},"year",[]],["app",{"sourceInterval":[2201,2206]},"month",[]],["app",{"sourceInterval":[2214,2218]},"week",[]],["app",{"sourceInterval":[2226,2229]},"day",[]],["app",{"sourceInterval":[2237,2241]},"hour",[]],["app",{"sourceInterval":[2249,2255]},"minute",[]],["app",{"sourceInterval":[2263,2269]},"second",[]],["app",{"sourceInterval":[2277,2288]},"millisecond",[]]]],"year":["define",{"sourceInterval":[2294,2372]},null,[],["alt",{"sourceInterval":[2306,2372]},["app",{"sourceInterval":[2306,2330]},"caseInsensitive",[["terminal",{"sourceInterval":[2322,2329]},"years"]]],["app",{"sourceInterval":[2338,2361]},"caseInsensitive",[["terminal",{"sourceInterval":[2354,2360]},"year"]]],["terminal",{"sourceInterval":[2369,2372]},"y"]]],"month":["define",{"sourceInterval":[2378,2459]},null,[],["alt",{"sourceInterval":[2391,2459]},["app",{"sourceInterval":[2391,2416]},"caseInsensitive",[["terminal",{"sourceInterval":[2407,2415]},"months"]]],["app",{"sourceInterval":[2424,2448]},"caseInsensitive",[["terminal",{"sourceInterval":[2440,2447]},"month"]]],["terminal",{"sourceInterval":[2456,2459]},"M"]]],"week":["define",{"sourceInterval":[2465,2543]},null,[],["alt",{"sourceInterval":[2477,2543]},["app",{"sourceInterval":[2477,2501]},"caseInsensitive",[["terminal",{"sourceInterval":[2493,2500]},"weeks"]]],["app",{"sourceInterval":[2509,2532]},"caseInsensitive",[["terminal",{"sourceInterval":[2525,2531]},"week"]]],["terminal",{"sourceInterval":[2540,2543]},"w"]]],"day":["define",{"sourceInterval":[2549,2624]},null,[],["alt",{"sourceInterval":[2560,2624]},["app",{"sourceInterval":[2560,2583]},"caseInsensitive",[["terminal",{"sourceInterval":[2576,2582]},"days"]]],["app",{"sourceInterval":[2591,2613]},"caseInsensitive",[["terminal",{"sourceInterval":[2607,2612]},"day"]]],["terminal",{"sourceInterval":[2621,2624]},"d"]]],"hour":["define",{"sourceInterval":[2630,2708]},null,[],["alt",{"sourceInterval":[2642,2708]},["app",{"sourceInterval":[2642,2666]},"caseInsensitive",[["terminal",{"sourceInterval":[2658,2665]},"hours"]]],["app",{"sourceInterval":[2674,2697]},"caseInsensitive",[["terminal",{"sourceInterval":[2690,2696]},"hour"]]],["terminal",{"sourceInterval":[2705,2708]},"h"]]],"minute":["define",{"sourceInterval":[2714,2798]},null,[],["alt",{"sourceInterval":[2728,2798]},["app",{"sourceInterval":[2728,2754]},"caseInsensitive",[["terminal",{"sourceInterval":[2744,2753]},"minutes"]]],["app",{"sourceInterval":[2762,2787]},"caseInsensitive",[["terminal",{"sourceInterval":[2778,2786]},"minute"]]],["terminal",{"sourceInterval":[2795,2798]},"m"]]],"second":["define",{"sourceInterval":[2808,2892]},null,[],["alt",{"sourceInterval":[2822,2892]},["app",{"sourceInterval":[2822,2848]},"caseInsensitive",[["terminal",{"sourceInterval":[2838,2847]},"seconds"]]],["app",{"sourceInterval":[2856,2881]},"caseInsensitive",[["terminal",{"sourceInterval":[2872,2880]},"second"]]],["terminal",{"sourceInterval":[2889,2892]},"s"]]],"millisecond":["define",{"sourceInterval":[2898,2998]},null,[],["alt",{"sourceInterval":[2917,2998]},["app",{"sourceInterval":[2917,2948]},"caseInsensitive",[["terminal",{"sourceInterval":[2933,2947]},"milliseconds"]]],["app",{"sourceInterval":[2956,2986]},"caseInsensitive",[["terminal",{"sourceInterval":[2972,2985]},"millisecond"]]],["terminal",{"sourceInterval":[2994,2998]},"ms"]]],"until":["define",{"sourceInterval":[3008,3043]},null,[],["alt",{"sourceInterval":[3020,3043]},["terminal",{"sourceInterval":[3020,3027]},"until"],["terminal",{"sourceInterval":[3035,3043]},"before"]]],"since":["define",{"sourceInterval":[3053,3087]},null,[],["alt",{"sourceInterval":[3065,3087]},["terminal",{"sourceInterval":[3065,3072]},"since"],["terminal",{"sourceInterval":[3080,3087]},"after"]]],"number_fract":["define",{"sourceInterval":[3107,3134]},null,[],["seq",{"sourceInterval":[3107,3124]},["star",{"sourceInterval":[3107,3113]},["app",{"sourceInterval":[3107,3112]},"digit",[]]],["terminal",{"sourceInterval":[3114,3117]},"."],["plus",{"sourceInterval":[3118,3124]},["app",{"sourceInterval":[3118,3123]},"digit",[]]]]],"number_whole":["define",{"sourceInterval":[3142,3169]},null,[],["plus",{"sourceInterval":[3142,3148]},["app",{"sourceInterval":[3142,3147]},"digit",[]]]],"number":["define",{"sourceInterval":[3093,3169]},null,[],["alt",{"sourceInterval":[3107,3169]},["app",{"sourceInterval":[3107,3124]},"number_fract",[]],["app",{"sourceInterval":[3142,3148]},"number_whole",[]]]],"integer":["define",{"sourceInterval":[3179,3199]},null,[],["plus",{"sourceInterval":[3193,3199]},["app",{"sourceInterval":[3193,3198]},"digit",[]]]]}]);module.exports=result;