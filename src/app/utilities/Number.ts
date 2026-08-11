/**
 * Remove locale-specific thousands separators from a formatted number string.
 *
 * @param value - The raw numeric value.
 * @param locale - BCP 47 locale tag (e.g., `"en-US"`, `"de-DE"`).
 * @param decimalPlaces - Number of fractional digits to preserve.
 * @returns The locale-formatted number with thousands separators stripped.
 * @internal Used by {@link autoFormatIntegerOrFloat}.
 */
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
 * Format a number as a locale-aware string, optionally with thousands separators.
 *
 * - Integers are formatted with zero fractional digits.
 * - Non-integers use the specified number of decimal places.
 * - When `includeThousandSeparators` is `false`, separators are stripped from
 *   the result (the default).
 *
 * @param number - The numeric value to format.
 * @param decimalPlaces - Number of fractional digits for non-integers. Default 2.
 * @param includeThousandSeparators - Whether to retain locale-specific separators. Default `false`.
 * @param numberLocale - BCP 47 locale tag for formatting. Default `"en-US"`.
 * @returns The formatted number string.
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
