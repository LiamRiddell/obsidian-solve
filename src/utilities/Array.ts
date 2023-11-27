export function minValueExcludingBelow(
	values: number[],
	threshold: number = -1
): number {
	// Filter out values below the threshold and find the minimum value
	const validValues = values.filter((value) => value > threshold);

	if (validValues.length === 0) {
		return threshold;
	}

	return Math.min(...validValues);
}
