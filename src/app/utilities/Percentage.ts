/**
 * Calculate a percentage of a population.
 *
 * @param decimalPercentage - The percentage expressed as a decimal (e.g., 0.1 for 10%).
 * @param population - The base value.
 * @returns The fractional amount (population × decimalPercentage).
 */
export function percentageOf(decimalPercentage: number, population: number) {
	return population * decimalPercentage;
}

/**
 * Calculate the percentage increase between an original and new value.
 *
 * @param originalValue - The starting value.
 * @param newValue - The new (higher) value.
 * @returns The relative increase as a decimal (e.g., 0.25 = 25% increase).
 */
export function percentageIncrease(
	originalValue: number,
	newValue: number
): number {
	const increaseAmount = newValue - originalValue;
	return increaseAmount / originalValue;
}

/**
 * Calculate the percentage decrease between an original and new value.
 *
 * @param originalValue - The starting value.
 * @param newValue - The new (lower) value.
 * @returns The relative decrease as a decimal (e.g., 0.15 = 15% decrease).
 */
export function percentageDecrease(
	originalValue: number,
	newValue: number
): number {
	const decreaseAmount = originalValue - newValue;
	return decreaseAmount / originalValue;
}

/**
 * Increase a base value by a given percentage.
 *
 * @param baseValue - The starting value.
 * @param percentage - The percentage to increase by, as a decimal (e.g., 0.1 = 10%).
 * @returns The base value plus the percentage increment.
 */
export function increaseByPercentage(
	baseValue: number,
	percentage: number
): number {
	const increaseAmount = baseValue * percentage;
	return baseValue + increaseAmount;
}

/**
 * Decrease a base value by a given percentage.
 *
 * @param baseValue - The starting value.
 * @param percentage - The percentage to decrease by, as a decimal (e.g., 0.1 = 10%).
 * @returns The base value minus the percentage decrement.
 */
export function decreaseByPercentage(
	baseValue: number,
	percentage: number
): number {
	const decreaseAmount = baseValue * percentage;
	return baseValue - decreaseAmount;
}
