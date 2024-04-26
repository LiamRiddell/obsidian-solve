import { ERadix } from "@/constants/ERadix";
import grammar, {
	BigIntArithmeticSemantics,
} from "@/grammars/bigint/BigIntegerArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { BigIntResult } from "@/results/BigIntResult";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { BIGINT_ARITHMETIC_PROVIDER } from "@/utilities/constants/providers/Names";

export class BigIntegerArithmeticProvider extends SemanticProviderBase<BigIntArithmeticSemantics> {
	constructor() {
		super(BIGINT_ARITHMETIC_PROVIDER);
		this.semantics = grammar.createSemantics();
		this.semantics.addOperation("visit()", {
			/*
			= Bitwise "<<" AS -- leftShift
			| Bitwise ">>>" AS -- unsignedRightShift
			| Bitwise ">>" AS -- rightShift
			| Bitwise "&" AS -- AND
			| Bitwise "^" AS -- XOR
			| Bitwise "|" AS -- OR
			*/
			Bitwise_leftShift(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value << y.value), x.radix);
			},
			Bitwise_rightShift(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value >> y.value), x.radix);
			},
			Bitwise_unsignedRightShift(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value >>> y.value), x.radix);
			},
			Bitwise_AND(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value & y.value), x.radix);
			},
			Bitwise_XOR(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value ^ y.value), x.radix);
			},
			Bitwise_OR(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value | y.value), x.radix);
			},
			AS_addition(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value + y.value), x.radix);
			},
			AS_subtraction(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value - y.value), x.radix);
			},
			MD_multiplication(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value * y.value), x.radix);
			},
			MD_division(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value / y.value), x.radix);
			},
			MD_remainder(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value % y.value), x.radix);
			},
			E_exponent(xNode, _, yNode) {
				const x = xNode.visit();
				const y = yNode.visit();
				return new BigIntResult(BigInt(x.value ** y.value), x.radix);
			},
			P_parenthesis(_l, e, _r) {
				return e.visit();
			},
			hex(_, _1) {
				return new BigIntResult(
					BigInt(this.sourceString),
					ERadix.Hexadecimal
				);
			},
			binary(_, _1) {
				return new BigIntResult(
					BigInt(this.sourceString),
					ERadix.Binary
				);
			},
			bigInteger(_) {
				return new BigIntResult(
					BigInt(this.sourceString),
					ERadix.Decimal
				);
			},
		});

		this.cacheable = true;
	}

	enabled() {
		return UserSettings.getInstance().arithmeticProvider.enabled;
	}

	provide<T = NumberResult | HexResult>(expression: string): T | undefined {
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
