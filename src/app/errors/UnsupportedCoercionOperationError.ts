/**
 * Thrown when an unsupported type coercion is attempted in the pipeline.
 *
 * E.g., trying to coerce a datetime value to a vector, or any other
 * conversion that has no defined semantics.
 */
export class UnsupportedCoercionOperationError extends Error {
	constructor(message?: string) {
		super(message || "Unsupported coercion operation");
		this.name = "UnsupportedCoercionOperationError";
		Error.captureStackTrace(this, UnsupportedCoercionOperationError);
	}
}
