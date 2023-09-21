import { AutoNumberResult } from "@/results/AutoNumberResult";
import { HexResult } from "@/results/HexResult";
import { INumericResult } from "@/results/definition/INumericResult";

export class ArithmeticExpressionVisitor {
	visitPositive(e: INumericResult): INumericResult {
		e.value = Math.abs(e.value);
		return e;
	}

	visitNegative(e: INumericResult): INumericResult {
		e.value = -Math.abs(e.value);
		return e;
	}

	visitConstant(constantName: string): INumericResult {
		switch (constantName.toLowerCase()) {
			case "pi":
				return new AutoNumberResult(Math.PI);
			case "e":
				return new AutoNumberResult(Math.E);
			default:
				return new AutoNumberResult(0);
		}
	}

	visitHex(hexString: string): INumericResult {
		const hexValue = parseInt(
			hexString.replace("h", "").replace("0x", ""),
			16
		);
		return new HexResult(hexValue);
	}

	visitNumber(numString: string): INumericResult {
		return new AutoNumberResult(parseFloat(numString));
	}
}

export const ArithmeticExpression = new ArithmeticExpressionVisitor();
