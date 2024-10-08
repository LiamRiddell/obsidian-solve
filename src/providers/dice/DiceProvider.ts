import grammar, { DiceSemantics } from "@/grammars/dice/Dice.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { NumberResult } from "@/results/NumberResult";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { DICE_PROVIDER } from "@/utilities/constants/providers/Names";
import { ArithmeticExpression } from "@/visitors/arithmetic/ArithmeticExpressionVisitor";

export class DiceProvider extends SemanticProviderBase<DiceSemantics> {
	constructor() {
		super(DICE_PROVIDER);

		const settings = UserSettings.getInstance();

		this.cacheable = false;

		this.semantics = grammar.createSemantics();

		const rollDice = (from: number, to: number): number => {
			if (from > to) {
				throw new Error(
					"'from' value must be less than or equal to 'to' value."
				);
			}

			return Math.floor(Math.random() * (to - from + 1)) + from;
		};

		this.semantics
			.addOperation<NumberResult>("visit()", {
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
					return ArithmeticExpression.visitNumber(
						this.sourceString,
						settings.numberResult.decimalSeparatorLocale
					);
				},
				number_whole(_) {
					return ArithmeticExpression.visitNumber(
						this.sourceString,
						settings.numberResult.decimalSeparatorLocale
					);
				},
			})
			.bind(this);
	}

	enabled() {
		return UserSettings.getInstance().diceProvider.enabled;
	}

	provide<T = NumberResult>(expression: string): T | undefined {
		try {
			const matchResult = grammar.match(expression);

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
