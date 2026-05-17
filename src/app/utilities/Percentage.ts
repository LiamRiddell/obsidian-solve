export function percentageOf(decimalPercentage: number, population: number) {
	return population * decimalPercentage;
}

export function percentageIncrease(
	originalValue: number,
	newValue: number
): number {
	const increaseAmount = newValue - originalValue;
	return increaseAmount / originalValue;
}

export function percentageDecrease(
	originalValue: number,
	newValue: number
): number {
	const decreaseAmount = originalValue - newValue;
	return decreaseAmount / originalValue;
}

export function increaseByPercentage(
	baseValue: number,
	percentage: number
): number {
	const increaseAmount = baseValue * percentage;
	return baseValue + increaseAmount;
}

export function decreaseByPercentage(
	baseValue: number,
	percentage: number
): number {
	const decreaseAmount = baseValue * percentage;
	return baseValue - decreaseAmount;
}
