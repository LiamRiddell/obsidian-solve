import { DEFAULT_SETTINGS } from "@app/settings/PluginSettings";
import { IPluginSettings } from "@app/settings/definition/IPluginSettings";
import { ArithmeticProviderSettings } from "@app/settings/properties/ArithmeticProviderSettings";
import { BigIntegerArithmeticProviderSettings } from "@app/settings/properties/BigIntegerArithmeticProviderSettings";
import { DatetimeProviderSettings } from "@app/settings/properties/DatetimeProviderSettings";
import { DatetimeResultSettings } from "@app/settings/properties/DatetimeResultSettings";
import { DiceProviderSettings } from "@app/settings/properties/DiceProviderSettings";
import { EngineSettings } from "@app/settings/properties/EngineSettings";
import { FloatResultSettings } from "@app/settings/properties/FloatResultSettings";
import { FunctionArithmeticProviderSettings } from "@app/settings/properties/FunctionArithmeticProviderSettings";
import { HexResultSettings } from "@app/settings/properties/HexResultSettings";
import { InlineSolveSettings } from "@app/settings/properties/InlineSolveSettings";
import { IntegerResultSettings } from "@app/settings/properties/IntegerResultSettings";
import { InterfaceSettings } from "@app/settings/properties/InterfaceSettings";
import { SyntaxHighlightSettings } from "@app/settings/properties/SyntaxHighlightSettings";
import { NumberResultSettings } from "@app/settings/properties/NumberResultSettings";
import { PercentageArithmeticProviderSettings } from "@app/settings/properties/PercentageArithmeticProviderSettings";
import { PercentageResultSettings } from "@app/settings/properties/PercentageResultSettings";
import { UnitOfMeasurementProviderSettings } from "@app/settings/properties/UnitOfMeasurementProviderSettings";
import { UnitOfMeasurementResultSettings } from "@app/settings/properties/UnitOfMeasurementResultSettings";
import { VariableSettings } from "@app/settings/properties/VariableSettings";
import { VectorArithmeticProviderSettings } from "@app/settings/properties/VectorArithmeticProviderSettings";

/**
 * Singleton holder for plugin settings with typed section proxies.
 *
 * Each property (e.g., `engine`, `interface`) is a typed proxy class that
 * reads from `this.settings` and provides backward-compatible fallbacks
 * for users whose saved data predates newer config sections.
 */
export default class UserSettings {
	private static instance: UserSettings | null = null;
	public settings: IPluginSettings;

	public readonly engine: EngineSettings;
	public readonly interface: InterfaceSettings;
	public readonly syntaxHighlight: SyntaxHighlightSettings;
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
		this.syntaxHighlight = new SyntaxHighlightSettings(this);
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
