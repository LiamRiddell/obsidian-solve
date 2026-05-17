export class UnsupportedCoercionOperationError extends Error {
	constructor(message?: string) {
		super(message || "Unsupported coercion operation");
		this.name = "UnsupportedCoercionOperationError";
		Error.captureStackTrace(this, UnsupportedCoercionOperationError);
	}
}
