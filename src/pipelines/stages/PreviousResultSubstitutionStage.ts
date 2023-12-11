import { BasePipelineStage } from "@/pipelines/definition/stages/BasePipelineStage";
import { IResult } from "@/results/definition/IResult";
import { ResultSubstitutionFormatVisitor } from "@/visitors/format/VariableSubstitutionFormatVisitor";

// Important: Since this stage is stateful it can not be used in a shared context.
export class PreviousResultSubstitutionStage extends BasePipelineStage<string> {
	private previousResultSubstitutionRegex = new RegExp(/\$prev/gi);
	private resultSubstitutionVisitor: ResultSubstitutionFormatVisitor;

	// TODO: We want to switch to passing around IResult as opposed a string as this is more re-usable.
	private previousResult: IResult<any>;
	private previousResultString: string;

	constructor() {
		super();
		this.resultSubstitutionVisitor = new ResultSubstitutionFormatVisitor();
	}

	protected execute(request: string): string {
		// Substitute previous solve into the expression
		// if (this.previousResult) {
		// 	console.log(
		// 		"PREVIOUS SOLVE",
		// 		this.previousResult,
		// 		"EXPRESSION",
		// 		request
		// 	);

		// 	request = request.replace(
		// 		this.previousResultSubstitutionRegex,
		// 		this.resultSubstitutionVisitor.visit(this.previousResult)
		// 	);
		// }

		if (this.previousResultString) {
			return request.replace(
				this.previousResultSubstitutionRegex,
				this.previousResultString
			);
		}

		return request;
	}

	public setPreviousResult(result: IResult<any>) {
		this.previousResult = result;
	}

	public setPreviousResultString(string: string) {
		this.previousResultString = string;
	}
}
