export interface IStatefulPipelineStage<State, Output> {
	next(
		stage: IStatefulPipelineStage<State, Output>
	): IStatefulPipelineStage<State, Output>;
	process(state: State, request: Output): Output;
}
