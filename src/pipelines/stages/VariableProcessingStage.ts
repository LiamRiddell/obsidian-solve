import { BasePipelineStage } from "@/pipelines/definition/stages/BasePipelineStage";
import { solveProviderManager } from "@/providers/ProviderManager";
import { IResult } from "@/results/definition/IResult";

// Important: Since this stage is stateful it can not be used in a shared context.
export class VariableProcessingStage extends BasePipelineStage<string> {
	private variableAssignmentRegex = new RegExp(/^(\$\w+)\s+=/);
	private variableSubstitutionRegex = new RegExp(/(\$\w+)/g);
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
		const result = solveProviderManager.provideFirst(
			assignmentExpression,
			true
		);

		if (result !== undefined) {
			this.variableMap.set(variableName, result as any as IResult<any>);
		}
	}

	private substituteVariables(expression: string): string {
		return expression.replace(this.variableSubstitutionRegex, (match) => {
			const variableValue = this.variableMap.get(match)?.value;
			return variableValue !== undefined ? variableValue : match;
		});
	}
}
