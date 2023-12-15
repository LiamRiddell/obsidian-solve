import { BasePipelineStage } from "@/pipelines/definition/stages/BaseSimplePipelineStage";
import { solveProviderManager } from "@/providers/ProviderManager";
import { AnyResult } from "@/results/AnyResult";
import { IResult } from "@/results/definition/IResult";
import { ResultSubstitutionFormatVisitor } from "@/visitors/format/VariableSubstitutionFormatVisitor";

// Important: Since this stage is stateful it can not be used in a shared context.
export class VariableProcessingStage extends BasePipelineStage<string> {
	private variableAssignmentRegex = new RegExp(/^(\$\w+)\s+=/);
	private variableSubstitutionRegex = new RegExp(/(\$\w+)/g);
	private resultSubstitutionVisitor = new ResultSubstitutionFormatVisitor();

	private variableMap = new Map<string, IResult<any>>();

	protected execute(request: string): string {
		// Check for variable assignment
		const assignmentMatch = request.match(this.variableAssignmentRegex);

		if (assignmentMatch) {
			const variableName = assignmentMatch[1];
			this.assignVariable(variableName, request);
		} else {
			// Perform variable substitution
			request = this.substituteVariables(request);
		}

		return request;
	}

	private assignVariable(variableName: string, expression: string): void {
		// Locate the index of = in the variable assignment e.g $someVar (=) expression
		const assignmentPosition = expression.indexOf("=");

		if (assignmentPosition === -1) {
			return;
		}

		// Get the solvable expression after the =
		const assignmentExpression = expression.substring(
			assignmentPosition + 1
		);

		// Solve the expression
		const solveResultTuple =
			solveProviderManager.provideFirst<AnyResult>(assignmentExpression);

		if (solveResultTuple === undefined) {
			return;
		}

		const [, result] = solveResultTuple;

		// Save the mapping to the variable name to result map table
		this.variableMap.set(variableName, result);
	}

	private substituteVariables(expression: string): string {
		return expression.replace(this.variableSubstitutionRegex, (match) => {
			const variableResult = this.variableMap.get(match);

			if (typeof variableResult === "undefined") {
				return match;
			}

			return this.resultSubstitutionVisitor.visit(variableResult);
		});
	}
}
