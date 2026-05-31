/**
 * Find the minimum value in an array, excluding values at or below a threshold.
 *
 * Useful for locating the first meaningful position in a list of candidate
 * indices (e.g., finding the earliest comment marker in a line of text).
 *
 * @param values - Array of candidate values (e.g., character positions from `indexOf`).
 * @param threshold - Values ≤ this are excluded from consideration. Default `-1`
 *   (the standard sentinel value for "not found").
 * @returns The minimum value above the threshold, or the threshold itself if no
 *   values qualify.
 */
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
