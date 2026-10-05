/**
 * The Provider Management toggles: which solve-engine package each one turns
 * off, and what the reader loses with it (#94).
 *
 * A toggle is named for one package, but a package can carry more than its
 * name says, and some forms its name suggests belong to the engine's core and
 * stay whatever the toggle says. Units carry currency codes, cooking, fuel
 * economy and durations, so adding days to a date goes with them; the
 * arithmetic operators are the core's, and only the constants, mixed numbers
 * and suffixes are the package's. Each description says so.
 *
 * `removes` and `keeps` are the examples the description names, and
 * `ProviderToggles.spec.ts` evaluates every one with and without the package,
 * so a description cannot drift from what the engine does.
 */

/** The settings key of a provider toggle. */
export type ProviderSettingKey =
	| "arithmeticProvider"
	| "functionArithmeticProvider"
	| "vectorArithmeticProvider"
	| "percentageArithmeticProvider"
	| "datetimeProvider"
	| "unitOfMeasurementProvider"
	| "diceProvider";

/** One Provider Management toggle. */
export interface ProviderToggle {
	/** Where its on or off is saved. */
	readonly setting: ProviderSettingKey;
	/** The label in the settings tab. */
	readonly name: string;
	/** What it turns off, and what stays, in the reader's terms. */
	readonly description: string;
	/** Lines that answer with the package and are refused without it. */
	readonly removes: readonly string[];
	/** Lines the description says keep working without it. */
	readonly keeps: readonly string[];
}

/** Every Provider Management toggle, in the order the settings tab shows them. */
export const PROVIDER_TOGGLES: readonly ProviderToggle[] = [
	{
		setting: "arithmeticProvider",
		name: "Arithmetic",
		description: "Constants, mixed numbers and number suffixes: pi, 1 1/2, 5k + 1, 2 million. The operators themselves are part of the engine, so 10 + 2 and 2 ^ 10 keep working when this is off.",
		removes: ["pi", "1 1/2", "5k + 1", "2 million"],
		keeps: ["10 + 2", "2 ^ 10"],
	},
	{
		setting: "functionArithmeticProvider",
		name: "Function Arithmetic",
		description: "Functions such as sqrt(16), max(1, 5) and sin(0).",
		removes: ["sqrt(16)", "max(1, 5)", "sin(0)"],
		keeps: [],
	},
	{
		setting: "vectorArithmeticProvider",
		name: "Vector Arithmetic",
		description: "Vectors: vec2(1, 2), vec3(1.0, 23, 18.3) and float(5). A list such as (10, 22.3) is part of the engine and keeps working.",
		removes: ["vec2(1, 2)", "vec3(1.0, 23, 18.3)", "float(5)"],
		keeps: ["(10, 22.3)"],
	},
	{
		setting: "percentageArithmeticProvider",
		name: "Percentage",
		description: "Percentage phrases: 20% off 50, 10% on 200, increase 50 by 10%. 10% of 200 and 200 + 10% are part of the engine and keep working.",
		removes: ["20% off 50", "10% on 200", "increase 50 by 10%"],
		keeps: ["10% of 200", "200 + 10%"],
	},
	{
		setting: "datetimeProvider",
		name: "Datetime",
		description: "Dates and times: today, next friday, 5 working days after 2026-01-01, 2026-01-05 as weekday. With this off a written date is not read as one, so 2026-01-01 + 3 days becomes arithmetic.",
		removes: ["today", "next friday", "5 working days after 2026-01-01", "2026-01-05 as weekday"],
		keeps: [],
	},
	{
		setting: "unitOfMeasurementProvider",
		name: "Unit of Measurement",
		description: "Units and everything measured in them: 200cm to m, 90 minutes in hours, currency codes (10 USD + 5 USD), cooking (1 1/2 cups in ml) and fuel economy (30 mpg in l/100km). Durations go with it, so 2026-01-01 + 3 days stops working too. Currency symbols such as $5 + $3 keep working.",
		removes: ["200cm to m", "90 minutes in hours", "10 USD + 5 USD", "1 1/2 cups in ml", "30 mpg in l/100km", "2026-01-01 + 3 days"],
		keeps: ["$5 + $3"],
	},
	{
		setting: "diceProvider",
		name: "Dice",
		description: "Random numbers: roll(1, 100) and roll between 1 and 12.",
		removes: ["roll(1, 100)", "roll between 1 and 12"],
		keeps: [],
	},
];
