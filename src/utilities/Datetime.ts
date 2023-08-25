import moment from "moment";

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
