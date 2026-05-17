export class UndefinedContextInPipelineError extends Error {
	constructor(message?: string) {
		super(
			message ||
				"The executed pipeline has a received an undefined value in the context."
		);
		this.name = "UndefinedContextInPipelineError";
		Error.captureStackTrace(this, UndefinedContextInPipelineError);
	}
}
