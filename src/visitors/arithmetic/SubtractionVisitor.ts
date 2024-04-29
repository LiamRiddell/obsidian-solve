import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { percentageOf } from "@/utilities/Percentage";
import { convertUnitOfMeasurementResultTo } from "@/utilities/UnitOfMeasurement";
import { HexCoercion } from "@/visitors/coercion/HexCoercionVisitor";
import { NumberCoercion } from "@/visitors/coercion/NumberCoercionVisitor";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class SubtractionVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (visited instanceof NumberResult) {
			return this.number(visited, this.right);
		}

		if (visited instanceof HexResult) {
			return this.hex(visited, this.right);
		}

		if (visited instanceof PercentageResult) {
			return this.percentage(visited, this.right);
		}

		if (visited instanceof UnitOfMeasurementResult) {
			return this.unitOfMeasurement(visited, this.right);
		}

		throw new UnsupportedVisitorOperationError();
	}

	private number(left: NumberResult, right: INumericResult) {
		if (right instanceof PercentageResult) {
			return new NumberResult(
				left.value - percentageOf(right.value, left.value)
			);
		}

		const coercedRight = NumberCoercion.visit(right);
		return new NumberResult(left.value - coercedRight.value);
	}

	private hex(left: HexResult, right: INumericResult) {
		if (right instanceof PercentageResult) {
			return new HexResult(
				left.value - percentageOf(right.value, left.value)
			);
		}

		const coercedRight = HexCoercion.visit(right);
		return new HexResult(left.value - coercedRight.value);
	}

	private percentage(left: PercentageResult, right: INumericResult) {
		if (right instanceof PercentageResult) {
			return new NumberResult(
				left.value - percentageOf(right.value, left.value)
			);
		}

		const coercedRight = NumberCoercion.visit(right);
		return new NumberResult(left.value - coercedRight.value);
	}

	private unitOfMeasurement(
		left: UnitOfMeasurementResult,
		right: INumericResult
	) {
		if (right instanceof PercentageResult) {
			return new UnitOfMeasurementResult(
				left.value - percentageOf(right.value, left.value),
				left.unit
			);
		}

		if (right instanceof UnitOfMeasurementResult) {
			const convertedRight = convertUnitOfMeasurementResultTo(
				right,
				left
			);

			return new UnitOfMeasurementResult(
				left.value - convertedRight.value,
				left.unit
			);
		}

		const coercedRight = NumberCoercion.visit(right);

		return new UnitOfMeasurementResult(
			left.value - coercedRight.value,
			left.unit
		);
	}
}
