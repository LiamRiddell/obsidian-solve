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
    ]
  },
  {
    name: "Units of Measurement",
    description: "Unit conversion and arithmetic",
    examples: [
      { name: "Length conversion", expression: "100cm to m", description: "Convert centimeters to meters" },
      { name: "Mixed units", expression: "100cm + 1m", description: "Add different units" },
      { name: "Best unit", expression: "1000mm best", description: "Find best unit representation" },
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
    name: "Trip Budget & Timeline",
    description: "Comprehensive trip planning with dates and costs",
    content: ":budget = 5000\n:flightCost = 800\n:hotelNights = 7\n:hotelPerNight = 150\n:foodPerDay = 60\n:totalHotel = :hotelPerNight * :hotelNights\n:totalFood = :foodPerDay * :hotelNights\n:totalTransport = :flightCost * 2\n:spendingMoney = :budget - :totalHotel - :totalFood - :totalTransport\n:dailyAllowance = :spendingMoney / :hotelNights\n:bookingDate = now\n:tripStart = :bookingDate + 30 days\n:tripEnd = :tripStart + :hotelNights days"
  }
];
