export interface IStatelessPipelineStage<T> {
	next(stage: IStatelessPipelineStage<T>): IStatelessPipelineStage<T>;
	process(request: T): T;
}
