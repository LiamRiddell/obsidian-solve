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
      { name: "Multiple dice", expression: "roll(2, 6)", description: "Roll two 6-sided dice" },
      { name: "Roll d20", expression: "roll(1, 20)", description: "Roll one 20-sided die" },
    ]
  },
  {
    name: "Variables",
    description: "Variable usage and assignments",
    examples: [
      { name: "Simple variable", expression: ":myVar = 10", description: "Assign variable with colon prefix" },
      { name: "Variable in expression", expression: ":myVar + 5", description: "Use variable in calculation" },
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
      { name: "Large number", expression: "12345678901234567890", description: "Big integer literal" },
      { name: "BigInt addition", expression: "12345678901234567890 + 1", description: "BigInt addition" },
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
    content: ":squatWeight = 135lbs to kg\n:benchWeight = 185lbs to kg\n:deadliftWeight = 225lbs to kg\n:totalVolume = :squatWeight + :benchWeight + :deadliftWeight\n:warmupSet = 50% of :squatWeight\n:workingSet = :squatWeight * 3\n:weeklyVolume = :totalVolume * 3"
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
    content: ":heightCm = 175\n:weightKg = 78\n:heightM = :heightCm to m\n:bmi = :weightKg / (:heightM ^ 2)\n:chestCm = 102\n:waistCm = 86\n:chestIn = :chestCm to in\n:waistIn = :waistCm to in\n:waistToHip = :waistCm / :chestCm\n:weightLbs = :weightKg to lb"
  },
  {
    name: "Trip Budget & Timeline",
    description: "Comprehensive trip planning with dates and costs",
    content: ":budget = 5000\n:flightCost = 800\n:hotelNights = 7\n:hotelPerNight = 150\n:foodPerDay = 60\n:totalHotel = :hotelPerNight * :hotelNights\n:totalFood = :foodPerDay * :hotelNights\n:totalTransport = :flightCost * 2\n:spendingMoney = :budget - :totalHotel - :totalFood - :totalTransport\n:dailyAllowance = :spendingMoney / :hotelNights\n:bookingDate = now\n:tripStart = :bookingDate + 30 days\n:tripEnd = :tripStart + :hotelNights days"
  }
];