import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { INumericResult } from "@/results/definition/INumericResult";

export class ArithmeticExpressionVisitor {
	visitPositive(e: INumericResult): INumericResult {
		return new IntegerResult(Math.abs(e.value));
	}

	visitNegative(e: INumericResult): INumericResult {
		return new IntegerResult(-Math.abs(e.value));
	}

	visitConstant(constantName: string): INumericResult {
		switch (constantName.toLowerCase()) {
			case "pi":
				return new FloatResult(Math.PI);
			case "e":
				return new FloatResult(Math.E);
			default:
				return new FloatResult(0);
		}
	}

	visitHex(hexString: string): INumericResult {
		const hexValue = parseInt(
			hexString.replace("h", "").replace("0x", ""),
			16
		);
		return new HexResult(hexValue);
	}

	visitFloat(numString: string): INumericResult {
		return new FloatResult(parseFloat(numString));
	}

	visitInteger(numString: string): INumericResult {
		return new IntegerResult(parseInt(numString));
	}
}
