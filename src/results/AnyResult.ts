import { DatetimeResult } from "@/results/DatetimeResult";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import { StringResult } from "@/results/StringResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { Vector2Result } from "@/results/Vector2Result";
import { Vector3Result } from "@/results/Vector3Result";
import { Vector4Result } from "@/results/Vector4Result";

export type AnyResult =
	| StringResult
	| NumberResult
	| HexResult
	| DatetimeResult
	| PercentageResult
	| UnitOfMeasurementResult
	| Vector2Result
	| Vector3Result
	| Vector4Result;
