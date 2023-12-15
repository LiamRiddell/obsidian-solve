import { IContextPipelineStage } from "@/pipelines/definition/stages/IContextPipelineStage";

export abstract class BaseContextPipelineStage<Context, Output>
	implements IContextPipelineStage<Context, Output>
{
	private nextStage: IContextPipelineStage<Context, Output> | null = null;

	next(
		stage: IContextPipelineStage<Context, Output>
	): IContextPipelineStage<Context, Output> {
		this.nextStage = stage;
		return stage;
	}

	process(context: Context, request: Output): Output {
		request = this.execute(context, request);
		return this.nextStage
			? this.nextStage.process(context, request)
			: request;
	}

	// Execute the stage's user code.
	protected abstract execute(context: Context, request: Output): Output;
}
