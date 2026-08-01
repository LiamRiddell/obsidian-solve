export interface ExampleCategory {
  name: string;
  description: string;
  examples: Example[];
}

export interface Example {
  name: string;
  expression: string;
  description: string;
}

export interface FullDocumentExample {
  name: string;
  description: string;
  content: string;
}

/**
 * A set of documents that are opened together, each as its own tab.
 *
 * These exist to demonstrate `global :name` — the process-wide variable store
 * that is shared by every open document, as opposed to `:name`, which is local
 * to the document it is written in. A global written in one document
 * propagates to every other open document automatically: readers that were
 * already evaluated go dirty and recompute, and readers that ran BEFORE the
 * global was ever declared sit at Pending and resolve themselves once it is.
 * None of that is observable in a single document, so it needs its own kind of
 * example.
 */
export interface MultiDocumentExample {
  name: string;
  description: string;
  /** Opened in order. Put the documents that WRITE globals before the ones that read them. */
  documents: { title: string; content: string }[];
}

export const exampleData: ExampleCategory[] = [
  {
    name: "Arithmetic",
    description: "Basic arithmetic operations and operators",
    examples: [
      { name: "Addition", expression: "10 + 5", description: "Simple addition" },
      { name: "Subtraction", expression: "10 - 3", description: "Simple subtraction" },
      { name: "Multiplication", expression: "4 * 5", description: "Simple multiplication" },
      { name: "Division", expression: "10 / 2", description: "Simple division" },
      { name: "Exponent", expression: "2 ^ 3", description: "Exponentiation" },
      { name: "Modulo", expression: "10 mod 3", description: "Modulo operation" },
      { name: "Parentheses", expression: "(1 + 2) * 3", description: "Operator precedence" },
      { name: "Unary minus", expression: "-5", description: "Negative numbers" },
      { name: "Unary plus", expression: "+5", description: "Explicit positive" },
      { name: "Pi constant", expression: "pi", description: "Mathematical constant" },
      { name: "Addition keyword", expression: "1 plus 2", description: "Keyword-based addition" },
      { name: "Large number suffix", expression: "2.5k + 1000", description: "'k'/'M'/'G'/'B'/'T' magnitude suffixes (thousand/million/billion/trillion)" },
    ]
  },
  {
    name: "Percentage",
    description: "Percentage calculations and operations",
    examples: [
      { name: "Standalone percentage", expression: "50%", description: "Percentage as decimal" },
      { name: "Percentage addition", expression: "50% + 10%", description: "Adding percentages" },
      { name: "Percentage in expression", expression: "50 + 20%", description: "Percentage in arithmetic" },
      { name: "Percentage of", expression: "10% of 20", description: "Percentage of a number" },
      { name: "Percentage increase", expression: "increase 100 by 10%", description: "Increase by percentage" },
      { name: "Percentage decrease", expression: "decrease 100 by 10%", description: "Decrease by percentage" },
      { name: "Percentage change", expression: "800 to 1000", description: "Calculate percentage change" },
      { name: "Solve for the base (of)", expression: "5% of what is 20", description: "20 is 5% of what number? -> 400" },
      { name: "Solve for the base (on)", expression: "5% on what is 210", description: "What number, increased by 5%, gives 210? -> 200" },
      { name: "Solve for the base (off)", expression: "5% off what is 190", description: "What number, decreased by 5%, gives 190? -> 200" },
    ]
  },
  {
    name: "Date & Time",
    description: "Date and time operations",
    examples: [
      { name: "Current date", expression: "now", description: "Current timestamp" },
      { name: "Today", expression: "today", description: "Current date" },
      { name: "Tomorrow", expression: "tomorrow", description: "Tomorrow's date" },
      { name: "Yesterday", expression: "yesterday", description: "Yesterday's date" },
      { name: "Duration", expression: "now + 20 days", description: "Date arithmetic" },
      { name: "Workdays in a period", expression: "workdays in 3 weeks", description: "Count of Mon-Fri business days (no public-holiday exclusion)" },
      { name: "Add workdays", expression: "now + 5 workdays", description: "Business-day-skip date arithmetic" },
      { name: "Unix timestamp to date", expression: "1733823083000 to date", description: "Millisecond-magnitude Unix timestamp, auto-detected" },
      { name: "Date to timestamp", expression: "now to timestamp", description: "Convert a date to a Unix timestamp (seconds)" },
      { name: "Bare date literal (DD/MM/YYYY)", expression: "25/12/2023", description: "Slash-separated date, day first" },
      { name: "Bare date literal (ISO)", expression: "2023-12-25", description: "ISO 8601 YYYY-MM-DD" },
      { name: "Bare date literal (MM-DD-YYYY)", expression: "12-25-2023", description: "Dash-separated date, US month-first order" },
      { name: "Bare date literal (dotted)", expression: "25.12.2023", description: "Dot-separated date, day first" },
    ]
  },
  {
    name: "Day Questions",
    description: "Ask for a single field of a date in plain English — the weekday, month or ISO week number, now or at some offset",
    examples: [
      { name: "What day is it", expression: "what day is it", description: "Today's weekday name -> e.g. Tuesday" },
      { name: "What day in N days", expression: "what day is it in 30 days", description: "The weekday 30 days from now" },
      { name: "What day on a date", expression: "what day is it on 25/12/2026", description: "The weekday of a specific date -> Friday" },
      { name: "Weekday of an expression", expression: "next friday + 2 weeks as weekday", description: "'as weekday' composes after any date expression" },
      { name: "What month in N days", expression: "what month is it in 90 days", description: "The month name 90 days from now" },
      { name: "Month of a date", expression: "month of 25/12/2026", description: "Month name of a specific date -> December" },
      { name: "What week is it", expression: "what week is it", description: "The current ISO-8601 week number (1-53)" },
      { name: "Week of a date", expression: "week of 2026-01-01", description: "ISO week number — week 1 is the one containing the first Thursday -> 1" },
      { name: "Days between two dates", expression: "days between 2026-01-01 and 2026-01-31", description: "Unsigned span between two explicit dates -> 30 days" },
      { name: "How many days until", expression: "how many days until 25/12/2026", description: "'how many' is optional wording on until/since/between" },
      { name: "Is it a weekend", expression: "26/12/2026 is a weekend", description: "Weekend predicate -> true" },
      { name: "Is it a workday", expression: "25/12/2026 is a workday", description: "Mon-Fri predicate, no public-holiday exclusion -> true" },
    ]
  },
  {
    name: "Dice",
    description: "Dice rolling operations",
    examples: [
      { name: "Roll d6", expression: "roll(1, 6)", description: "Roll one 6-sided die" },
      { name: "Multiple dice", expression: "roll(1, 6) + roll(1, 6)", description: "Sum of two 6-sided dice (2d6) — roll() itself only takes a single range, so multiple dice are composed by adding independent rolls" },
      { name: "Roll d20", expression: "roll(1, 20)", description: "Roll one 20-sided die" },
    ]
  },
  {
    name: "Variables",
    description: "Variable usage and assignments",
    examples: [
      { name: "Simple variable", expression: ":myVar = 10", description: "Assign variable with colon prefix" },
      { name: "Variable in expression", expression: ":myVar = 10\n:myVar + 5", description: "Use variable in calculation" },
      { name: "Trailing '=' marker", expression: "355/113=", description: "A trailing bare '=' with nothing after it is ignored, like a pocket calculator" },
      { name: "Labeled line", expression: "pi approximation: 355/113", description: "Free-text before a colon is treated as a label, not part of the expression" },
    ]
  },
  {
    name: "Units of Measurement",
    description: "Unit conversion and arithmetic",
    examples: [
      { name: "Length conversion", expression: "100cm to m", description: "Convert centimeters to meters" },
      { name: "Mixed units", expression: "100cm + 1m", description: "Add different units" },
      { name: "Best unit", expression: "1000mm best", description: "Find best unit representation" },
      { name: "Cooking: mass to volume", expression: "300g butter in cups", description: "Ingredient-density-aware conversion (US Customary)" },
      { name: "Cooking: volume to mass", expression: "10 cups olive oil in grams", description: "Reverse direction — volume to mass" },
      { name: "Binary data units", expression: "1 GiB to MiB", description: "IEC binary-prefix units (1024-based) -> 1024" },
      { name: "Binary vs decimal prefix", expression: "1 GiB to GB", description: "GiB (1024-based) vs GB (1000-based) are NOT the same -> ~1.074" },
    ]
  },
  {
    name: "Currency",
    description: "Currency conversion and arithmetic",
    examples: [
      { name: "USD to EUR", expression: "100 USD to EUR", description: "Convert US dollars to Euros" },
      { name: "USD to GBP", expression: "250 USD to GBP", description: "Convert US dollars to British pounds" },
      { name: "EUR to JPY", expression: "500 EUR to JPY", description: "Convert Euros to Japanese yen" },
      { name: "GBP to USD", expression: "75 GBP to USD", description: "Convert British pounds to US dollars" },
      { name: "Multi-currency add", expression: "100 USD + 200 EUR", description: "Add two different currencies (converts to first)" },
      { name: "EUR to GBP", expression: "1000 EUR to GBP", description: "Convert Euros to British pounds" },
      { name: "USD to JPY", expression: "50 USD to JPY", description: "Convert US dollars to Japanese yen" },
      { name: "GBP to EUR", expression: "200 GBP to EUR", description: "Convert British pounds to Euros" },
      { name: "Small conversion", expression: "5 USD to EUR", description: "Small amount conversion" },
      { name: "Large conversion", expression: "10000 USD to JPY", description: "Large amount currency conversion" },
      { name: "USD to EUR + tax", expression: "100 USD to EUR + 20%", description: "Convert then add 20% tax" },
      { name: "EUR to GBP - discount", expression: "500 EUR to GBP - 15%", description: "Convert then apply 15% discount" },
      { name: "Tax on multi-currency", expression: "(100 USD + 200 EUR) + 8%", description: "Add currencies then apply tax" },
      { name: "Yen symbol", expression: "¥1000 to USD", description: "'¥' is recognized as a bare currency symbol (defaults to JPY)" },
      { name: "Ruble symbol", expression: "₽1000 to USD", description: "'₽' recognized as RUB" },
      { name: "Won symbol", expression: "₩1000 to USD", description: "'₩' recognized as KRW" },
      { name: "Currency word alias", expression: "10 yen to USD", description: "Currency names spelled out as words also work, not just symbols/codes" },
      { name: "Currency word alias (franc)", expression: "5 francs to USD", description: "'franc(s)' resolves to CHF" },
    ]
  },
  {
    name: "CryptoCurrency",
    description: "Cryptocurrency conversion and arithmetic (BTC, ETH, SOL, etc.)",
    examples: [
      { name: "BTC to USD", expression: "1 BTC to USD", description: "Convert Bitcoin to US dollars" },
      { name: "ETH to USD", expression: "5 ETH to USD", description: "Convert Ethereum to US dollars" },
      { name: "ETH to BTC", expression: "10 ETH to BTC", description: "Convert Ethereum to Bitcoin" },
      { name: "BTC to ETH", expression: "0.5 BTC to ETH", description: "Convert Bitcoin to Ethereum" },
      { name: "SOL to USD", expression: "100 SOL to USD", description: "Convert Solana to US dollars" },
      { name: "BTC to EUR", expression: "0.1 BTC to EUR", description: "Convert Bitcoin to Euros" },
      { name: "DOGE to USD", expression: "10000 DOGE to USD", description: "Convert Dogecoin to US dollars" },
      { name: "Multi-crypto add", expression: "0.01 BTC + 1 ETH", description: "Add Bitcoin and Ethereum (converts to first)" },
      { name: "Crypto + tax", expression: "1 BTC to USD + 10%", description: "Convert then add 10% capital gains tax" },
      { name: "Crypto profit", expression: "(2 ETH to USD) - (1 ETH to USD)", description: "Profit from buying low and selling high" },
      { name: "Small crypto", expression: "0.0001 BTC to USD", description: "Small fraction conversion" },
      { name: "BTC + ETH to USD", expression: "(0.01 BTC + 1 ETH) to USD", description: "Add crypto then convert to USD" },
    ]
  },
  {
    name: "Functions",
    description: "Built-in function calls",
    examples: [
      { name: "Square root", expression: "sqrt(16)", description: "Calculate square root" },
      { name: "Absolute value", expression: "abs(-10)", description: "Absolute value" },
      { name: "Round number", expression: "round(3.7)", description: "Round to nearest integer" },
      { name: "Arcsine", expression: "arcsin(1)", description: "Inverse sine, in radians -> pi/2" },
      { name: "Arccosine", expression: "arccos(1)", description: "Inverse cosine, in radians -> 0" },
      { name: "Arctangent", expression: "arctan(1)", description: "Inverse tangent, in radians -> pi/4" },
      { name: "N-th root", expression: "root(3, 27)", description: "General n-th root -> 3 (the cube root of 27)" },
      { name: "Factorial", expression: "fact(5)", description: "5! -> 120 ('factorial(5)' also works)" },
    ]
  },
  {
    name: "Vectors",
    description: "Vector operations using vec2/vec3/vec4 constructors",
    examples: [
      { name: "vec2", expression: "vec2(1, 2)", description: "Create a 2D vector" },
      { name: "vec3", expression: "vec3(1, 2, 3)", description: "Create a 3D vector" },
      { name: "vec4", expression: "vec4(1, 2, 3, 4)", description: "Create a 4D vector" },
      { name: "vec2 addition", expression: "vec2(1, 2) + vec2(3, 4)", description: "Add two vectors" },
      { name: "vec2 subtraction", expression: "vec2(5, 6) - vec2(2, 3)", description: "Subtract vectors" },
    ]
  },
  {
    name: "BigInt",
    description: "Large integer operations",
    examples: [
      { name: "Large number", expression: "12345678901234567890n", description: "Big integer literal (the 'n' suffix is required for arbitrary precision — without it, this parses as an imprecise plain Number, same as JavaScript's own BigInt literal syntax)" },
      { name: "BigInt addition", expression: "12345678901234567890n + 1n", description: "BigInt addition — full precision preserved beyond Number.MAX_SAFE_INTEGER" },
    ]
  },
  {
    name: "Time",
    description: "Clock time, intervals, lap times, and frame rates",
    examples: [
      { name: "Clock time", expression: "9:00am", description: "A clock-time literal, anchored to today's date" },
      { name: "Time interval", expression: "7:30 to 20:45", description: "Duration between two clock times" },
      { name: "Frame rate", expression: "30 fps", description: "A Rate value — 30 frames per second" },
      { name: "Rate multiplication", expression: "30 fps * 3 minutes", description: "Multiplying a rate by a matching duration cancels the denominator" },
      { name: "Lap time", expression: "03:04:05", description: "A two-colon lap time, parsed as a duration" },
      { name: "Clock time subtraction", expression: "9:30 - 8:30", description: "Two clock times subtract to a duration -> 1:00" },
    ]
  },
  {
    name: "Video Timecode",
    description: "HH:MM:SS:FF video-editing timecode, fps-aware arithmetic",
    examples: [
      { name: "Timecode literal", expression: "01:02:03:04 at 30 fps", description: "A video timecode tagged with its frame rate" },
      { name: "Timecode + frames", expression: "01:02:03:04 at 30 fps + 10 frames", description: "Carry-aware frame arithmetic" },
      { name: "Timecode to frame count", expression: "01:02:03:04 at 30 fps in frames", description: "Total frame count since 00:00:00:00" },
      { name: "Frames to timecode", expression: "900 frames @ 30 fps", description: "Reverse conversion — frame count back to HH:MM:SS:FF" },
    ]
  },
  {
    name: "Conditionals",
    description: "Comparisons, boolean logic, and if/then/else",
    examples: [
      { name: "Comparison", expression: "5 > 3", description: "Comparison operators produce a boolean result" },
      { name: "Word 'and'", expression: "true and false", description: "'and'/'or' as boolean-logic words" },
      { name: "Logical &&", expression: "1 < 2 && 3 < 4", description: "'&&'/'||' correctly combine two comparisons (unlike bare 'and', see docs)" },
      { name: "If/then/else", expression: "if 5 > 3 then 100 else 200", description: "An eager ternary conditional" },
    ]
  },
  {
    name: "Converters",
    description: "The general 'as <type>' conversion mechanism",
    examples: [
      { name: "As percent", expression: "0.5 as percent", description: "Convert a decimal to a percentage" },
      { name: "As hex", expression: "255 as hex", description: "Base-16 display" },
      { name: "As fraction", expression: "0.5 as fraction", description: "Simplified fraction display" },
      { name: "As scientific", expression: "1500000 as sci", description: "Scientific notation" },
      { name: "As binary", expression: "10 as binary", description: "Base-2 display" },
    ]
  },
  {
    name: "Statistics",
    description: "Math-phrase functions: aggregates, clamping, proportions",
    examples: [
      { name: "GCD", expression: "gcd(12, 18)", description: "Greatest common divisor" },
      { name: "Average of", expression: "average of 2, 4, 6", description: "Arithmetic mean of any number of values" },
      { name: "Clamp", expression: "clamp 15 between 0 and 10", description: "Restrict a value to a range" },
      { name: "Midpoint", expression: "midpoint between 10 and 20", description: "The value halfway between two numbers" },
      { name: "Proportion", expression: "5 km is to 500m as 5 cm is to what", description: "Unit-aware proportion — solves the missing fourth value" },
    ]
  },
  {
    name: "Bases & Bitwise",
    description: "Python/JS-style base-conversion and truncation functions",
    examples: [
      { name: "hex()", expression: "hex(255)", description: "Call-syntax hex formatting" },
      { name: "bin()", expression: "bin(10)", description: "Call-syntax binary formatting" },
      { name: "int()", expression: "int(5.7)", description: "Truncate to a plain integer" },
      { name: "Large number suffix", expression: "2.5k", description: "'k'/'M'/'G'/'B'/'T' magnitude suffixes" },
      { name: "Octal literal", expression: "0o17", description: "Octal (base-8) literal input -> 15" },
    ]
  },
  {
    name: "Time Zones",
    description: "Convert times between cities, and query the current time/date or difference between zones.",
    examples: [
      { name: "Convert a time", expression: "6pm Sydney in Chicago", description: "What time is 6pm Sydney time, in Chicago?" },
      { name: "Zone offset", expression: "3pm GMT+8 in Paris", description: "Convert from a numeric UTC offset" },
      { name: "Convert via abbreviation", expression: "2am PST in GMT", description: "Convert using a standard-time abbreviation" },
      { name: "Current time in a city", expression: "time in Paris", description: "The current time right now, in Paris" },
      { name: "Current date in a city", expression: "date in Vancouver", description: "The current date right now, in Vancouver" },
      { name: "Time difference between cities", expression: "time difference between Seattle and Moscow", description: "How far apart two zones' clocks are right now" },
    ]
  },
  {
    name: "Finance",
    description: "Compound interest, mortgage/loan repayment, and sales tax",
    examples: [
      { name: "Compound interest", expression: "compound interest on 1000 over 3 years at 7%", description: "Future value of an investment" },
      { name: "Interest earned", expression: "interest on 1000 over 3 years at 7%", description: "Interest-only portion of compound growth" },
      { name: "Monthly repayment", expression: "monthly repayment on 10000 over 6 years at 6%", description: "Standard mortgage/loan amortization" },
      { name: "Sales tax", expression: "tax on 300 at 20%", description: "Add sales tax/VAT at an explicit rate" },
      { name: "Remove tax", expression: "tax off 360 at 20%", description: "Extract the pre-tax amount from a tax-inclusive total" },
      { name: "Inflation-adjusted value", expression: "what is $500 from 1970", description: "Present-day value using a bundled US CPI-U table (1970-2026, approximate)" },
      { name: "Historical value", expression: "what was $500 worth in 1997", description: "What today's $500 was worth in a past year" },
      { name: "Inflation function call", expression: "inflationAdjust(500, 1970, 2020)", description: "Adjust between two arbitrary years directly" },
    ]
  },
  {
    name: "User-Defined Functions",
    description: "Define a named, parameterized, reusable expression, then call it with different arguments",
    examples: [
      { name: "Define a function", expression: "f(x) = 2*x + 1", description: "Defines f — evaluates to a confirmation, not a number" },
      { name: "Call it", expression: "f(x) = 2*x + 1\nf(5)", description: "Define, then call with x = 5 -> 11" },
      { name: "Multi-parameter", expression: "area(w, h) = w * h\narea(3, 4)", description: "Two parameters -> 12" },
      { name: "Composed calls", expression: "double(x) = 2 * x\ndouble(double(5))", description: "Nesting a function call inside itself -> 20" },
      { name: "Using a built-in inside the body", expression: "hyp(a, b) = sqrt(a*a + b*b)\nhyp(3, 4)", description: "A function body can call built-ins/constants -> 5" },
    ]
  },
  {
    name: "Cross-Line Data Access",
    description: "Reference another line's already-computed result — prev, line<N>, and range aggregation",
    examples: [
      { name: "Previous line", expression: "10 + 5\nprev + 1", description: "prev reads the immediately-preceding line's result -> 16" },
      { name: "Reference by number", expression: "42\nline1 + 8", description: "line<N> (or spaced 'line N') reads any earlier line by its 1-based number -> 50" },
      { name: "Sum a range", expression: "1\n2\n3\n4\nsum(line 1 : line 4)", description: "sum/total/average(line X : line Y) aggregate a range of lines -> 10" },
      { name: "Total above", expression: "1\n2\n3\ntotal above", description: "Aggregates every line above back to the top of the document (or the nearest blank line/heading) -> 6" },
    ]
  },
  {
    name: "Live Data",
    description: "Weather (real Open-Meteo data, built in), plus Stocks/Knowledge — both opt-in, shown here with the default \"not configured\" message since they need a host-supplied API key/fetch function (see packages/core/src/packages/{stocks,knowledge}/ JSDoc). Weather makes a real network call, so its result may vary or fail without connectivity.",
    examples: [
      { name: "Weather in a city", expression: "weather in Tokyo", description: "Live conditions + temperature via Open-Meteo (free, keyless)" },
      { name: "Temperature in a city", expression: "temperature in Berlin", description: "Current temperature only, via Open-Meteo" },
      { name: "Feels-like temperature", expression: "feels like in Cairo", description: "Apparent temperature accounting for wind/humidity" },
      { name: "Today's high", expression: "high in Miami", description: "Today's forecast high temperature" },
      { name: "Today's low", expression: "low in Reykjavik", description: "Today's forecast low temperature" },
      { name: "Stock quote (unconfigured)", expression: "stock(AAPL)", description: "Shows the honest \"provider not configured\" error by default — a host wires up createStocksPackage({ fetchQuote })" },
    ]
  },
  {
    name: "Knowledge Queries",
    description: "'search: <question>' (or 'ask:'/'google:') — ask an open-ended question and get it answered by a host-supplied provider. Unconfigured by default, shown here with the honest \"not configured\" message rather than a fake/hallucinated answer — a host wires one up via createKnowledgePackage({ answerQuery }), e.g. backing it with a real search API.",
    examples: [
      { name: "Open-ended question (unconfigured)", expression: "search: distance to the moon", description: "Any free-form text after 'search:' is sent to the configured answerQuery provider verbatim" },
      { name: "'ask:' synonym", expression: "ask: what is the tallest mountain", description: "'ask:'/'google:' are equivalent synonyms for 'search:'" },
      { name: "Phrased like a conversion", expression: "search: 10 km in miles", description: "The whole '10 km in miles' is sent to the provider VERBATIM as a question — this is not the engine's own unit-conversion syntax (that's '10 km to miles'), it just happens to read similarly" },
      { name: "Calca-style '= ?' (also supported)", expression: "distance to the moon = ?", description: "The original Calca syntax still works too, for compatibility — 'search:'/'ask:'/'google:' are just the clearer, more discoverable form" },
    ]
  },
];

export const fullDocumentExamples: FullDocumentExample[] = [
  {
    name: "Variables & Arithmetic",
    description: "Multi-line variable assignments with arithmetic",
    content: ":width = 100\n:height = 200\n:area = :width * :height\n:perimeter = 2 * (:width + :height)"
  },
  {
    name: "Unit Conversions",
    description: "Various unit conversions and mixed unit arithmetic",
    content: "100cm to m\n1km to m\n100cm + 1m\n1000mm best"
  },
  {
    name: "Percentage Calculations",
    description: "Percentage operations including increase/decrease",
    content: "50% of 200\nincrease 100 by 10%\ndecrease 100 by 10%\n800 to 1000"
  },
  {
    name: "Shopping List Cost",
    description: "Calculate total cost of items with tax and discount",
    content: ":apples = 2.49\n:bread = 3.99\n:milk = 4.29\n:subtotal = :apples + :bread + :milk\n:discount = 10% of :subtotal\n:afterDiscount = :subtotal - :discount\n:taxRate = 8%\n:tax = :taxRate of :afterDiscount\n:total = :afterDiscount + :tax"
  },
  {
    name: "Project Timeline",
    description: "Date-based project deadline calculations",
    content: ":startDate = now\n:researchDays = 14 days\n:developmentWeeks = 6 weeks\n:testingDays = 5 days\n:researchEnd = :startDate + :researchDays\n:devEnd = :researchEnd + :developmentWeeks\n:projectEnd = :devEnd + :testingDays"
  },
  {
    name: "Workout Tracker",
    description: "Calculate workout metrics with volume and percentages",
    content: ":squatWeight = 135lb to kg\n:benchWeight = 185lb to kg\n:deadliftWeight = 225lb to kg\n:totalVolume = :squatWeight + :benchWeight + :deadliftWeight\n:warmupSet = 50% of :squatWeight\n:workingSet = :squatWeight * 3\n:weeklyVolume = :totalVolume * 3"
  },
  {
    name: "Recipe Scaling",
    description: "Scale recipe ingredients by servings",
    content: ":originalServings = 4\n:desiredServings = 6\n:scale = :desiredServings / :originalServings\n:baseFlour = 200g\n:baseSugar = 150g\n:baseButter = 100g\n:flourNeeded = :baseFlour * :scale\n:sugarNeeded = :baseSugar * :scale\n:butterNeeded = :baseButter * :scale\n:flourNeeded to kg\n:sugarNeeded to kg"
  },
  {
    name: "Investment Calculator",
    description: "Calculate investment returns with percentages",
    content: ":principal = 10000\n:annualRate = 7%\n:years = 5\n:yearlyReturn = :annualRate of :principal\n:totalReturn = :yearlyReturn * :years\n:finalValue = :principal + :totalReturn\n:monthlyContribution = 500\n:totalContributions = :monthlyContribution * 12 * :years\n:contributionGrowth = 5% of :totalContributions\n:grandTotal = :finalValue + :totalContributions + :contributionGrowth"
  },
  {
    name: "Fitness Body Measurements",
    description: "Track body measurements with unit conversions",
    content: ":heightCm = 175cm\n:weightKg = 78kg\n:heightM = :heightCm to m\n:bmi = :weightKg / (:heightM ^ 2)\n:chestCm = 102cm\n:waistCm = 86cm\n:chestIn = :chestCm to in\n:waistIn = :waistCm to in\n:waistToHip = :waistCm / :chestCm\n:weightLbs = :weightKg to lb"
  },
  {
    name: "Currency Travel Budget",
    description: "Plan a trip budget with live currency conversions",
    content: ":flightCostUSD = 1200 USD\n:hotelPerNightEUR = 150 EUR\n:nights = 5\n:hotelTotalEUR = :hotelPerNightEUR * :nights\n:hotelTotalUSD = :hotelTotalEUR to USD\n:foodPerDayEUR = 60 EUR\n:foodTotalEUR = :foodPerDayEUR * :nights\n:foodTotalUSD = :foodTotalEUR to USD\n:totalEUR = :hotelTotalEUR + :foodTotalEUR\n:totalTripUSD = :flightCostUSD + :hotelTotalUSD + :foodTotalUSD\n:spendingMoneyEUR = 200 EUR\n:spendingMoneyUSD = :spendingMoneyEUR to USD\n:grandTotalUSD = :totalTripUSD + :spendingMoneyUSD"
  },
  {
    name: "Currency Import Cost",
    description: "Calculate import cost with conversion, tax, and duty",
    content: ":itemPriceEUR = 450 EUR\n:shippingEUR = 35 EUR\n:subtotalEUR = :itemPriceEUR + :shippingEUR\n:subtotalUSD = :subtotalEUR to USD\n:importDuty = 5% of :subtotalUSD\n:afterDuty = :subtotalUSD + :importDuty\n:salesTax = 10% of :afterDuty\n:totalCostUSD = :afterDuty + :salesTax"
  },
  {
    name: "Crypto Portfolio Tracker",
    description: "Track a diversified crypto portfolio with profit/loss",
    content: ":btcAmount = 0.05\n:ethAmount = 2\n:solAmount = 50\n:btcValueUSD = :btcAmount BTC to USD\n:ethValueUSD = :ethAmount ETH to USD\n:solValueUSD = :solAmount SOL to USD\n:totalValueUSD = :btcValueUSD + :ethValueUSD + :solValueUSD\n:btcAllocation = :btcValueUSD / :totalValueUSD\n:ethAllocation = :ethValueUSD / :totalValueUSD\n:solAllocation = :solValueUSD / :totalValueUSD\n:tradeProfitBTC = 0.01 BTC to USD\n:tradeProfitETH = 0.5 ETH to USD\n:totalProfit = :tradeProfitBTC + :tradeProfitETH\n:profitAfterTax = :totalProfit - 15%"
  },
  {
    name: "Daily Timesheet",
    description: "Subtract clock-in/out pairs to get each session's duration, then total the day",
    content: "9:30 - 8:30\n12:00 - 11:00\n18:00 - 12:55\ntotal above"
  },
  {
    name: "Reusable Formula + Running Total",
    description: "Define a function once, call it for several inputs, then total the results with cross-line access",
    content: "circle(r) = pi * r * r\n\ncircle(2)\ncircle(5)\ncircle(10)\ntotal above"
  },
  {
    name: "Trip Budget & Timeline",
    description: "Comprehensive trip planning with dates and costs",
    content: ":budget = 5000\n:flightCost = 800\n:hotelNights = 7\n:hotelPerNight = 150\n:foodPerDay = 60\n:totalHotel = :hotelPerNight * :hotelNights\n:totalFood = :foodPerDay * :hotelNights\n:totalTransport = :flightCost * 2\n:spendingMoney = :budget - :totalHotel - :totalFood - :totalTransport\n:dailyAllowance = :spendingMoney / :hotelNights\n:bookingDate = now\n:tripStart = :bookingDate + 30 days\n:tripEnd = :tripStart + :hotelNights days"
  }
];

/**
 * Sets of documents opened together, each demonstrating one property of
 * `global :name`. Ordered easiest-first: declare/read, then fan-in, then
 * chaining, then the local-vs-global distinction.
 *
 * Every set is written so the READER documents are meaningless on their own —
 * that is the point. Editing a global in one tab visibly re-computes the
 * others, which is the behaviour these exist to show off.
 */
export const multiDocumentExamples: MultiDocumentExample[] = [
  {
    name: "Shared Rates",
    description: "One document owns the rates; another consumes them. Edit a rate and the invoice re-computes.",
    documents: [
      {
        title: "Rates",
        content: "global :vatRate = 20%\nglobal :usdToGbp = 0.79"
      },
      {
        title: "Invoice",
        content: ":net = 1200\n:vat = global :vatRate of :net\n:gross = :net + :vat\n:gross * global :usdToGbp"
      }
    ]
  },
  {
    name: "Budget Roll-up",
    description: "Two department documents each publish a global total; a third sums them. Note both departments use their own local :headcount without colliding.",
    documents: [
      {
        title: "Engineering",
        content: ":headcount = 12\n:avgSalary = 85000\nglobal :engineeringCost = :headcount * :avgSalary"
      },
      {
        title: "Marketing",
        content: ":headcount = 5\n:avgSalary = 62000\nglobal :marketingCost = :headcount * :avgSalary"
      },
      {
        title: "Company Total",
        content: "global :engineeringCost + global :marketingCost"
      }
    ]
  },
  {
    name: "Capacity Chain",
    description: "A global derived from another global, across three documents — change the server count and the change propagates all the way to the forecast.",
    documents: [
      {
        title: "Config",
        content: "global :serverCount = 4"
      },
      {
        title: "Capacity",
        content: "global :maxUsers = global :serverCount * 2500"
      },
      {
        title: "Forecast",
        content: ":expectedUsers = 8000\n:expectedUsers / global :maxUsers"
      }
    ]
  },
  {
    name: "Local vs Global",
    description: "The same identifier used both ways: :budget is private to its document, global :budget is shared by all of them.",
    documents: [
      {
        title: "Shared Budget",
        content: "global :budget = 100"
      },
      {
        title: "My Scratchpad",
        content: ":budget = 25\n:budget + 5\nglobal :budget\nglobal :budget - :budget"
      }
    ]
  }
];
