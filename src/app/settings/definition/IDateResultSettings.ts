/** How a date is written: the long form, ISO 8601, or day-first or month-first numbers. */
export type DateOutputFormat = "long" | "iso" | "dmy" | "mdy";

/** The values of {@link DateOutputFormat}, for validating a saved setting. */
export const DATE_OUTPUT_FORMATS: readonly DateOutputFormat[] = ["long", "iso", "dmy", "mdy"];

export interface IDateResultSettings {
	format: DateOutputFormat;
}
