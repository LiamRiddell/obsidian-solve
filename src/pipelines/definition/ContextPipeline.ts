import { EmptyPipelineError } from "@/errors/EmptyPipelineError";
import { IContextPipelineStage } from "@/pipelines/definition/stages/IContextPipelineStage";

export class ContextPipeline<Context, Output> {
	private firstStage: IContextPipelineStage<Context, Output> | null = null;
	private lastStage: IContextPipelineStage<Context, Output> | null = null;

	addStage(
		stage: IContextPipelineStage<Context, Output>
	): ContextPipeline<Context, Output> {
		if (!this.firstStage) {
			this.firstStage = this.lastStage = stage;
		} else {
			if (this.lastStage) {
				this.lastStage.next(stage);
			}
			this.lastStage = stage;
		}

		return this;
	}

	process(context: Context, request: Output): Output {
		if (!this.firstStage) {
			throw new EmptyPipelineError();
		}

		return this.firstStage.process(context, request);
	}
}
