export function autoFormatIntegerOrFloat(
	number: number,
	decimalPlaces: number = 2,
	includeThousandSeparators: boolean = false,
	decimalSeparatorLocale: string = "en-US"
) {
	if (Number.isInteger(number)) {
		return includeThousandSeparators
			? number.toLocaleString(decimalSeparatorLocale, {
					maximumFractionDigits: 0,
			})
			: Math.trunc(number);
	}

	return includeThousandSeparators
		? number.toLocaleString(decimalSeparatorLocale, {
				maximumFractionDigits: decimalPlaces,
		})
		: number.toFixed(decimalPlaces);
}
