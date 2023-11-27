export interface IPipelineAsyncStage<T> {
	next(stage: IPipelineAsyncStage<T>): IPipelineAsyncStage<T>;
	process(request: T): Promise<T>;
}
