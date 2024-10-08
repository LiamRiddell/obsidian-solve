import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
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
				return new NumberResult(Math.PI);
			case "e":
				return new NumberResult(Math.E);
			default:
				return new NumberResult(0);
		}
	}

	visitHex(hexString: string): INumericResult {
		const hexValue = parseInt(
			hexString.replace("h", "").replace("0x", ""),
			16
		);
		return new HexResult(hexValue);
	}

	visitNumber(
		numString: string,
		decimalSeparatorLocale: string
	): INumericResult {
		switch (decimalSeparatorLocale) {
			case "de-DE":
				numString = numString
					// Replace comma with temp character || e.g. 124,200 -> 124||200
					.replace(",", "||")
					// Replace the fullstops with nothing e.g. 124.200 -> 124200
					.replace(".", "")
					// Replace the temp character back e.g. 124||200 -> 124.200
					.replace("||", ".");
				break;

			default:
				if (numString.indexOf(",") > -1) {
					numString = numString.replace(",", "");
				}
				break;
		}

		return new NumberResult(parseFloat(numString));
	}
}

export const ArithmeticExpression = new ArithmeticExpressionVisitor();
