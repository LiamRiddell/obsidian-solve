import { IArithmeticProviderSettings } from "@/settings/definition/IArithmeticProviderSettings";
import { IDatetimeProviderSettings } from "@/settings/definition/IDatetimeProviderSettings";
import { IDatetimeResultSettings } from "@/settings/definition/IDatetimeResultSettings";
import { IFloatResultSettings } from "@/settings/definition/IFloatResultSettings";
import { IHexResultSettings } from "@/settings/definition/IHexResultSettings";
import { IIntegerResultSettings } from "@/settings/definition/IIntegerResultSettings";
import { IInterfaceSettings } from "@/settings/definition/IInterfaceSettings";
import { IPercentageResultSettings } from "@/settings/definition/IPercentageResultSettings";

export interface IPluginSettings {
	interface: IInterfaceSettings;

	// Providers
	arithmeticProvider: IArithmeticProviderSettings;
	datetimeProvider: IDatetimeProviderSettings;

	// Results
	integerResult: IIntegerResultSettings;
	floatResult: IFloatResultSettings;
	percentageResult: IPercentageResultSettings;
	datetimeResult: IDatetimeResultSettings;
	hexResult: IHexResultSettings;
}