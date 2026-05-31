/**
 * Result type classification for formatting and display.
 *
 * Determines how a solved expression's output is rendered (e.g., a number,
 * a datetime string, a hex value). `Pending` is a special sentinel for
 * async results awaiting resolution.
 */
export enum EResultType {
	Number,
	Hex,
	String,
	Datetime,
	Percentage,
	Vector2,
	Vector3,
	Vector4,
	UnitOfMeasurement,
	/** Async result not yet resolved — show loading indicator. */
	Pending,
}
