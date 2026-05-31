/**
 * Thrown when a pipeline visitor encounters an unsupported operation.
 *
 * Similar to {@link UnsupportedCoercionOperationError} but thrown by
 * the visitor/transform layer rather than the coercion layer.
 */
export class UnsupportedVisitorOperationError extends Error {
	constructor(message?: string) {
		super(message || "Unsupported visitor operation");
		this.name = "UnsupportedVisitorOperationError";
		Error.captureStackTrace(this, UnsupportedVisitorOperationError);
	}
}
