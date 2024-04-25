'use strict';const {makeRecipe}=require('ohm-js');const result={};result.BasicArithmetic=makeRecipe(["grammar",{"source":"BasicArithmetic {\r\n  Expression\r\n    = LogicalShift\r\n\r\n  LogicalShift\r\n    = LogicalShift \"<<\" LogicalShift -- left\r\n    | LogicalShift \">>\" LogicalShift -- right\r\n    | AS \r\n\r\n  // Addition or Subtraction\r\n  AS\r\n    = AS add MD  -- addition\r\n    | AS subtract MD  -- subtraction\r\n    | MD\r\n\r\n  // Multiply or Divide\r\n  MD\r\n    = MD multiply E  -- multiplication\r\n    | MD divide E  -- division\r\n    | MD modulo E  -- modulo\r\n    | E\r\n\r\n  // Exponent\r\n  E\r\n    = P exponent E  -- exponent\r\n    | P\r\n\r\n  // Parenthesis\r\n  P\r\n    = \"(\" Expression \")\"  -- parenthesis\r\n    | Primitive\r\n    \r\n  Primitive\r\n    = \"+\" Primitive -- positive\r\n    | \"-\" Primitive -- negative\r\n    | constant\r\n    | hex\r\n    | number\r\n \r\n  // Lexical Rules\r\n  add \r\n  \t= \"+\"\r\n    | caseInsensitive<\"plus\">\r\n  \t| caseInsensitive<\"add\">\r\n    | caseInsensitive<\"and\">\r\n    \r\n  subtract \r\n    = \"-\"\r\n    | caseInsensitive<\"minus\">\r\n    | caseInsensitive<\"subtract\">\r\n    | caseInsensitive<\"remove\">\r\n    | caseInsensitive<\"take\">\r\n      \r\n  multiply \r\n    = \"*\"\r\n    | \"\\\\*\" // Escaped \\* for markdown\r\n    | \"\\u{00D7}\" // ×\r\n    | caseInsensitive<\"x\">\r\n    | caseInsensitive<\"times by\">\r\n    | caseInsensitive<\"times\">\r\n    | caseInsensitive<\"multiply by\">\r\n    | caseInsensitive<\"multiply\">\r\n      \r\n  divide\r\n    = \"/\"\r\n    | \"\\u{00F7}\" // ÷\r\n    | caseInsensitive<\"divide by\">\r\n    | caseInsensitive<\"divide\">\r\n\r\n  modulo\r\n    = \"%\"\r\n    | caseInsensitive<\"modulo\">\r\n    | caseInsensitive<\"mod\">\r\n\r\n  exponent\r\n    = \"^\"\r\n    | caseInsensitive<\"to the power of\">\r\n    | caseInsensitive<\"power of\">\r\n    | caseInsensitive<\"exponent\">\r\n    | caseInsensitive<\"prime\">\r\n\r\n  constant  \r\n  \t= caseInsensitive<\"PI\"> \r\n    | caseInsensitive<\"E\">\r\n\r\n  number\r\n  = nonEnglishNumber    -- nonEnglish\r\n    | nonEnglishDecimal -- nonEnglishDecimal\r\n    | englishNumber     -- english\r\n    | englishDecimal    -- englishDecimal\r\n    | whole             -- whole\r\n\r\n  nonEnglishNumber\r\n    = &(whole \".\") whole (\".\" whole)* (\",\" whole)\r\n    \r\n  nonEnglishDecimal\r\n    = whole \",\" digit+ ~\".\"\r\n\r\n  englishNumber\r\n    = &(whole \",\") whole (\",\" whole)* (\".\" whole)\r\n\r\n  englishDecimal\r\n    = whole \".\" digit+ ~\",\"\r\n\r\n  whole\r\n    = digit+\r\n\r\n  hex\r\n    = \"0x\" hexDigit+\r\n    | hexDigit+ \"h\"\r\n}"},"BasicArithmetic",null,"Expression",{"Expression":["define",{"sourceInterval":[21,51]},null,[],["app",{"sourceInterval":[39,51]},"LogicalShift",[]]],"LogicalShift_left":["define",{"sourceInterval":[77,115]},null,[],["seq",{"sourceInterval":[77,107]},["app",{"sourceInterval":[77,89]},"LogicalShift",[]],["terminal",{"sourceInterval":[90,94]},"<<"],["app",{"sourceInterval":[95,107]},"LogicalShift",[]]]],"LogicalShift_right":["define",{"sourceInterval":[123,162]},null,[],["seq",{"sourceInterval":[123,153]},["app",{"sourceInterval":[123,135]},"LogicalShift",[]],["terminal",{"sourceInterval":[136,140]},">>"],["app",{"sourceInterval":[141,153]},"LogicalShift",[]]]],"LogicalShift":["define",{"sourceInterval":[57,172]},null,[],["alt",{"sourceInterval":[77,172]},["app",{"sourceInterval":[77,107]},"LogicalShift_left",[]],["app",{"sourceInterval":[123,153]},"LogicalShift_right",[]],["app",{"sourceInterval":[170,172]},"AS",[]]]],"AS_addition":["define",{"sourceInterval":[219,241]},null,[],["seq",{"sourceInterval":[219,228]},["app",{"sourceInterval":[219,221]},"AS",[]],["app",{"sourceInterval":[222,225]},"add",[]],["app",{"sourceInterval":[226,228]},"MD",[]]]],"AS_subtraction":["define",{"sourceInterval":[249,279]},null,[],["seq",{"sourceInterval":[249,263]},["app",{"sourceInterval":[249,251]},"AS",[]],["app",{"sourceInterval":[252,260]},"subtract",[]],["app",{"sourceInterval":[261,263]},"MD",[]]]],"AS":["define",{"sourceInterval":[209,289]},null,[],["alt",{"sourceInterval":[219,289]},["app",{"sourceInterval":[219,228]},"AS_addition",[]],["app",{"sourceInterval":[249,263]},"AS_subtraction",[]],["app",{"sourceInterval":[287,289]},"MD",[]]]],"MD_multiplication":["define",{"sourceInterval":[330,362]},null,[],["seq",{"sourceInterval":[330,343]},["app",{"sourceInterval":[330,332]},"MD",[]],["app",{"sourceInterval":[333,341]},"multiply",[]],["app",{"sourceInterval":[342,343]},"E",[]]]],"MD_division":["define",{"sourceInterval":[370,394]},null,[],["seq",{"sourceInterval":[370,381]},["app",{"sourceInterval":[370,372]},"MD",[]],["app",{"sourceInterval":[373,379]},"divide",[]],["app",{"sourceInterval":[380,381]},"E",[]]]],"MD_modulo":["define",{"sourceInterval":[402,424]},null,[],["seq",{"sourceInterval":[402,413]},["app",{"sourceInterval":[402,404]},"MD",[]],["app",{"sourceInterval":[405,411]},"modulo",[]],["app",{"sourceInterval":[412,413]},"E",[]]]],"MD":["define",{"sourceInterval":[320,433]},null,[],["alt",{"sourceInterval":[330,433]},["app",{"sourceInterval":[330,343]},"MD_multiplication",[]],["app",{"sourceInterval":[370,381]},"MD_division",[]],["app",{"sourceInterval":[402,413]},"MD_modulo",[]],["app",{"sourceInterval":[432,433]},"E",[]]]],"E_exponent":["define",{"sourceInterval":[463,488]},null,[],["seq",{"sourceInterval":[463,475]},["app",{"sourceInterval":[463,464]},"P",[]],["app",{"sourceInterval":[465,473]},"exponent",[]],["app",{"sourceInterval":[474,475]},"E",[]]]],"E":["define",{"sourceInterval":[454,497]},null,[],["alt",{"sourceInterval":[463,497]},["app",{"sourceInterval":[463,475]},"E_exponent",[]],["app",{"sourceInterval":[496,497]},"P",[]]]],"P_parenthesis":["define",{"sourceInterval":[530,564]},null,[],["seq",{"sourceInterval":[530,548]},["terminal",{"sourceInterval":[530,533]},"("],["app",{"sourceInterval":[534,544]},"Expression",[]],["terminal",{"sourceInterval":[545,548]},")"]]],"P":["define",{"sourceInterval":[521,581]},null,[],["alt",{"sourceInterval":[530,581]},["app",{"sourceInterval":[530,548]},"P_parenthesis",[]],["app",{"sourceInterval":[572,581]},"Primitive",[]]]],"Primitive_positive":["define",{"sourceInterval":[608,633]},null,[],["seq",{"sourceInterval":[608,621]},["terminal",{"sourceInterval":[608,611]},"+"],["app",{"sourceInterval":[612,621]},"Primitive",[]]]],"Primitive_negative":["define",{"sourceInterval":[641,666]},null,[],["seq",{"sourceInterval":[641,654]},["terminal",{"sourceInterval":[641,644]},"-"],["app",{"sourceInterval":[645,654]},"Primitive",[]]]],"Primitive":["define",{"sourceInterval":[591,707]},null,[],["alt",{"sourceInterval":[608,707]},["app",{"sourceInterval":[608,621]},"Primitive_positive",[]],["app",{"sourceInterval":[641,654]},"Primitive_negative",[]],["app",{"sourceInterval":[674,682]},"constant",[]],["app",{"sourceInterval":[690,693]},"hex",[]],["app",{"sourceInterval":[701,707]},"number",[]]]],"add":["define",{"sourceInterval":[734,838]},null,[],["alt",{"sourceInterval":[745,838]},["terminal",{"sourceInterval":[745,748]},"+"],["app",{"sourceInterval":[756,779]},"caseInsensitive",[["terminal",{"sourceInterval":[772,778]},"plus"]]],["app",{"sourceInterval":[786,808]},"caseInsensitive",[["terminal",{"sourceInterval":[802,807]},"add"]]],["app",{"sourceInterval":[816,838]},"caseInsensitive",[["terminal",{"sourceInterval":[832,837]},"and"]]]]],"subtract":["define",{"sourceInterval":[848,999]},null,[],["alt",{"sourceInterval":[865,999]},["terminal",{"sourceInterval":[865,868]},"-"],["app",{"sourceInterval":[876,900]},"caseInsensitive",[["terminal",{"sourceInterval":[892,899]},"minus"]]],["app",{"sourceInterval":[908,935]},"caseInsensitive",[["terminal",{"sourceInterval":[924,934]},"subtract"]]],["app",{"sourceInterval":[943,968]},"caseInsensitive",[["terminal",{"sourceInterval":[959,967]},"remove"]]],["app",{"sourceInterval":[976,999]},"caseInsensitive",[["terminal",{"sourceInterval":[992,998]},"take"]]]]],"multiply":["define",{"sourceInterval":[1011,1262]},null,[],["alt",{"sourceInterval":[1028,1262]},["terminal",{"sourceInterval":[1028,1031]},"*"],["terminal",{"sourceInterval":[1039,1044]},"\\*"],["terminal",{"sourceInterval":[1079,1089]},"×"],["app",{"sourceInterval":[1102,1122]},"caseInsensitive",[["terminal",{"sourceInterval":[1118,1121]},"x"]]],["app",{"sourceInterval":[1130,1157]},"caseInsensitive",[["terminal",{"sourceInterval":[1146,1156]},"times by"]]],["app",{"sourceInterval":[1165,1189]},"caseInsensitive",[["terminal",{"sourceInterval":[1181,1188]},"times"]]],["app",{"sourceInterval":[1197,1227]},"caseInsensitive",[["terminal",{"sourceInterval":[1213,1226]},"multiply by"]]],["app",{"sourceInterval":[1235,1262]},"caseInsensitive",[["terminal",{"sourceInterval":[1251,1261]},"multiply"]]]]],"divide":["define",{"sourceInterval":[1274,1383]},null,[],["alt",{"sourceInterval":[1288,1383]},["terminal",{"sourceInterval":[1288,1291]},"/"],["terminal",{"sourceInterval":[1299,1309]},"÷"],["app",{"sourceInterval":[1322,1350]},"caseInsensitive",[["terminal",{"sourceInterval":[1338,1349]},"divide by"]]],["app",{"sourceInterval":[1358,1383]},"caseInsensitive",[["terminal",{"sourceInterval":[1374,1382]},"divide"]]]]],"modulo":["define",{"sourceInterval":[1389,1469]},null,[],["alt",{"sourceInterval":[1403,1469]},["terminal",{"sourceInterval":[1403,1406]},"%"],["app",{"sourceInterval":[1414,1439]},"caseInsensitive",[["terminal",{"sourceInterval":[1430,1438]},"modulo"]]],["app",{"sourceInterval":[1447,1469]},"caseInsensitive",[["terminal",{"sourceInterval":[1463,1468]},"mod"]]]]],"exponent":["define",{"sourceInterval":[1475,1638]},null,[],["alt",{"sourceInterval":[1491,1638]},["terminal",{"sourceInterval":[1491,1494]},"^"],["app",{"sourceInterval":[1502,1536]},"caseInsensitive",[["terminal",{"sourceInterval":[1518,1535]},"to the power of"]]],["app",{"sourceInterval":[1544,1571]},"caseInsensitive",[["terminal",{"sourceInterval":[1560,1570]},"power of"]]],["app",{"sourceInterval":[1579,1606]},"caseInsensitive",[["terminal",{"sourceInterval":[1595,1605]},"exponent"]]],["app",{"sourceInterval":[1614,1638]},"caseInsensitive",[["terminal",{"sourceInterval":[1630,1637]},"prime"]]]]],"constant":["define",{"sourceInterval":[1644,1711]},null,[],["alt",{"sourceInterval":[1661,1711]},["app",{"sourceInterval":[1661,1682]},"caseInsensitive",[["terminal",{"sourceInterval":[1677,1681]},"PI"]]],["app",{"sourceInterval":[1691,1711]},"caseInsensitive",[["terminal",{"sourceInterval":[1707,1710]},"E"]]]]],"number_nonEnglish":["define",{"sourceInterval":[1729,1762]},null,[],["app",{"sourceInterval":[1729,1745]},"nonEnglishNumber",[]]],"number_nonEnglishDecimal":["define",{"sourceInterval":[1770,1808]},null,[],["app",{"sourceInterval":[1770,1787]},"nonEnglishDecimal",[]]],"number_english":["define",{"sourceInterval":[1816,1844]},null,[],["app",{"sourceInterval":[1816,1829]},"englishNumber",[]]],"number_englishDecimal":["define",{"sourceInterval":[1852,1887]},null,[],["app",{"sourceInterval":[1852,1866]},"englishDecimal",[]]],"number_whole":["define",{"sourceInterval":[1895,1921]},null,[],["app",{"sourceInterval":[1895,1900]},"whole",[]]],"number":["define",{"sourceInterval":[1717,1921]},null,[],["alt",{"sourceInterval":[1729,1921]},["app",{"sourceInterval":[1729,1745]},"number_nonEnglish",[]],["app",{"sourceInterval":[1770,1787]},"number_nonEnglishDecimal",[]],["app",{"sourceInterval":[1816,1829]},"number_english",[]],["app",{"sourceInterval":[1852,1866]},"number_englishDecimal",[]],["app",{"sourceInterval":[1895,1900]},"number_whole",[]]]],"nonEnglishNumber":["define",{"sourceInterval":[1927,1994]},null,[],["seq",{"sourceInterval":[1951,1994]},["lookahead",{"sourceInterval":[1951,1963]},["seq",{"sourceInterval":[1953,1962]},["app",{"sourceInterval":[1953,1958]},"whole",[]],["terminal",{"sourceInterval":[1959,1962]},"."]]],["app",{"sourceInterval":[1964,1969]},"whole",[]],["star",{"sourceInterval":[1970,1982]},["seq",{"sourceInterval":[1971,1980]},["terminal",{"sourceInterval":[1971,1974]},"."],["app",{"sourceInterval":[1975,1980]},"whole",[]]]],["terminal",{"sourceInterval":[1984,1987]},","],["app",{"sourceInterval":[1988,1993]},"whole",[]]]],"nonEnglishDecimal":["define",{"sourceInterval":[2004,2050]},null,[],["seq",{"sourceInterval":[2029,2050]},["app",{"sourceInterval":[2029,2034]},"whole",[]],["terminal",{"sourceInterval":[2035,2038]},","],["plus",{"sourceInterval":[2039,2045]},["app",{"sourceInterval":[2039,2044]},"digit",[]]],["not",{"sourceInterval":[2046,2050]},["terminal",{"sourceInterval":[2047,2050]},"."]]]],"englishNumber":["define",{"sourceInterval":[2056,2120]},null,[],["seq",{"sourceInterval":[2077,2120]},["lookahead",{"sourceInterval":[2077,2089]},["seq",{"sourceInterval":[2079,2088]},["app",{"sourceInterval":[2079,2084]},"whole",[]],["terminal",{"sourceInterval":[2085,2088]},","]]],["app",{"sourceInterval":[2090,2095]},"whole",[]],["star",{"sourceInterval":[2096,2108]},["seq",{"sourceInterval":[2097,2106]},["terminal",{"sourceInterval":[2097,2100]},","],["app",{"sourceInterval":[2101,2106]},"whole",[]]]],["terminal",{"sourceInterval":[2110,2113]},"."],["app",{"sourceInterval":[2114,2119]},"whole",[]]]],"englishDecimal":["define",{"sourceInterval":[2126,2169]},null,[],["seq",{"sourceInterval":[2148,2169]},["app",{"sourceInterval":[2148,2153]},"whole",[]],["terminal",{"sourceInterval":[2154,2157]},"."],["plus",{"sourceInterval":[2158,2164]},["app",{"sourceInterval":[2158,2163]},"digit",[]]],["not",{"sourceInterval":[2165,2169]},["terminal",{"sourceInterval":[2166,2169]},","]]]],"whole":["define",{"sourceInterval":[2175,2194]},null,[],["plus",{"sourceInterval":[2188,2194]},["app",{"sourceInterval":[2188,2193]},"digit",[]]]],"hex":["define",{"sourceInterval":[2200,2246]},null,[],["alt",{"sourceInterval":[2211,2246]},["seq",{"sourceInterval":[2211,2225]},["terminal",{"sourceInterval":[2211,2215]},"0x"],["plus",{"sourceInterval":[2216,2225]},["app",{"sourceInterval":[2216,2224]},"hexDigit",[]]]],["seq",{"sourceInterval":[2233,2246]},["plus",{"sourceInterval":[2233,2242]},["app",{"sourceInterval":[2233,2241]},"hexDigit",[]]],["terminal",{"sourceInterval":[2243,2246]},"h"]]]]}]);result.FunctionArithmetic=makeRecipe(["grammar",{"source":"FunctionArithmetic <: BasicArithmetic {\r\n  P\r\n    := \"(\" Expression \")\"  -- parenthesis\r\n    | Function\r\n    | Primitive\r\n\r\n  Function\r\n    = DegreesToRadians\r\n    | RadiansToDegrees\r\n    | LogBase\r\n    | JavascriptMathObjectFunction\r\n\r\n  LogBase \r\n    = caseInsensitive<\"logb\"> \"(\" number \",\" number \")\"\r\n    | caseInsensitive<\"logBase\"> \"(\" number \",\" number \")\"\r\n\r\n  DegreesToRadians \r\n    = caseInsensitive<\"degToRad\"> \"(\" number \")\"\r\n    | caseInsensitive<\"degreesToRadians\"> \"(\" number \")\"\r\n    | caseInsensitive<\"radians\"> \"(\" number \")\"\r\n    | caseInsensitive<\"toRadians\"> \"(\" number \")\"\r\n\r\n  RadiansToDegrees \r\n    = caseInsensitive<\"radToDeg\"> \"(\" number \")\"\r\n    | caseInsensitive<\"radiansToDegrees\"> \"(\" number \")\"\r\n    | caseInsensitive<\"degrees\"> \"(\" number \")\"\r\n    | caseInsensitive<\"toDegrees\"> \"(\" number \")\"\r\n\r\n  // Pass-through for Math.* functions from JS\r\n  JavascriptMathObjectFunction = mathJsName \"(\" ListOf<Expression, \",\"> \")\"\r\n\r\n  mathJsName \r\n \t  = caseInsensitive<\"sinh\">\r\n    | caseInsensitive<\"sin\">\r\n    | caseInsensitive<\"abs\">\r\n    | caseInsensitive<\"acosh\">\r\n    | caseInsensitive<\"acos\">\r\n    | caseInsensitive<\"asinh\">\r\n    | caseInsensitive<\"asin\">\r\n    | caseInsensitive<\"atan2\">\r\n    | caseInsensitive<\"atanh\">\r\n    | caseInsensitive<\"atan\">\r\n    | caseInsensitive<\"cbrt\">\r\n    | caseInsensitive<\"ceil\">\r\n    | caseInsensitive<\"clz32\">\r\n    | caseInsensitive<\"cosh\">\r\n    | caseInsensitive<\"cos\">\r\n    | caseInsensitive<\"expm1\">\r\n    | caseInsensitive<\"exp\">\r\n    | caseInsensitive<\"floor\">\r\n    | caseInsensitive<\"fround\">\r\n    | caseInsensitive<\"hypot\">\r\n    | caseInsensitive<\"imul\">\r\n    | caseInsensitive<\"log10\">\r\n    | caseInsensitive<\"log1p\">\r\n    | caseInsensitive<\"log2\">\r\n    | caseInsensitive<\"log\">\r\n    | caseInsensitive<\"max\">\r\n    | caseInsensitive<\"min\">\r\n    | caseInsensitive<\"pow\">\r\n    | caseInsensitive<\"random\">\r\n    | caseInsensitive<\"round\">\r\n    | caseInsensitive<\"sign\">\r\n    | caseInsensitive<\"sqrt\">\r\n    | caseInsensitive<\"tanh\">\r\n    | caseInsensitive<\"tan\">\r\n    | caseInsensitive<\"trunc\">\r\n}"},"FunctionArithmetic",result.BasicArithmetic,"Expression",{"P_parenthesis":["override",{"sourceInterval":[53,87]},null,[],["seq",{"sourceInterval":[53,71]},["terminal",{"sourceInterval":[53,56]},"("],["app",{"sourceInterval":[57,67]},"Expression",[]],["terminal",{"sourceInterval":[68,71]},")"]]],"P":["override",{"sourceInterval":[43,120]},null,[],["alt",{"sourceInterval":[53,120]},["app",{"sourceInterval":[53,71]},"P_parenthesis",[]],["app",{"sourceInterval":[95,103]},"Function",[]],["app",{"sourceInterval":[111,120]},"Primitive",[]]]],"Function":["define",{"sourceInterval":[126,233]},null,[],["alt",{"sourceInterval":[142,233]},["app",{"sourceInterval":[142,158]},"DegreesToRadians",[]],["app",{"sourceInterval":[166,182]},"RadiansToDegrees",[]],["app",{"sourceInterval":[190,197]},"LogBase",[]],["app",{"sourceInterval":[205,233]},"JavascriptMathObjectFunction",[]]]],"LogBase":["define",{"sourceInterval":[239,364]},null,[],["alt",{"sourceInterval":[255,364]},["seq",{"sourceInterval":[255,304]},["app",{"sourceInterval":[255,278]},"caseInsensitive",[["terminal",{"sourceInterval":[271,277]},"logb"]]],["terminal",{"sourceInterval":[279,282]},"("],["app",{"sourceInterval":[283,289]},"number",[]],["terminal",{"sourceInterval":[290,293]},","],["app",{"sourceInterval":[294,300]},"number",[]],["terminal",{"sourceInterval":[301,304]},")"]],["seq",{"sourceInterval":[312,364]},["app",{"sourceInterval":[312,338]},"caseInsensitive",[["terminal",{"sourceInterval":[328,337]},"logBase"]]],["terminal",{"sourceInterval":[339,342]},"("],["app",{"sourceInterval":[343,349]},"number",[]],["terminal",{"sourceInterval":[350,353]},","],["app",{"sourceInterval":[354,360]},"number",[]],["terminal",{"sourceInterval":[361,364]},")"]]]],"DegreesToRadians":["define",{"sourceInterval":[370,595]},null,[],["alt",{"sourceInterval":[395,595]},["seq",{"sourceInterval":[395,437]},["app",{"sourceInterval":[395,422]},"caseInsensitive",[["terminal",{"sourceInterval":[411,421]},"degToRad"]]],["terminal",{"sourceInterval":[423,426]},"("],["app",{"sourceInterval":[427,433]},"number",[]],["terminal",{"sourceInterval":[434,437]},")"]],["seq",{"sourceInterval":[445,495]},["app",{"sourceInterval":[445,480]},"caseInsensitive",[["terminal",{"sourceInterval":[461,479]},"degreesToRadians"]]],["terminal",{"sourceInterval":[481,484]},"("],["app",{"sourceInterval":[485,491]},"number",[]],["terminal",{"sourceInterval":[492,495]},")"]],["seq",{"sourceInterval":[503,544]},["app",{"sourceInterval":[503,529]},"caseInsensitive",[["terminal",{"sourceInterval":[519,528]},"radians"]]],["terminal",{"sourceInterval":[530,533]},"("],["app",{"sourceInterval":[534,540]},"number",[]],["terminal",{"sourceInterval":[541,544]},")"]],["seq",{"sourceInterval":[552,595]},["app",{"sourceInterval":[552,580]},"caseInsensitive",[["terminal",{"sourceInterval":[568,579]},"toRadians"]]],["terminal",{"sourceInterval":[581,584]},"("],["app",{"sourceInterval":[585,591]},"number",[]],["terminal",{"sourceInterval":[592,595]},")"]]]],"RadiansToDegrees":["define",{"sourceInterval":[601,826]},null,[],["alt",{"sourceInterval":[626,826]},["seq",{"sourceInterval":[626,668]},["app",{"sourceInterval":[626,653]},"caseInsensitive",[["terminal",{"sourceInterval":[642,652]},"radToDeg"]]],["terminal",{"sourceInterval":[654,657]},"("],["app",{"sourceInterval":[658,664]},"number",[]],["terminal",{"sourceInterval":[665,668]},")"]],["seq",{"sourceInterval":[676,726]},["app",{"sourceInterval":[676,711]},"caseInsensitive",[["terminal",{"sourceInterval":[692,710]},"radiansToDegrees"]]],["terminal",{"sourceInterval":[712,715]},"("],["app",{"sourceInterval":[716,722]},"number",[]],["terminal",{"sourceInterval":[723,726]},")"]],["seq",{"sourceInterval":[734,775]},["app",{"sourceInterval":[734,760]},"caseInsensitive",[["terminal",{"sourceInterval":[750,759]},"degrees"]]],["terminal",{"sourceInterval":[761,764]},"("],["app",{"sourceInterval":[765,771]},"number",[]],["terminal",{"sourceInterval":[772,775]},")"]],["seq",{"sourceInterval":[783,826]},["app",{"sourceInterval":[783,811]},"caseInsensitive",[["terminal",{"sourceInterval":[799,810]},"toDegrees"]]],["terminal",{"sourceInterval":[812,815]},"("],["app",{"sourceInterval":[816,822]},"number",[]],["terminal",{"sourceInterval":[823,826]},")"]]]],"JavascriptMathObjectFunction":["define",{"sourceInterval":[880,953]},null,[],["seq",{"sourceInterval":[911,953]},["app",{"sourceInterval":[911,921]},"mathJsName",[]],["terminal",{"sourceInterval":[922,925]},"("],["app",{"sourceInterval":[926,949]},"ListOf",[["app",{"sourceInterval":[933,943]},"Expression",[]],["terminal",{"sourceInterval":[945,948]},","]]],["terminal",{"sourceInterval":[950,953]},")"]]],"mathJsName":["define",{"sourceInterval":[959,2062]},null,[],["alt",{"sourceInterval":[978,2062]},["app",{"sourceInterval":[978,1001]},"caseInsensitive",[["terminal",{"sourceInterval":[994,1000]},"sinh"]]],["app",{"sourceInterval":[1009,1031]},"caseInsensitive",[["terminal",{"sourceInterval":[1025,1030]},"sin"]]],["app",{"sourceInterval":[1039,1061]},"caseInsensitive",[["terminal",{"sourceInterval":[1055,1060]},"abs"]]],["app",{"sourceInterval":[1069,1093]},"caseInsensitive",[["terminal",{"sourceInterval":[1085,1092]},"acosh"]]],["app",{"sourceInterval":[1101,1124]},"caseInsensitive",[["terminal",{"sourceInterval":[1117,1123]},"acos"]]],["app",{"sourceInterval":[1132,1156]},"caseInsensitive",[["terminal",{"sourceInterval":[1148,1155]},"asinh"]]],["app",{"sourceInterval":[1164,1187]},"caseInsensitive",[["terminal",{"sourceInterval":[1180,1186]},"asin"]]],["app",{"sourceInterval":[1195,1219]},"caseInsensitive",[["terminal",{"sourceInterval":[1211,1218]},"atan2"]]],["app",{"sourceInterval":[1227,1251]},"caseInsensitive",[["terminal",{"sourceInterval":[1243,1250]},"atanh"]]],["app",{"sourceInterval":[1259,1282]},"caseInsensitive",[["terminal",{"sourceInterval":[1275,1281]},"atan"]]],["app",{"sourceInterval":[1290,1313]},"caseInsensitive",[["terminal",{"sourceInterval":[1306,1312]},"cbrt"]]],["app",{"sourceInterval":[1321,1344]},"caseInsensitive",[["terminal",{"sourceInterval":[1337,1343]},"ceil"]]],["app",{"sourceInterval":[1352,1376]},"caseInsensitive",[["terminal",{"sourceInterval":[1368,1375]},"clz32"]]],["app",{"sourceInterval":[1384,1407]},"caseInsensitive",[["terminal",{"sourceInterval":[1400,1406]},"cosh"]]],["app",{"sourceInterval":[1415,1437]},"caseInsensitive",[["terminal",{"sourceInterval":[1431,1436]},"cos"]]],["app",{"sourceInterval":[1445,1469]},"caseInsensitive",[["terminal",{"sourceInterval":[1461,1468]},"expm1"]]],["app",{"sourceInterval":[1477,1499]},"caseInsensitive",[["terminal",{"sourceInterval":[1493,1498]},"exp"]]],["app",{"sourceInterval":[1507,1531]},"caseInsensitive",[["terminal",{"sourceInterval":[1523,1530]},"floor"]]],["app",{"sourceInterval":[1539,1564]},"caseInsensitive",[["terminal",{"sourceInterval":[1555,1563]},"fround"]]],["app",{"sourceInterval":[1572,1596]},"caseInsensitive",[["terminal",{"sourceInterval":[1588,1595]},"hypot"]]],["app",{"sourceInterval":[1604,1627]},"caseInsensitive",[["terminal",{"sourceInterval":[1620,1626]},"imul"]]],["app",{"sourceInterval":[1635,1659]},"caseInsensitive",[["terminal",{"sourceInterval":[1651,1658]},"log10"]]],["app",{"sourceInterval":[1667,1691]},"caseInsensitive",[["terminal",{"sourceInterval":[1683,1690]},"log1p"]]],["app",{"sourceInterval":[1699,1722]},"caseInsensitive",[["terminal",{"sourceInterval":[1715,1721]},"log2"]]],["app",{"sourceInterval":[1730,1752]},"caseInsensitive",[["terminal",{"sourceInterval":[1746,1751]},"log"]]],["app",{"sourceInterval":[1760,1782]},"caseInsensitive",[["terminal",{"sourceInterval":[1776,1781]},"max"]]],["app",{"sourceInterval":[1790,1812]},"caseInsensitive",[["terminal",{"sourceInterval":[1806,1811]},"min"]]],["app",{"sourceInterval":[1820,1842]},"caseInsensitive",[["terminal",{"sourceInterval":[1836,1841]},"pow"]]],["app",{"sourceInterval":[1850,1875]},"caseInsensitive",[["terminal",{"sourceInterval":[1866,1874]},"random"]]],["app",{"sourceInterval":[1883,1907]},"caseInsensitive",[["terminal",{"sourceInterval":[1899,1906]},"round"]]],["app",{"sourceInterval":[1915,1938]},"caseInsensitive",[["terminal",{"sourceInterval":[1931,1937]},"sign"]]],["app",{"sourceInterval":[1946,1969]},"caseInsensitive",[["terminal",{"sourceInterval":[1962,1968]},"sqrt"]]],["app",{"sourceInterval":[1977,2000]},"caseInsensitive",[["terminal",{"sourceInterval":[1993,1999]},"tanh"]]],["app",{"sourceInterval":[2008,2030]},"caseInsensitive",[["terminal",{"sourceInterval":[2024,2029]},"tan"]]],["app",{"sourceInterval":[2038,2062]},"caseInsensitive",[["terminal",{"sourceInterval":[2054,2061]},"trunc"]]]]]}]);module.exports=result;