/**
 * Insert a substring at a given index within a string.
 *
 * When `trim` is enabled (default), whitespace around the insertion point
 * is collapsed to produce a clean join. The substring before `index` has
 * trailing whitespace trimmed; the substring after `index` has leading
 * whitespace trimmed.
 *
 * @param str - The original string.
 * @param index - Character index at which to insert `value`.
 * @param value - The substring to insert.
 * @param trim - Whether to trim whitespace around the insertion. Default `true`.
 * @returns A new string with `value` inserted at `index`.
 */
export function insertAtIndex(
	str: string,
	index: number,
	value: string,
	trim: boolean = true
) {
	if (trim) {
		return (
			str.substring(0, index).trimEnd() +
			value +
			str.substring(index).trim()
		);
	}

	return str.substring(0, index) + value + str.substring(index);
}
