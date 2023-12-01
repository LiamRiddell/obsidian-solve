'use strict';const {makeRecipe}=require('ohm-js');const result=makeRecipe(["grammar",{"source":"BasicArithmetic {\r\n  Expression\r\n    = LogicalShift\r\n\r\n  LogicalShift\r\n    = LogicalShift \"<<\" LogicalShift -- left\r\n    | LogicalShift \">>\" LogicalShift -- right\r\n    | AS \r\n\r\n  // Addition or Subtraction\r\n  AS\r\n    = AS add MD  -- addition\r\n    | AS subtract MD  -- subtraction\r\n    | MD\r\n\r\n  // Multiply or Divide\r\n  MD\r\n    = MD multiply E  -- multiplication\r\n    | MD divide E  -- division\r\n    | MD modulo E  -- modulo\r\n    | E\r\n\r\n  // Exponent\r\n  E\r\n    = P exponent E  -- exponent\r\n    | P\r\n\r\n  // Parenthesis\r\n  P\r\n    = \"(\" Expression \")\"  -- parenthesis\r\n    | Primitive\r\n    \r\n  Primitive\r\n    = \"+\" Primitive -- positive\r\n    | \"-\" Primitive -- negative\r\n    | constant\r\n    | hex\r\n    | number\r\n \r\n  // Lexical Rules\r\n  add \r\n  \t= \"+\"\r\n    | caseInsensitive<\"plus\">\r\n  \t| caseInsensitive<\"add\">\r\n    | caseInsensitive<\"and\">\r\n    \r\n  subtract \r\n    = \"-\"\r\n    | caseInsensitive<\"minus\">\r\n    | caseInsensitive<\"subtract\">\r\n    | caseInsensitive<\"remove\">\r\n    | caseInsensitive<\"take\">\r\n      \r\n  multiply \r\n    = \"*\"\r\n    | \"\\\\*\" // Escaped \\* for markdown\r\n    | \"\\u{00D7}\" // ×\r\n    | caseInsensitive<\"x\">\r\n    | caseInsensitive<\"times by\">\r\n    | caseInsensitive<\"times\">\r\n    | caseInsensitive<\"multiply by\">\r\n    | caseInsensitive<\"multiply\">\r\n      \r\n  divide\r\n    = \"/\"\r\n    | \"\\u{00F7}\" // ÷\r\n    | caseInsensitive<\"divide by\">\r\n    | caseInsensitive<\"divide\">\r\n\r\n  modulo\r\n    = \"%\"\r\n    | caseInsensitive<\"modulo\">\r\n    | caseInsensitive<\"mod\">\r\n\r\n  exponent\r\n    = \"^\"\r\n    | caseInsensitive<\"to the power of\">\r\n    | caseInsensitive<\"power of\">\r\n    | caseInsensitive<\"exponent\">\r\n    | caseInsensitive<\"prime\">\r\n\r\n  constant  \r\n  \t= caseInsensitive<\"PI\"> \r\n    | caseInsensitive<\"E\">\r\n\r\n  number\r\n    = digit* \".\" digit+  -- fract\r\n    | digit+             -- whole\r\n  \r\n  hex\r\n    = \"0x\" hexDigit+\r\n    | hexDigit+ \"h\"\r\n}"},"BasicArithmetic",null,"Expression",{"Expression":["define",{"sourceInterval":[21,51]},null,[],["app",{"sourceInterval":[39,51]},"LogicalShift",[]]],"LogicalShift_left":["define",{"sourceInterval":[77,115]},null,[],["seq",{"sourceInterval":[77,107]},["app",{"sourceInterval":[77,89]},"LogicalShift",[]],["terminal",{"sourceInterval":[90,94]},"<<"],["app",{"sourceInterval":[95,107]},"LogicalShift",[]]]],"LogicalShift_right":["define",{"sourceInterval":[123,162]},null,[],["seq",{"sourceInterval":[123,153]},["app",{"sourceInterval":[123,135]},"LogicalShift",[]],["terminal",{"sourceInterval":[136,140]},">>"],["app",{"sourceInterval":[141,153]},"LogicalShift",[]]]],"LogicalShift":["define",{"sourceInterval":[57,172]},null,[],["alt",{"sourceInterval":[77,172]},["app",{"sourceInterval":[77,107]},"LogicalShift_left",[]],["app",{"sourceInterval":[123,153]},"LogicalShift_right",[]],["app",{"sourceInterval":[170,172]},"AS",[]]]],"AS_addition":["define",{"sourceInterval":[219,241]},null,[],["seq",{"sourceInterval":[219,228]},["app",{"sourceInterval":[219,221]},"AS",[]],["app",{"sourceInterval":[222,225]},"add",[]],["app",{"sourceInterval":[226,228]},"MD",[]]]],"AS_subtraction":["define",{"sourceInterval":[249,279]},null,[],["seq",{"sourceInterval":[249,263]},["app",{"sourceInterval":[249,251]},"AS",[]],["app",{"sourceInterval":[252,260]},"subtract",[]],["app",{"sourceInterval":[261,263]},"MD",[]]]],"AS":["define",{"sourceInterval":[209,289]},null,[],["alt",{"sourceInterval":[219,289]},["app",{"sourceInterval":[219,228]},"AS_addition",[]],["app",{"sourceInterval":[249,263]},"AS_subtraction",[]],["app",{"sourceInterval":[287,289]},"MD",[]]]],"MD_multiplication":["define",{"sourceInterval":[330,362]},null,[],["seq",{"sourceInterval":[330,343]},["app",{"sourceInterval":[330,332]},"MD",[]],["app",{"sourceInterval":[333,341]},"multiply",[]],["app",{"sourceInterval":[342,343]},"E",[]]]],"MD_division":["define",{"sourceInterval":[370,394]},null,[],["seq",{"sourceInterval":[370,381]},["app",{"sourceInterval":[370,372]},"MD",[]],["app",{"sourceInterval":[373,379]},"divide",[]],["app",{"sourceInterval":[380,381]},"E",[]]]],"MD_modulo":["define",{"sourceInterval":[402,424]},null,[],["seq",{"sourceInterval":[402,413]},["app",{"sourceInterval":[402,404]},"MD",[]],["app",{"sourceInterval":[405,411]},"modulo",[]],["app",{"sourceInterval":[412,413]},"E",[]]]],"MD":["define",{"sourceInterval":[320,433]},null,[],["alt",{"sourceInterval":[330,433]},["app",{"sourceInterval":[330,343]},"MD_multiplication",[]],["app",{"sourceInterval":[370,381]},"MD_division",[]],["app",{"sourceInterval":[402,413]},"MD_modulo",[]],["app",{"sourceInterval":[432,433]},"E",[]]]],"E_exponent":["define",{"sourceInterval":[463,488]},null,[],["seq",{"sourceInterval":[463,475]},["app",{"sourceInterval":[463,464]},"P",[]],["app",{"sourceInterval":[465,473]},"exponent",[]],["app",{"sourceInterval":[474,475]},"E",[]]]],"E":["define",{"sourceInterval":[454,497]},null,[],["alt",{"sourceInterval":[463,497]},["app",{"sourceInterval":[463,475]},"E_exponent",[]],["app",{"sourceInterval":[496,497]},"P",[]]]],"P_parenthesis":["define",{"sourceInterval":[530,564]},null,[],["seq",{"sourceInterval":[530,548]},["terminal",{"sourceInterval":[530,533]},"("],["app",{"sourceInterval":[534,544]},"Expression",[]],["terminal",{"sourceInterval":[545,548]},")"]]],"P":["define",{"sourceInterval":[521,581]},null,[],["alt",{"sourceInterval":[530,581]},["app",{"sourceInterval":[530,548]},"P_parenthesis",[]],["app",{"sourceInterval":[572,581]},"Primitive",[]]]],"Primitive_positive":["define",{"sourceInterval":[608,633]},null,[],["seq",{"sourceInterval":[608,621]},["terminal",{"sourceInterval":[608,611]},"+"],["app",{"sourceInterval":[612,621]},"Primitive",[]]]],"Primitive_negative":["define",{"sourceInterval":[641,666]},null,[],["seq",{"sourceInterval":[641,654]},["terminal",{"sourceInterval":[641,644]},"-"],["app",{"sourceInterval":[645,654]},"Primitive",[]]]],"Primitive":["define",{"sourceInterval":[591,707]},null,[],["alt",{"sourceInterval":[608,707]},["app",{"sourceInterval":[608,621]},"Primitive_positive",[]],["app",{"sourceInterval":[641,654]},"Primitive_negative",[]],["app",{"sourceInterval":[674,682]},"constant",[]],["app",{"sourceInterval":[690,693]},"hex",[]],["app",{"sourceInterval":[701,707]},"number",[]]]],"add":["define",{"sourceInterval":[734,838]},null,[],["alt",{"sourceInterval":[745,838]},["terminal",{"sourceInterval":[745,748]},"+"],["app",{"sourceInterval":[756,779]},"caseInsensitive",[["terminal",{"sourceInterval":[772,778]},"plus"]]],["app",{"sourceInterval":[786,808]},"caseInsensitive",[["terminal",{"sourceInterval":[802,807]},"add"]]],["app",{"sourceInterval":[816,838]},"caseInsensitive",[["terminal",{"sourceInterval":[832,837]},"and"]]]]],"subtract":["define",{"sourceInterval":[848,999]},null,[],["alt",{"sourceInterval":[865,999]},["terminal",{"sourceInterval":[865,868]},"-"],["app",{"sourceInterval":[876,900]},"caseInsensitive",[["terminal",{"sourceInterval":[892,899]},"minus"]]],["app",{"sourceInterval":[908,935]},"caseInsensitive",[["terminal",{"sourceInterval":[924,934]},"subtract"]]],["app",{"sourceInterval":[943,968]},"caseInsensitive",[["terminal",{"sourceInterval":[959,967]},"remove"]]],["app",{"sourceInterval":[976,999]},"caseInsensitive",[["terminal",{"sourceInterval":[992,998]},"take"]]]]],"multiply":["define",{"sourceInterval":[1011,1262]},null,[],["alt",{"sourceInterval":[1028,1262]},["terminal",{"sourceInterval":[1028,1031]},"*"],["terminal",{"sourceInterval":[1039,1044]},"\\*"],["terminal",{"sourceInterval":[1079,1089]},"×"],["app",{"sourceInterval":[1102,1122]},"caseInsensitive",[["terminal",{"sourceInterval":[1118,1121]},"x"]]],["app",{"sourceInterval":[1130,1157]},"caseInsensitive",[["terminal",{"sourceInterval":[1146,1156]},"times by"]]],["app",{"sourceInterval":[1165,1189]},"caseInsensitive",[["terminal",{"sourceInterval":[1181,1188]},"times"]]],["app",{"sourceInterval":[1197,1227]},"caseInsensitive",[["terminal",{"sourceInterval":[1213,1226]},"multiply by"]]],["app",{"sourceInterval":[1235,1262]},"caseInsensitive",[["terminal",{"sourceInterval":[1251,1261]},"multiply"]]]]],"divide":["define",{"sourceInterval":[1274,1383]},null,[],["alt",{"sourceInterval":[1288,1383]},["terminal",{"sourceInterval":[1288,1291]},"/"],["terminal",{"sourceInterval":[1299,1309]},"÷"],["app",{"sourceInterval":[1322,1350]},"caseInsensitive",[["terminal",{"sourceInterval":[1338,1349]},"divide by"]]],["app",{"sourceInterval":[1358,1383]},"caseInsensitive",[["terminal",{"sourceInterval":[1374,1382]},"divide"]]]]],"modulo":["define",{"sourceInterval":[1389,1469]},null,[],["alt",{"sourceInterval":[1403,1469]},["terminal",{"sourceInterval":[1403,1406]},"%"],["app",{"sourceInterval":[1414,1439]},"caseInsensitive",[["terminal",{"sourceInterval":[1430,1438]},"modulo"]]],["app",{"sourceInterval":[1447,1469]},"caseInsensitive",[["terminal",{"sourceInterval":[1463,1468]},"mod"]]]]],"exponent":["define",{"sourceInterval":[1475,1638]},null,[],["alt",{"sourceInterval":[1491,1638]},["terminal",{"sourceInterval":[1491,1494]},"^"],["app",{"sourceInterval":[1502,1536]},"caseInsensitive",[["terminal",{"sourceInterval":[1518,1535]},"to the power of"]]],["app",{"sourceInterval":[1544,1571]},"caseInsensitive",[["terminal",{"sourceInterval":[1560,1570]},"power of"]]],["app",{"sourceInterval":[1579,1606]},"caseInsensitive",[["terminal",{"sourceInterval":[1595,1605]},"exponent"]]],["app",{"sourceInterval":[1614,1638]},"caseInsensitive",[["terminal",{"sourceInterval":[1630,1637]},"prime"]]]]],"constant":["define",{"sourceInterval":[1644,1711]},null,[],["alt",{"sourceInterval":[1661,1711]},["app",{"sourceInterval":[1661,1682]},"caseInsensitive",[["terminal",{"sourceInterval":[1677,1681]},"PI"]]],["app",{"sourceInterval":[1691,1711]},"caseInsensitive",[["terminal",{"sourceInterval":[1707,1710]},"E"]]]]],"number_fract":["define",{"sourceInterval":[1731,1758]},null,[],["seq",{"sourceInterval":[1731,1748]},["star",{"sourceInterval":[1731,1737]},["app",{"sourceInterval":[1731,1736]},"digit",[]]],["terminal",{"sourceInterval":[1738,1741]},"."],["plus",{"sourceInterval":[1742,1748]},["app",{"sourceInterval":[1742,1747]},"digit",[]]]]],"number_whole":["define",{"sourceInterval":[1766,1793]},null,[],["plus",{"sourceInterval":[1766,1772]},["app",{"sourceInterval":[1766,1771]},"digit",[]]]],"number":["define",{"sourceInterval":[1717,1793]},null,[],["alt",{"sourceInterval":[1731,1793]},["app",{"sourceInterval":[1731,1748]},"number_fract",[]],["app",{"sourceInterval":[1766,1772]},"number_whole",[]]]],"hex":["define",{"sourceInterval":[1801,1847]},null,[],["alt",{"sourceInterval":[1812,1847]},["seq",{"sourceInterval":[1812,1826]},["terminal",{"sourceInterval":[1812,1816]},"0x"],["plus",{"sourceInterval":[1817,1826]},["app",{"sourceInterval":[1817,1825]},"hexDigit",[]]]],["seq",{"sourceInterval":[1834,1847]},["plus",{"sourceInterval":[1834,1843]},["app",{"sourceInterval":[1834,1842]},"hexDigit",[]]],["terminal",{"sourceInterval":[1844,1847]},"h"]]]]}]);module.exports=result;