import moment from "moment";

/**
 * Convert a day-of-week name to its numeric index (0 = Sunday, 6 = Saturday).
 *
 * @param dayName - Lowercase day name ("sunday" through "saturday").
 * @returns The 0-based index of the day, defaulting to 0 for unrecognized input.
 */
export const dayOfWeekToIndex = (dayName: string) => {
	switch (dayName) {
		case "sunday":
			return 0;

		case "monday":
			return 1;

		case "tuesday":
			return 2;

		case "wednesday":
			return 3;

		case "thursday":
			return 4;

		case "friday":
			return 5;

		case "saturday":
			return 6;
	}

	return 0;
};

/**
 * Compute the next occurrence of the given day of week from today.
 *
 * If today matches the target day, returns the same day next week.
 *
 * @param dayIndex - ISO weekday index (1 = Monday, 7 = Sunday).
 * @returns A `moment` object for the next occurrence at 00:00.
 */
export const getNextDayOfWeek = (dayIndex: number) => {
	const today = moment().startOf("day");
	const targetDay = moment().isoWeekday(dayIndex);

	if (targetDay.isSame(today, "day")) {
		return targetDay.add(1, "week");
	} else if (targetDay.isSameOrAfter(today)) {
		return targetDay;
	} else {
		return targetDay.add(1, "week");
	}
};

/**
 * Compute the previous occurrence of the given day of week from today.
 *
 * If today matches the target day, returns the same day last week.
 *
 * @param dayIndex - ISO weekday index (1 = Monday, 7 = Sunday).
 * @returns A `moment` object for the previous occurrence at 00:00.
 */
export const getPreviousDayOfWeek = (dayIndex: number) => {
	const today = moment().startOf("day");
	const targetDay = moment().isoWeekday(dayIndex);

	if (targetDay.isSame(today, "day")) {
		return targetDay.subtract(1, "week");
	} else if (targetDay.isBefore(today)) {
		return targetDay;
	} else {
		return targetDay.subtract(1, "week");
	}
};
