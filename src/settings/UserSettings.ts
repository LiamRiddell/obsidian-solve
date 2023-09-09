import { DEFAULT_SETTINGS } from "@/settings/PluginSettings";
import { IPluginSettings } from "@/settings/definition/IPluginSettings";
import { ArithmeticProviderSettings } from "@/settings/properties/ArithmeticProviderSettings";
import { DatetimeProviderSettings } from "@/settings/properties/DatetimeProviderSettings";
import { DatetimeResultSettings } from "@/settings/properties/DatetimeResultSettings";
import { FloatResultSettings } from "@/settings/properties/FloatResultSettings";
import { HexResultSettings } from "@/settings/properties/HexResultSettings";
import { IntegerResultSettings } from "@/settings/properties/IntegerResultSettings";
import { InterfaceSettings } from "@/settings/properties/InterfaceSettings";
import { PercentageResultSettings } from "@/settings/properties/PercentageResultSettings";

export default class UserSettings {
	private static instance: UserSettings | null = null;
	public settings: IPluginSettings;

	public readonly interface: InterfaceSettings;

	// Provider Settings
	public readonly arithmeticProvider: ArithmeticProviderSettings;
	public readonly datetimeProvider: DatetimeProviderSettings;

	// Result Settings
	public readonly integerResult: IntegerResultSettings;
	public readonly floatResult: FloatResultSettings;
	public readonly percentageResult: PercentageResultSettings;
	public readonly datetimeResult: DatetimeResultSettings;
	public readonly hexResult: HexResultSettings;

	private constructor() {
		this.settings = DEFAULT_SETTINGS;
		this.interface = new InterfaceSettings(this);
		this.arithmeticProvider = new ArithmeticProviderSettings(this);
		this.datetimeProvider = new DatetimeProviderSettings(this);
		this.integerResult = new IntegerResultSettings(this);
		this.floatResult = new FloatResultSettings(this);
		this.percentageResult = new PercentageResultSettings(this);
		this.datetimeResult = new DatetimeResultSettings(this);
		this.hexResult = new HexResultSettings(this);
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
