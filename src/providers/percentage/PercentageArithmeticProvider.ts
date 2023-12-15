import grammar, {
	PercentageArithmeticSemantics,
} from "@/grammars/percentage/PercentageArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { PERCENTAGE_ARITHMETIC_PROVIDER } from "@/utilities/constants/providers/Names";
import { DecreaseByVisitor } from "@/visitors/percentage/DecreaseByVisitor";
import { IncreaseByVisitor } from "@/visitors/percentage/IncreaseByVisitor";
import { PercentageIncreaseOrDecreaseVisitor } from "@/visitors/percentage/PercentageIncreaseOrDecreaseVisitor";
import { PercentageOfVisitor } from "@/visitors/percentage/PercentageOfVisitor";

export class PercentageArithmeticProvider extends SemanticProviderBase<PercentageArithmeticSemantics> {
	constructor() {
		super(PERCENTAGE_ARITHMETIC_PROVIDER);

		this.semantics = grammar.PercentageArithmetic.createSemantics();

		this.semantics.addOperation<
			NumberResult | HexResult | PercentageResult
		>("visit()", {
			...basicArithmeticSemanticActions,
			PercentageOf(percentNode, of, populationNode) {
				const percent = percentNode.visit();
				const population = populationNode.visit();

				return percent.accept(new PercentageOfVisitor(population));
			},
			IncreaseBy(_1, valueNode, _2, percentageNode) {
				const value = valueNode.visit();
				const percentage = percentageNode.visit();

				return value.accept(new IncreaseByVisitor(percentage));
			},
			DecreaseBy(_1, valueNode, _2, percentageNode) {
				const value = valueNode.visit();
				const percentage = percentageNode.visit();

				return value.accept(new DecreaseByVisitor(percentage));
			},
			PercentageIncreaseOrDecrease(_, thenNode, _1, nowNode) {
				const then = thenNode.visit();
				const now = nowNode.visit();

				return then.accept(
					new PercentageIncreaseOrDecreaseVisitor(now)
				);
			},
			percentage(numberNode, _) {
				return new PercentageResult(
					parseFloat(numberNode.sourceString)
				);
			},
		});
	}

	enabled() {
		return UserSettings.getInstance().percentageArithmeticProvider.enabled;
	}

	provide<T = NumberResult | HexResult | PercentageResult>(
		expression: string
	): T | undefined {
		try {
			const matchResult = grammar.PercentageArithmetic.match(expression);

			if (matchResult.failed()) {
				return undefined;
			}

			return this.semantics(matchResult).visit();
		} catch (e) {
			logger.error(e);
			return undefined;
		}
	}
}
