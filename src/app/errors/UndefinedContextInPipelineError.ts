/**
 * Thrown when a pipeline stage receives an `undefined` value in its context.
 *
 * Indicates a data flow error — an upstream stage failed to produce a
 * required intermediate result.
 */
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
