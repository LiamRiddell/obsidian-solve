import { IArithmeticProviderSettings } from "@app/settings/definition/IArithmeticProviderSettings";
import { IBigIntegerArithmeticProviderSettings } from "@app/settings/definition/IBigIntegerArithmeticProviderSettings";
import { IDatetimeProviderSettings } from "@app/settings/definition/IDatetimeProviderSettings";
import { IDiceProviderSettings } from "@app/settings/definition/IDiceProviderSettings";
import { IEngineSettings } from "@app/settings/definition/IEngineSettings";
import { IFloatResultSettings } from "@app/settings/definition/IFloatResultSettings";
import { IFunctionArithmeticProviderSettings } from "@app/settings/definition/IFuntionArithmeticProviderSettings";
import { IHexResultSettings } from "@app/settings/definition/IHexResultSettings";
import { IInlineSolveSettings } from "@app/settings/definition/IInlineSolveSettings";
import { IInterfaceSettings } from "@app/settings/definition/IInterfaceSettings";
import { ISyntaxHighlightSettings } from "@app/settings/definition/ISyntaxHighlightSettings";
import { ICompletionSettings } from "@app/settings/definition/ICompletionSettings";
import { INumberResultSettings } from "@app/settings/definition/INumberResultSettings";
import { IPercentageProviderSettings } from "@app/settings/definition/IPercentageArithmeticProviderSettings";
import { IPercentageResultSettings } from "@app/settings/definition/IPercentageResultSettings";
import { IUnitOfMeasurementProviderSettings } from "@app/settings/definition/IUnitOfMeasurementProviderSettings";
import { IUnitOfMeasurementResultSettings } from "@app/settings/definition/IUnitOfMeasurementResultSettings";
import { IVariableSettings } from "@app/settings/definition/IVariableSettings";
import { IVectorArithmeticProviderSettings } from "@app/settings/definition/IVectorArithmeticProviderSettings";

export interface IPluginSettings {
	engine: IEngineSettings;
	interface: IInterfaceSettings;
	syntaxHighlight: ISyntaxHighlightSettings;
	completions: ICompletionSettings;
	inlineSolve: IInlineSolveSettings;
	variable: IVariableSettings;

	// Providers
	arithmeticProvider: IArithmeticProviderSettings;
	functionArithmeticProvider: IFunctionArithmeticProviderSettings;
	vectorArithmeticProvider: IVectorArithmeticProviderSettings;
	percentageArithmeticProvider: IPercentageProviderSettings;
	datetimeProvider: IDatetimeProviderSettings;
	unitOfMeasurementProvider: IUnitOfMeasurementProviderSettings;
	diceProvider: IDiceProviderSettings;
	bigIntegerArithmeticProvider: IBigIntegerArithmeticProviderSettings;

	// Results
	numberResult: INumberResultSettings;
	floatResult: IFloatResultSettings;
	percentageResult: IPercentageResultSettings;
	hexResult: IHexResultSettings;
	unitOfMeasurementResult: IUnitOfMeasurementResultSettings;
}
