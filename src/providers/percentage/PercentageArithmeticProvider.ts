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
import { DecreaseByVisitor } from "@/visitors/percentage/DecreaseByVisitor";
import { IncreaseByVisitor } from "@/visitors/percentage/IncreaseByVisitor";
import { PercentageIncreaseOrDecreaseVisitor } from "@/visitors/percentage/PercentageIncreaseOrDecreaseVisitor";
import { PercentageOfVisitor } from "@/visitors/percentage/PercentageOfVisitor";

export class PercentageArithmeticProvider extends SemanticProviderBase<PercentageArithmeticSemantics> {
	constructor() {
		super("PercentageArithmeticProvider");

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

	provide<T = string>(sentence: string, raw: boolean = true): T | undefined {
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
			logger.error(e);
			return undefined;
		}
	}
}
