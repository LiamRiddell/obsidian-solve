import grammar, {
	UnitsOfMeasurementArithmeticSemantics,
} from "@/grammars/uom/UnitsOfMeasurement.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import { StringResult } from "@/results/StringResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { INumericResult } from "@/results/definition/INumericResult";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { UNIT_OF_MEASUREMENT_PROVIDER } from "@/utilities/constants/providers/Names";
import convert, { Unit } from "convert-units";

export class UnitsOfMeasurementProvider extends SemanticProviderBase<UnitsOfMeasurementArithmeticSemantics> {
	constructor() {
		super(UNIT_OF_MEASUREMENT_PROVIDER);

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
			uom(numberNode, _, _1, unitNode) {
				const number = numberNode.visit() as INumericResult;
				const unit = unitNode.visit() as UnitOfMeasurementResult;

				return new UnitOfMeasurementResult(number.value, unit.unit);
			},
			unit(_) {
				return new UnitOfMeasurementResult(0, this.sourceString);
			},
			percentage(numberNode, _) {
				return new PercentageResult(
					parseFloat(numberNode.sourceString)
				);
			},
		});
	}

	enabled() {
		return UserSettings.getInstance().unitOfMeasurementProvider.enabled;
	}

	provide<T = UnitOfMeasurementResult | StringResult>(
		expression: string
	): T | undefined {
		try {
			const matchResult =
				grammar.UnitsOfMeasurementArithmetic.match(expression);

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
