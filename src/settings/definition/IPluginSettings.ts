import { IArithmeticProviderSettings } from "@/settings/definition/IArithmeticProviderSettings";
import { IDatetimeProviderSettings } from "@/settings/definition/IDatetimeProviderSettings";
import { IDatetimeResultSettings } from "@/settings/definition/IDatetimeResultSettings";
import { IEngineSettings } from "@/settings/definition/IEngineSettings";
import { IFloatResultSettings } from "@/settings/definition/IFloatResultSettings";
import { IHexResultSettings } from "@/settings/definition/IHexResultSettings";
import { IIntegerResultSettings } from "@/settings/definition/IIntegerResultSettings";
import { IInterfaceSettings } from "@/settings/definition/IInterfaceSettings";
import { IPercentageResultSettings } from "@/settings/definition/IPercentageResultSettings";
import { IUnitOfMeasurementResultSettings } from "@/settings/definition/IUnitOfMeasurementResultSettings";

export interface IPluginSettings {
	engine: IEngineSettings;
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
	unitOfMeasurementResult: IUnitOfMeasurementResultSettings;
}
