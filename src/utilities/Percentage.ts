export function percentageOf(percent: number, population: number) {
	return (population / 100) * percent;
}

export function percentageIncrease(
	originalValue: number,
	newValue: number
): number {
	const increaseAmount = newValue - originalValue;
	return (increaseAmount / originalValue) * 100;
}

export function percentageDecrease(
	originalValue: number,
	newValue: number
): number {
	const decreaseAmount = originalValue - newValue;
	return (decreaseAmount / originalValue) * 100;
}

export function increaseByPercentage(
	baseValue: number,
	percentage: number
): number {
	const increaseAmount = (baseValue * percentage) / 100;
	return baseValue + increaseAmount;
}

export function decreaseByPercentage(
	baseValue: number,
	percentage: number
): number {
	const decreaseAmount = (baseValue * percentage) / 100;
	return baseValue - decreaseAmount;
}
