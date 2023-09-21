import grammar, {
	UnitsOfMeasurementArithmeticSemantics,
} from "@/grammars/uom/UnitsOfMeasurement.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { NumberResult } from "@/results/AutoNumberResult";
import { HexResult } from "@/results/HexResult";
import { PercentageResult } from "@/results/PercentageResult";
import { StringResult } from "@/results/StringResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { logger } from "@/utilities/Logger";
import convert, { Unit } from "convert-units";

export class UnitsOfMeasurementProvider extends SemanticProviderBase<UnitsOfMeasurementArithmeticSemantics> {
	constructor() {
		super("UnitsOfMeasurementProvider");

		this.semantics = grammar.UnitsOfMeasurementArithmetic.createSemantics();

		this.semantics.addOperation<
			| UnitOfMeasurementResult
			| NumberResult
			| HexResult
			| PercentageResult
			| StringResult
		>("visit()", {
			...basicArithmeticSemanticActions,
			Conversion_best(_, uomNode, _1, _2) {
				const uom = uomNode.visit() as UnitOfMeasurementResult;

				const best = convert(uom.value)
					.from(uom.unit as Unit)
					.toBest();

				return new UnitOfMeasurementResult(best.val, best.unit);
			},
			Conversion_convert(_, uomNode, _1, unitNode) {
				const uom = uomNode.visit() as UnitOfMeasurementResult;
				const unit = unitNode.visit() as UnitOfMeasurementResult;

				return new UnitOfMeasurementResult(
					convert(uom.value)
						.from(uom.unit as Unit)
						.to(unit.unit as Unit),
					unit.unit
				);
			},
			ConversionPossiblities(_, uomNode, _1, _2) {
				const uom = uomNode.visit() as UnitOfMeasurementResult;

				const possibilities = convert()
					.from(uom.unit as Unit)
					.possibilities()
					.join(", ");

				return new StringResult(possibilities);
			},
			UoM(numberNode, unitNode) {
				const number = numberNode.visit() as INumericResult;
				const unit = unitNode.visit() as UnitOfMeasurementResult;

				return new UnitOfMeasurementResult(number.value, unit.unit);
			},
			Unit(_) {
				return new UnitOfMeasurementResult(0, this.sourceString);
			},
			percentage(numberNode, _) {
				return new PercentageResult(
					parseFloat(numberNode.sourceString)
				);
			},
		});
	}

	provide<T = string>(sentence: string, raw: boolean = true): T | undefined {
		try {
			const matchResult =
				grammar.UnitsOfMeasurementArithmetic.match(sentence);

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
