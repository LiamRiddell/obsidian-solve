import grammar, {
	FunctionArithmeticSemantics,
} from "@/grammars/function/FunctionArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { FUNCTION_ARITHMETIC_PROVIDER } from "@/utilities/constants/providers/Names";
import { degreesToRadians, radiansToDegrees } from "@/utilities/math/Angle";
import { logBase } from "@/utilities/math/Log";

export class FunctionArithmeticProvider extends SemanticProviderBase<FunctionArithmeticSemantics> {
	constructor() {
		super(FUNCTION_ARITHMETIC_PROVIDER);

		this.semantics = grammar.FunctionArithmetic.createSemantics();

		this.semantics.addOperation<NumberResult | HexResult>("visit()", {
			...basicArithmeticSemanticActions,
			DegreesToRadians(_, _l, degreesNode, _r) {
				const degrees = degreesNode.visit();
				return new NumberResult(degreesToRadians(degrees.value));
			},
			RadiansToDegrees(_, _l, radiansNode, _r) {
				const radians = radiansNode.visit();
				return new NumberResult(radiansToDegrees(radians.value));
			},
			LogBase(_, _l, baseNode, _s, valueNode, _r) {
				const base = baseNode.visit();
				const value = valueNode.visit();
				return new NumberResult(logBase(base.value, value.value));
			},
			JavascriptMathObjectFunction(functionName, _l, e, _r) {
				const functionNameLower =
					functionName.sourceString.toLowerCase();

				const argumentsArray = e
					.asIteration()
					.children.map((c) => c.visit().value);

				const mathFunc = (Math as any)[functionNameLower];

				return new NumberResult(
					mathFunc ? mathFunc(...argumentsArray) : 0
				);
			},
		});
	}

	enabled() {
		return UserSettings.getInstance().functionArithmeticProvider.enabled;
	}

	provide<T = NumberResult | HexResult>(expression: string): T | undefined {
		try {
			const matchResult = grammar.FunctionArithmetic.match(expression);

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
