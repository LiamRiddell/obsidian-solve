import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import { IPluginSettings } from "@/settings/definition/IPluginSettings";
import { ArithmeticProviderSettings } from "@/settings/properties/ArithmeticProviderSettings";
import { BigIntegerArithmeticProviderSettings } from "@/settings/properties/BigIntegerArithmeticProviderSettings";
import { DatetimeProviderSettings } from "@/settings/properties/DatetimeProviderSettings";
import { DatetimeResultSettings } from "@/settings/properties/DatetimeResultSettings";
import { DiceProviderSettings } from "@/settings/properties/DiceProviderSettings";
import { EngineSettings } from "@/settings/properties/EngineSettings";
import { FloatResultSettings } from "@/settings/properties/FloatResultSettings";
import { FunctionArithmeticProviderSettings } from "@/settings/properties/FunctionArithmeticProviderSettings";
import { HexResultSettings } from "@/settings/properties/HexResultSettings";
import { InlineSolveSettings } from "@/settings/properties/InlineSolveSettings";
import { IntegerResultSettings } from "@/settings/properties/IntegerResultSettings";
import { InterfaceSettings } from "@/settings/properties/InterfaceSettings";
import { NumberResultSettings } from "@/settings/properties/NumberResultSettings";
import { PercentageArithmeticProviderSettings } from "@/settings/properties/PercentageArithmeticProviderSettings";
import { PercentageResultSettings } from "@/settings/properties/PercentageResultSettings";
import { UnitOfMeasurementProviderSettings } from "@/settings/properties/UnitOfMeasurementProviderSettings";
import { UnitOfMeasurementResultSettings } from "@/settings/properties/UnitOfMeasurementResultSettings";
import { VariableSettings } from "@/settings/properties/VariableSettings";
import { VectorArithmeticProviderSettings } from "@/settings/properties/VectorArithmeticProviderSettings";

export default class UserSettings {
	private static instance: UserSettings | null = null;
	public settings: IPluginSettings;

	public readonly engine: EngineSettings;
	public readonly interface: InterfaceSettings;
	public readonly inlineSolve: InlineSolveSettings;
	public readonly variable: VariableSettings;

	// Provider Settings
	public readonly arithmeticProvider: ArithmeticProviderSettings;
	public readonly functionArithmeticProvider: FunctionArithmeticProviderSettings;
	public readonly vectorArithmeticProvider: VectorArithmeticProviderSettings;
	public readonly percentageArithmeticProvider: PercentageArithmeticProviderSettings;
	public readonly datetimeProvider: DatetimeProviderSettings;
	public readonly unitOfMeasurementProvider: UnitOfMeasurementProviderSettings;
	public readonly diceProvider: DiceProviderSettings;
	public readonly bigIntegerArithmeticProvider: BigIntegerArithmeticProviderSettings;

	// Result Settings
	public readonly numberResult: NumberResultSettings;
	public readonly integerResult: IntegerResultSettings;
	public readonly floatResult: FloatResultSettings;
	public readonly percentageResult: PercentageResultSettings;
	public readonly datetimeResult: DatetimeResultSettings;
	public readonly hexResult: HexResultSettings;
	public readonly unitOfMeasurementResult: UnitOfMeasurementResultSettings;

	private constructor() {
		this.settings = DEFAULT_SETTINGS;

		// General
		this.engine = new EngineSettings(this);
		this.interface = new InterfaceSettings(this);
		this.inlineSolve = new InlineSolveSettings(this);
		this.variable = new VariableSettings(this);

		// Providers
		this.arithmeticProvider = new ArithmeticProviderSettings(this);
		this.functionArithmeticProvider =
			new FunctionArithmeticProviderSettings(this);
		this.vectorArithmeticProvider = new VectorArithmeticProviderSettings(
			this
		);
		this.percentageArithmeticProvider =
			new PercentageArithmeticProviderSettings(this);
		this.datetimeProvider = new DatetimeProviderSettings(this);
		this.unitOfMeasurementProvider = new UnitOfMeasurementProviderSettings(
			this
		);
		this.diceProvider = new DiceProviderSettings(this);
		this.bigIntegerArithmeticProvider =
			new BigIntegerArithmeticProviderSettings(this);

		// Results
		this.numberResult = new NumberResultSettings(this);
		this.integerResult = new IntegerResultSettings(this);
		this.floatResult = new FloatResultSettings(this);
		this.percentageResult = new PercentageResultSettings(this);
		this.datetimeResult = new DatetimeResultSettings(this);
		this.hexResult = new HexResultSettings(this);
		this.unitOfMeasurementResult = new UnitOfMeasurementResultSettings(
			this
		);
	}

	static getInstance(): UserSettings {
		if (!UserSettings.instance) {
			UserSettings.instance = new UserSettings();
		}
		return UserSettings.instance;
	}

	public updateSettings(settings: IPluginSettings) {
		this.settings = settings;
	}
}
