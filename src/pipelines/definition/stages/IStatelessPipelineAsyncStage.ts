export interface IStatelessPipelineAsyncStage<T> {
	next(
		stage: IStatelessPipelineAsyncStage<T>
	): IStatelessPipelineAsyncStage<T>;
	process(request: T): Promise<T>;
}
