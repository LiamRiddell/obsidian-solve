import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { DatetimeResult } from "@/results/DatetimeResult";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { StringResult } from "@/results/StringResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { Vector2Result } from "@/results/Vector2Result";
import { Vector3Result } from "@/results/Vector3Result";
import { Vector4Result } from "@/results/Vector4Result";
import { IDatetimeResult } from "@/results/definition/IDatetimeResult";
import { IResult } from "@/results/definition/IResult";
import { IStringResult } from "@/results/definition/IStringResult";
import { IVector2Result } from "@/results/definition/IVector2Result";
import { IVector3Result } from "@/results/definition/IVector3Result";
import { IVector4Result } from "@/results/definition/IVector4Result";
import UserSettings from "@/settings/UserSettings";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";
import convert, { Unit } from "convert-units";

export class FormatVisitor implements IGenericResultVisitor<string> {
	private settings: UserSettings;

	constructor() {
		this.settings = UserSettings.getInstance();
	}

	visit<TValue>(visited: IResult<TValue>): string {
		if (visited instanceof FloatResult) {
			return this.visitFloatResult(visited);
		}

		if (visited instanceof IntegerResult) {
			return this.visitIntegerResult(visited);
		}

		if (visited instanceof HexResult) {
			return this.visitHexResult(visited);
		}

		if (visited instanceof PercentageResult) {
			return this.visitPercentageResult(visited);
		}

		if (visited instanceof DatetimeResult) {
			return this.visitDatetimeResult(visited);
		}

		if (visited instanceof StringResult) {
			return this.visitStringResult(visited);
		}

		if (visited instanceof Vector2Result) {
			return this.visitVector2Result(visited);
		}

		if (visited instanceof Vector3Result) {
			return this.visitVector3Result(visited);
		}

		if (visited instanceof Vector4Result) {
			return this.visitVector4Result(visited);
		}

		if (visited instanceof UnitOfMeasurementResult) {
			return this.visitUnitOfMeasurementResult(visited);
		}

		throw new UnsupportedVisitorOperationError();
	}

	visitFloatResult(result: FloatResult): string {
		return result.value.toFixed(this.settings.floatResult.decimalPlaces);
	}

	visitHexResult(result: HexResult): string {
		const isNegative = result.value < 0;
		const hexString = Math.abs(result.value)
			.toString(16)
			.toUpperCase()
			.padStart(
				this.settings.hexResult.enablePadding
					? this.settings.hexResult.paddingZeros
					: 0,
				"0"
			);
		return isNegative ? `-0x${hexString}` : `0x${hexString}`;
	}

	visitIntegerResult(result: IntegerResult): string {
		return Math.trunc(result.value).toString();
	}

	visitPercentageResult(result: PercentageResult): string {
		return `${result.value.toFixed(
			this.settings.percentageResult.decimalPlaces
		)}%`;
	}

	visitDatetimeResult(result: IDatetimeResult): string {
		return result.value.format(this.settings.datetimeResult.format);
	}

	visitStringResult(result: IStringResult): string {
		return result.value;
	}

	visitVector2Result(result: IVector2Result): string {
		const x = result.value.x.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		const y = result.value.y.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		return `(${x}, ${y})`;
	}

	visitVector3Result(result: IVector3Result): string {
		const x = result.value.x.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		const y = result.value.y.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		const z = result.value.z.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		return `(${x}, ${y}, ${z})`;
	}

	visitVector4Result(result: IVector4Result): string {
		const x = result.value.x.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		const y = result.value.y.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		const z = result.value.z.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		const w = result.value.w.toFixed(
			this.settings.floatResult.decimalPlaces
		);

		return `(${x}, ${y}, ${z}, ${w})`;
	}

	visitUnitOfMeasurementResult(result: UnitOfMeasurementResult): string {
		const decimalPlaces =
			this.settings.unitOfMeasurementResult.decimalPlaces;

		const value = Number.isInteger(result.value)
			? result.value
			: result.value.toFixed(decimalPlaces);

		let unit = result.unit;

		if (this.settings.unitOfMeasurementResult.unitNames) {
			const unitData = convert().describe(result.unit as Unit);

			unit =
				Math.abs(result.value) > 1
					? unitData.plural
					: unitData.singular;
		}

		return `${value} ${unit}`;
	}
}
