export function autoFormatIntegerOrFloat(
	number: number,
	decimalPlaces: number = 2
) {
	if (Number.isInteger(number)) {
		return Math.trunc(number);
	}

	return number.toFixed(decimalPlaces);
}
