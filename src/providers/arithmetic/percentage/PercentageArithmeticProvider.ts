import { BaseSolveProvider } from "@/providers/BaseSolveProvider";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/basic/ArithmeticSemantics";
import grammar, {
	PercentageArithmeticSemantics,
} from "@/providers/arithmetic/percentage/PercentageArithmetic.ohm-bundle";
import {
	decreaseByPercentage,
	increaseByPercentage,
	percentageIncrease,
	percentageOf,
} from "@/utilities/Percentage";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { IntegerResult } from "@/visitors/results/IntegerResult";
import { PercentageResult } from "@/visitors/results/PercentageResult";

export class PercentageArithmeticProvider extends BaseSolveProvider<PercentageArithmeticSemantics> {
	name: string = "PercentageArithmeticProvider";

	constructor() {
		super();

		this.semantics = grammar.PercentageArithmetic.createSemantics();

		this.semantics.addOperation<
			FloatResult | IntegerResult | HexResult | PercentageResult
		>("visit()", {
			...basicArithmeticSemanticActions,
			PercentageOf(percentNode, _, of, populationNode) {
				const percent = percentNode.visit();
				const population = populationNode.visit();

				return new FloatResult(
					percentageOf(percent.value, population.value)
				);
			},
			IncreaseBy(_, valueNode, _1, percentageNode, _2) {
				const value = valueNode.visit();
				const percentage = percentageNode.visit();

				return new FloatResult(
					increaseByPercentage(value.value, percentage.value)
				);
			},
			DecreaseBy(_, valueNode, _1, percentageNode, _2) {
				const value = valueNode.visit();
				const percentage = percentageNode.visit();

				return new FloatResult(
					decreaseByPercentage(value.value, percentage.value)
				);
			},
			PercentageIncreaseOrDecrease(
				_,
				originalValueNode,
				_1,
				newValueNode
			) {
				const originalValue = originalValueNode.visit();
				const newValue = newValueNode.visit();

				return new PercentageResult(
					percentageIncrease(originalValue.value, newValue.value)
				);
			},
			percentage(numberNode, _) {
				return new PercentageResult(
					parseFloat(numberNode.sourceString)
				);
			},
		});
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const matchResult = grammar.PercentageArithmetic.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).visit();

			if (raw) {
				return result;
			}

			return result.accept(this.formatVisitor);
		} catch (e) {
			// console.error(e);
			return undefined;
		}
	}
}
