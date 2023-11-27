'use strict';const {makeRecipe}=require('ohm-js');const result={};result.BasicArithmetic=makeRecipe(["grammar",{"source":"BasicArithmetic {\r\n  Expression\r\n    = LogicalShift\r\n\r\n  LogicalShift\r\n    = LogicalShift \"<<\" LogicalShift -- left\r\n    | LogicalShift \">>\" LogicalShift -- right\r\n    | AS \r\n\r\n  // Addition or Subtraction\r\n  AS\r\n    = AS add MD  -- addition\r\n    | AS subtract MD  -- subtraction\r\n    | MD\r\n\r\n  // Multiply or Divide\r\n  MD\r\n    = MD multiply E  -- multiplication\r\n    | MD divide E  -- division\r\n    | MD modulo E  -- modulo\r\n    | E\r\n\r\n  // Exponent\r\n  E\r\n    = P exponent E  -- exponent\r\n    | P\r\n\r\n  // Parenthesis\r\n  P\r\n    = \"(\" Expression \")\"  -- parenthesis\r\n    | Primitive\r\n    \r\n  Primitive\r\n    = \"+\" Primitive -- positive\r\n    | \"-\" Primitive -- negative\r\n    | constant\r\n    | hex\r\n    | number\r\n \r\n  // Lexical Rules\r\n  add \r\n  \t= \"+\"\r\n    | caseInsensitive<\"plus\">\r\n  \t| caseInsensitive<\"add\">\r\n    | caseInsensitive<\"and\">\r\n    \r\n  subtract \r\n    = \"-\"\r\n    | caseInsensitive<\"minus\">\r\n    | caseInsensitive<\"subtract\">\r\n    | caseInsensitive<\"remove\">\r\n    | caseInsensitive<\"take\">\r\n      \r\n  multiply \r\n    = \"*\"\r\n    | \"\\\\*\" // Escaped e.g. \\* for markdown\r\n    | \"\\u{00D7}\" // Multiplication Symbol ×\r\n    | caseInsensitive<\"x\">\r\n    | caseInsensitive<\"times by\">\r\n    | caseInsensitive<\"times\">\r\n    | caseInsensitive<\"multiply by\">\r\n    | caseInsensitive<\"multiply\">\r\n      \r\n  divide\r\n    = \"/\"\r\n    | \"\\u{00F7}\" // Division Symbol ÷\r\n    | caseInsensitive<\"divide by\">\r\n    | caseInsensitive<\"divide\">\r\n\r\n  modulo\r\n    = \"%\"\r\n    | caseInsensitive<\"modulo\">\r\n    | caseInsensitive<\"mod\">\r\n\r\n  exponent\r\n    = \"^\"\r\n    | caseInsensitive<\"to the power of\">\r\n    | caseInsensitive<\"power of\">\r\n    | caseInsensitive<\"exponent\">\r\n    | caseInsensitive<\"prime\">\r\n\r\n  constant  \r\n  \t= caseInsensitive<\"PI\"> \r\n    | caseInsensitive<\"E\">\r\n\r\n  number\r\n    = digit* \".\" digit+  -- fract\r\n    | digit+             -- whole\r\n  \r\n  hex\r\n    = \"0x\" hexDigit+\r\n    | hexDigit+ \"h\"\r\n}"},"BasicArithmetic",null,"Expression",{"Expression":["define",{"sourceInterval":[21,51]},null,[],["app",{"sourceInterval":[39,51]},"LogicalShift",[]]],"LogicalShift_left":["define",{"sourceInterval":[77,115]},null,[],["seq",{"sourceInterval":[77,107]},["app",{"sourceInterval":[77,89]},"LogicalShift",[]],["terminal",{"sourceInterval":[90,94]},"<<"],["app",{"sourceInterval":[95,107]},"LogicalShift",[]]]],"LogicalShift_right":["define",{"sourceInterval":[123,162]},null,[],["seq",{"sourceInterval":[123,153]},["app",{"sourceInterval":[123,135]},"LogicalShift",[]],["terminal",{"sourceInterval":[136,140]},">>"],["app",{"sourceInterval":[141,153]},"LogicalShift",[]]]],"LogicalShift":["define",{"sourceInterval":[57,172]},null,[],["alt",{"sourceInterval":[77,172]},["app",{"sourceInterval":[77,107]},"LogicalShift_left",[]],["app",{"sourceInterval":[123,153]},"LogicalShift_right",[]],["app",{"sourceInterval":[170,172]},"AS",[]]]],"AS_addition":["define",{"sourceInterval":[219,241]},null,[],["seq",{"sourceInterval":[219,228]},["app",{"sourceInterval":[219,221]},"AS",[]],["app",{"sourceInterval":[222,225]},"add",[]],["app",{"sourceInterval":[226,228]},"MD",[]]]],"AS_subtraction":["define",{"sourceInterval":[249,279]},null,[],["seq",{"sourceInterval":[249,263]},["app",{"sourceInterval":[249,251]},"AS",[]],["app",{"sourceInterval":[252,260]},"subtract",[]],["app",{"sourceInterval":[261,263]},"MD",[]]]],"AS":["define",{"sourceInterval":[209,289]},null,[],["alt",{"sourceInterval":[219,289]},["app",{"sourceInterval":[219,228]},"AS_addition",[]],["app",{"sourceInterval":[249,263]},"AS_subtraction",[]],["app",{"sourceInterval":[287,289]},"MD",[]]]],"MD_multiplication":["define",{"sourceInterval":[330,362]},null,[],["seq",{"sourceInterval":[330,343]},["app",{"sourceInterval":[330,332]},"MD",[]],["app",{"sourceInterval":[333,341]},"multiply",[]],["app",{"sourceInterval":[342,343]},"E",[]]]],"MD_division":["define",{"sourceInterval":[370,394]},null,[],["seq",{"sourceInterval":[370,381]},["app",{"sourceInterval":[370,372]},"MD",[]],["app",{"sourceInterval":[373,379]},"divide",[]],["app",{"sourceInterval":[380,381]},"E",[]]]],"MD_modulo":["define",{"sourceInterval":[402,424]},null,[],["seq",{"sourceInterval":[402,413]},["app",{"sourceInterval":[402,404]},"MD",[]],["app",{"sourceInterval":[405,411]},"modulo",[]],["app",{"sourceInterval":[412,413]},"E",[]]]],"MD":["define",{"sourceInterval":[320,433]},null,[],["alt",{"sourceInterval":[330,433]},["app",{"sourceInterval":[330,343]},"MD_multiplication",[]],["app",{"sourceInterval":[370,381]},"MD_division",[]],["app",{"sourceInterval":[402,413]},"MD_modulo",[]],["app",{"sourceInterval":[432,433]},"E",[]]]],"E_exponent":["define",{"sourceInterval":[463,488]},null,[],["seq",{"sourceInterval":[463,475]},["app",{"sourceInterval":[463,464]},"P",[]],["app",{"sourceInterval":[465,473]},"exponent",[]],["app",{"sourceInterval":[474,475]},"E",[]]]],"E":["define",{"sourceInterval":[454,497]},null,[],["alt",{"sourceInterval":[463,497]},["app",{"sourceInterval":[463,475]},"E_exponent",[]],["app",{"sourceInterval":[496,497]},"P",[]]]],"P_parenthesis":["define",{"sourceInterval":[530,564]},null,[],["seq",{"sourceInterval":[530,548]},["terminal",{"sourceInterval":[530,533]},"("],["app",{"sourceInterval":[534,544]},"Expression",[]],["terminal",{"sourceInterval":[545,548]},")"]]],"P":["define",{"sourceInterval":[521,581]},null,[],["alt",{"sourceInterval":[530,581]},["app",{"sourceInterval":[530,548]},"P_parenthesis",[]],["app",{"sourceInterval":[572,581]},"Primitive",[]]]],"Primitive_positive":["define",{"sourceInterval":[608,633]},null,[],["seq",{"sourceInterval":[608,621]},["terminal",{"sourceInterval":[608,611]},"+"],["app",{"sourceInterval":[612,621]},"Primitive",[]]]],"Primitive_negative":["define",{"sourceInterval":[641,666]},null,[],["seq",{"sourceInterval":[641,654]},["terminal",{"sourceInterval":[641,644]},"-"],["app",{"sourceInterval":[645,654]},"Primitive",[]]]],"Primitive":["define",{"sourceInterval":[591,707]},null,[],["alt",{"sourceInterval":[608,707]},["app",{"sourceInterval":[608,621]},"Primitive_positive",[]],["app",{"sourceInterval":[641,654]},"Primitive_negative",[]],["app",{"sourceInterval":[674,682]},"constant",[]],["app",{"sourceInterval":[690,693]},"hex",[]],["app",{"sourceInterval":[701,707]},"number",[]]]],"add":["define",{"sourceInterval":[734,838]},null,[],["alt",{"sourceInterval":[745,838]},["terminal",{"sourceInterval":[745,748]},"+"],["app",{"sourceInterval":[756,779]},"caseInsensitive",[["terminal",{"sourceInterval":[772,778]},"plus"]]],["app",{"sourceInterval":[786,808]},"caseInsensitive",[["terminal",{"sourceInterval":[802,807]},"add"]]],["app",{"sourceInterval":[816,838]},"caseInsensitive",[["terminal",{"sourceInterval":[832,837]},"and"]]]]],"subtract":["define",{"sourceInterval":[848,999]},null,[],["alt",{"sourceInterval":[865,999]},["terminal",{"sourceInterval":[865,868]},"-"],["app",{"sourceInterval":[876,900]},"caseInsensitive",[["terminal",{"sourceInterval":[892,899]},"minus"]]],["app",{"sourceInterval":[908,935]},"caseInsensitive",[["terminal",{"sourceInterval":[924,934]},"subtract"]]],["app",{"sourceInterval":[943,968]},"caseInsensitive",[["terminal",{"sourceInterval":[959,967]},"remove"]]],["app",{"sourceInterval":[976,999]},"caseInsensitive",[["terminal",{"sourceInterval":[992,998]},"take"]]]]],"multiply":["define",{"sourceInterval":[1011,1289]},null,[],["alt",{"sourceInterval":[1028,1289]},["terminal",{"sourceInterval":[1028,1031]},"*"],["terminal",{"sourceInterval":[1039,1044]},"\\*"],["terminal",{"sourceInterval":[1084,1094]},"×"],["app",{"sourceInterval":[1129,1149]},"caseInsensitive",[["terminal",{"sourceInterval":[1145,1148]},"x"]]],["app",{"sourceInterval":[1157,1184]},"caseInsensitive",[["terminal",{"sourceInterval":[1173,1183]},"times by"]]],["app",{"sourceInterval":[1192,1216]},"caseInsensitive",[["terminal",{"sourceInterval":[1208,1215]},"times"]]],["app",{"sourceInterval":[1224,1254]},"caseInsensitive",[["terminal",{"sourceInterval":[1240,1253]},"multiply by"]]],["app",{"sourceInterval":[1262,1289]},"caseInsensitive",[["terminal",{"sourceInterval":[1278,1288]},"multiply"]]]]],"divide":["define",{"sourceInterval":[1301,1426]},null,[],["alt",{"sourceInterval":[1315,1426]},["terminal",{"sourceInterval":[1315,1318]},"/"],["terminal",{"sourceInterval":[1326,1336]},"÷"],["app",{"sourceInterval":[1365,1393]},"caseInsensitive",[["terminal",{"sourceInterval":[1381,1392]},"divide by"]]],["app",{"sourceInterval":[1401,1426]},"caseInsensitive",[["terminal",{"sourceInterval":[1417,1425]},"divide"]]]]],"modulo":["define",{"sourceInterval":[1432,1512]},null,[],["alt",{"sourceInterval":[1446,1512]},["terminal",{"sourceInterval":[1446,1449]},"%"],["app",{"sourceInterval":[1457,1482]},"caseInsensitive",[["terminal",{"sourceInterval":[1473,1481]},"modulo"]]],["app",{"sourceInterval":[1490,1512]},"caseInsensitive",[["terminal",{"sourceInterval":[1506,1511]},"mod"]]]]],"exponent":["define",{"sourceInterval":[1518,1681]},null,[],["alt",{"sourceInterval":[1534,1681]},["terminal",{"sourceInterval":[1534,1537]},"^"],["app",{"sourceInterval":[1545,1579]},"caseInsensitive",[["terminal",{"sourceInterval":[1561,1578]},"to the power of"]]],["app",{"sourceInterval":[1587,1614]},"caseInsensitive",[["terminal",{"sourceInterval":[1603,1613]},"power of"]]],["app",{"sourceInterval":[1622,1649]},"caseInsensitive",[["terminal",{"sourceInterval":[1638,1648]},"exponent"]]],["app",{"sourceInterval":[1657,1681]},"caseInsensitive",[["terminal",{"sourceInterval":[1673,1680]},"prime"]]]]],"constant":["define",{"sourceInterval":[1687,1754]},null,[],["alt",{"sourceInterval":[1704,1754]},["app",{"sourceInterval":[1704,1725]},"caseInsensitive",[["terminal",{"sourceInterval":[1720,1724]},"PI"]]],["app",{"sourceInterval":[1734,1754]},"caseInsensitive",[["terminal",{"sourceInterval":[1750,1753]},"E"]]]]],"number_fract":["define",{"sourceInterval":[1774,1801]},null,[],["seq",{"sourceInterval":[1774,1791]},["star",{"sourceInterval":[1774,1780]},["app",{"sourceInterval":[1774,1779]},"digit",[]]],["terminal",{"sourceInterval":[1781,1784]},"."],["plus",{"sourceInterval":[1785,1791]},["app",{"sourceInterval":[1785,1790]},"digit",[]]]]],"number_whole":["define",{"sourceInterval":[1809,1836]},null,[],["plus",{"sourceInterval":[1809,1815]},["app",{"sourceInterval":[1809,1814]},"digit",[]]]],"number":["define",{"sourceInterval":[1760,1836]},null,[],["alt",{"sourceInterval":[1774,1836]},["app",{"sourceInterval":[1774,1791]},"number_fract",[]],["app",{"sourceInterval":[1809,1815]},"number_whole",[]]]],"hex":["define",{"sourceInterval":[1844,1890]},null,[],["alt",{"sourceInterval":[1855,1890]},["seq",{"sourceInterval":[1855,1869]},["terminal",{"sourceInterval":[1855,1859]},"0x"],["plus",{"sourceInterval":[1860,1869]},["app",{"sourceInterval":[1860,1868]},"hexDigit",[]]]],["seq",{"sourceInterval":[1877,1890]},["plus",{"sourceInterval":[1877,1886]},["app",{"sourceInterval":[1877,1885]},"hexDigit",[]]],["terminal",{"sourceInterval":[1887,1890]},"h"]]]]}]);result.PercentageArithmetic=makeRecipe(["grammar",{"source":"PercentageArithmetic <: BasicArithmetic {\r\n\tExpression\r\n    \t:=  PercentageOf\r\n        | IncreaseBy\r\n        | DecreaseBy\r\n        | PercentageIncreaseOrDecrease\r\n\t\t| LogicalShift\r\n        \r\n    Primitive \r\n        += percentage\r\n        \r\n    PercentageOf\r\n    \t= percentage caseInsensitive<\"of\"> number \r\n        \r\n   \tIncreaseBy\r\n    \t= caseInsensitive<\"increase\"> number caseInsensitive<\"by\"> percentage\r\n        \r\n   \tDecreaseBy\r\n    \t= caseInsensitive<\"decrease\"> number caseInsensitive<\"by\"> percentage\r\n    \r\n    PercentageIncreaseOrDecrease\r\n        = caseInsensitive<\"from\">? number caseInsensitive<\"to\"> number\r\n\r\n    percentage = number \"%\"\r\n}"},"PercentageArithmetic",result.BasicArithmetic,"Expression",{"Expression":["override",{"sourceInterval":[44,179]},null,[],["alt",{"sourceInterval":[65,179]},["app",{"sourceInterval":[65,77]},"PercentageOf",[]],["app",{"sourceInterval":[89,99]},"IncreaseBy",[]],["app",{"sourceInterval":[111,121]},"DecreaseBy",[]],["app",{"sourceInterval":[133,161]},"PercentageIncreaseOrDecrease",[]],["app",{"sourceInterval":[167,179]},"LogicalShift",[]]]],"Primitive":["extend",{"sourceInterval":[195,228]},null,[],["app",{"sourceInterval":[218,228]},"percentage",[]]],"PercentageOf":["define",{"sourceInterval":[244,304]},null,[],["seq",{"sourceInterval":[265,304]},["app",{"sourceInterval":[265,275]},"percentage",[]],["app",{"sourceInterval":[276,297]},"caseInsensitive",[["terminal",{"sourceInterval":[292,296]},"of"]]],["app",{"sourceInterval":[298,304]},"number",[]]]],"IncreaseBy":["define",{"sourceInterval":[321,407]},null,[],["seq",{"sourceInterval":[340,407]},["app",{"sourceInterval":[340,367]},"caseInsensitive",[["terminal",{"sourceInterval":[356,366]},"increase"]]],["app",{"sourceInterval":[368,374]},"number",[]],["app",{"sourceInterval":[375,396]},"caseInsensitive",[["terminal",{"sourceInterval":[391,395]},"by"]]],["app",{"sourceInterval":[397,407]},"percentage",[]]]],"DecreaseBy":["define",{"sourceInterval":[423,509]},null,[],["seq",{"sourceInterval":[442,509]},["app",{"sourceInterval":[442,469]},"caseInsensitive",[["terminal",{"sourceInterval":[458,468]},"decrease"]]],["app",{"sourceInterval":[470,476]},"number",[]],["app",{"sourceInterval":[477,498]},"caseInsensitive",[["terminal",{"sourceInterval":[493,497]},"by"]]],["app",{"sourceInterval":[499,509]},"percentage",[]]]],"PercentageIncreaseOrDecrease":["define",{"sourceInterval":[521,621]},null,[],["seq",{"sourceInterval":[561,621]},["opt",{"sourceInterval":[561,585]},["app",{"sourceInterval":[561,584]},"caseInsensitive",[["terminal",{"sourceInterval":[577,583]},"from"]]]],["app",{"sourceInterval":[586,592]},"number",[]],["app",{"sourceInterval":[593,614]},"caseInsensitive",[["terminal",{"sourceInterval":[609,613]},"to"]]],["app",{"sourceInterval":[615,621]},"number",[]]]],"percentage":["define",{"sourceInterval":[629,652]},null,[],["seq",{"sourceInterval":[642,652]},["app",{"sourceInterval":[642,648]},"number",[]],["terminal",{"sourceInterval":[649,652]},"%"]]]}]);module.exports=result;