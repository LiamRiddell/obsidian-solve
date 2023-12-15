import { IArithmeticProviderSettings } from "@/settings/definition/IArithmeticProviderSettings";
import { IDatetimeProviderSettings } from "@/settings/definition/IDatetimeProviderSettings";
import { IDatetimeResultSettings } from "@/settings/definition/IDatetimeResultSettings";
import { IDiceProviderSettings } from "@/settings/definition/IDiceProviderSettings";
import { IEngineSettings } from "@/settings/definition/IEngineSettings";
import { IFloatResultSettings } from "@/settings/definition/IFloatResultSettings";
import { IFunctionArithmeticProviderSettings } from "@/settings/definition/IFuntionArithmeticProviderSettings";
import { IHexResultSettings } from "@/settings/definition/IHexResultSettings";
import { IIntegerResultSettings } from "@/settings/definition/IIntegerResultSettings";
import { IInterfaceSettings } from "@/settings/definition/IInterfaceSettings";
import { IPercentageProviderSettings } from "@/settings/definition/IPercentageArithmeticProviderSettings";
import { IPercentageResultSettings } from "@/settings/definition/IPercentageResultSettings";
import { IUnitOfMeasurementProviderSettings } from "@/settings/definition/IUnitOfMeasurementProviderSettings";
import { IUnitOfMeasurementResultSettings } from "@/settings/definition/IUnitOfMeasurementResultSettings";
import { IVariableSettings } from "@/settings/definition/IVariableSettings";
import { IVectorArithmeticProviderSettings } from "@/settings/definition/IVectorArithmeticProviderSettings";

export interface IPluginSettings {
	engine: IEngineSettings;
	interface: IInterfaceSettings;
	variable: IVariableSettings;

	// Providers
	arithmeticProvider: IArithmeticProviderSettings;
	functionArithmeticProvider: IFunctionArithmeticProviderSettings;
	vectorArithmeticProvider: IVectorArithmeticProviderSettings;
	percentageArithmeticProvider: IPercentageProviderSettings;
	datetimeProvider: IDatetimeProviderSettings;
	unitOfMeasurementProvider: IUnitOfMeasurementProviderSettings;
	diceProvider: IDiceProviderSettings;

	// Results
	integerResult: IIntegerResultSettings;
	floatResult: IFloatResultSettings;
	percentageResult: IPercentageResultSettings;
	datetimeResult: IDatetimeResultSettings;
	hexResult: IHexResultSettings;
	unitOfMeasurementResult: IUnitOfMeasurementResultSettings;
}
