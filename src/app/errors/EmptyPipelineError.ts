export class EmptyPipelineError extends Error {
	constructor(message?: string) {
		super(message || "The executed pipeline has no stages.");
		this.name = "EmptyPipelineError";
		Error.captureStackTrace(this, EmptyPipelineError);
	}
}
