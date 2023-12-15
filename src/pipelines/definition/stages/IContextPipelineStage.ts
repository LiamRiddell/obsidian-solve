export interface IContextPipelineStage<Context, Output> {
	next(
		stage: IContextPipelineStage<Context, Output>
	): IContextPipelineStage<Context, Output>;
	process(context: Context, request: Output): Output;
}
