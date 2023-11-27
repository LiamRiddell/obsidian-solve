export interface IPipelineStage<T> {
	next(stage: IPipelineStage<T>): IPipelineStage<T>;
	process(request: T): T;
}
