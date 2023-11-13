import grammar, { DiceSemantics } from "@/grammars/dice/Dice.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { NumberResult } from "@/results/NumberResult";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { ArithmeticExpression } from "@/visitors/arithmetic/ArithmeticExpressionVisitor";

export class DiceProvider extends SemanticProviderBase<DiceSemantics> {
	constructor() {
		super("DiceProvider");

		this.semantics = grammar.createSemantics();

		const rollDice = (from: number, to: number): number => {
			if (from > to) {
				throw new Error(
					"'from' value must be less than or equal to 'to' value."
				);
			}

			return Math.floor(Math.random() * (to - from + 1)) + from;
		};

		this.semantics.addOperation<NumberResult>("visit()", {
			Roll(
				_,
				rollOpenNode,
				fromPrimitiveNode,
				rollSeperatorNode,
				toPrimitiveNode,
				rollEndNode
			) {
				const from = fromPrimitiveNode.visit();
				const to = toPrimitiveNode.visit();

				return new NumberResult(rollDice(from.value, to.value));
			},
			Primitive_positive(_, e) {
				return ArithmeticExpression.visitPositive(e.visit());
			},
			Primitive_negative(_, e) {
				return ArithmeticExpression.visitNegative(e.visit());
			},
			number_fract(_, _1, _2) {
				return ArithmeticExpression.visitNumber(this.sourceString);
			},
			number_whole(_) {
				return ArithmeticExpression.visitNumber(this.sourceString);
			},
		});
	}

	enabled() {
		return UserSettings.getInstance().diceProvider.enabled;
	}

	provide<T = string>(sentence: string, raw: boolean = true): T | undefined {
		try {
			const matchResult = grammar.match(sentence);

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
