function removeThousandsSeparators(
	value: number,
	locale: string,
	decimalPlaces: number
) {
	let localeNumber = value.toLocaleString(locale, {
		maximumFractionDigits: decimalPlaces,
		minimumFractionDigits: decimalPlaces,
	});

	switch (locale) {
		case "de-DE":
			localeNumber = localeNumber.replace(".", "");
			break;

		default:
			localeNumber = localeNumber.replace(",", "");
			break;
	}

	return localeNumber;
}

/**
 * Format `number` for display, branching on whether it's a whole number:
 * integers are always rendered with zero decimal places (never padded to
 * `decimalPlaces`), while non-integers are rendered with up to
 * `decimalPlaces` fractional digits. `includeThousandSeparators` controls
 * whether groups are separated (e.g. `"1,234"`) per `numberLocale`.
 *
 * @param number - The value to format.
 * @param decimalPlaces - Max fractional digits for non-integer values (default 2).
 * @param includeThousandSeparators - Whether to group digits (default false).
 * @param numberLocale - `Intl`/`toLocaleString` locale to format with (default "en-US").
 */
export function autoFormatIntegerOrFloat(
	number: number,
	decimalPlaces: number = 2,
	includeThousandSeparators: boolean = false,
	numberLocale: string = "en-US"
) {
	if (Number.isInteger(number)) {
		if (includeThousandSeparators) {
			// We can return the format early as we don't need to strip thousands
			return number.toLocaleString(numberLocale, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			});
		}

		return removeThousandsSeparators(Math.trunc(number), numberLocale, 0);
	}

	// Decimal
	if (includeThousandSeparators) {
		// We can return the format early as we don't need to strip thousands
		return number.toLocaleString(numberLocale, {
			maximumFractionDigits: decimalPlaces,
			minimumFractionDigits: decimalPlaces,
		});
	}

	// number.toFixed(decimalPlaces)

	return removeThousandsSeparators(number, numberLocale, decimalPlaces);
}
