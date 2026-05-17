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
