export class UnsupportedVisitorOperationError extends Error {
	constructor(message?: string) {
		super(message || "Unsupported visitor operation");
		this.name = "UnsupportedVisitorOperationError";
		Error.captureStackTrace(this, UnsupportedVisitorOperationError);
	}
}
