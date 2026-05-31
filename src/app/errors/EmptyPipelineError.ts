/**
 * Thrown when a pipeline is executed with no registered stages.
 *
 * This is a programmer error — the engine should never attempt to evaluate
 * a document with no active providers.
 */
export class EmptyPipelineError extends Error {
	constructor(message?: string) {
		super(message || "The executed pipeline has no stages.");
		this.name = "EmptyPipelineError";
		Error.captureStackTrace(this, EmptyPipelineError);
	}
}
