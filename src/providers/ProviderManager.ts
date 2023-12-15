import { IProvider } from "@/providers/IProvider";
import { BasicArithmeticProvider } from "@/providers/arithmetic/BasicArithmeticProvider";
import { DatetimeProvider } from "@/providers/datetime/DatetimeProvider";
import { DiceProvider } from "@/providers/dice/DiceProvider";
import { FunctionArithmeticProvider } from "@/providers/function/FunctionArithmeticProvider";
import { PercentageArithmeticProvider } from "@/providers/percentage/PercentageArithmeticProvider";
import { UnitsOfMeasurementProvider } from "@/providers/uom/UnitsOfMeasurementProvider";
import { VectorArithmeticProvider } from "@/providers/vector/VectorArithmeticProvider";
import UserSettings from "@/settings/UserSettings";
import { fastHash } from "@/utilities/FastHash";
import { logger } from "@/utilities/Logger";

class ProviderManager {
	private _debugMode = false;
	private providersMap: Map<number, IProvider>;
	private settings: UserSettings;

	constructor() {
		this.providersMap = new Map();
		this.settings = UserSettings.getInstance();
		this.registerCoreProviders();
	}

	public registerProvider(provider: IProvider) {
		this.providersMap.set(fastHash(provider.name), provider);
	}

	public provideFirst<T>(expression: string): [IProvider, T] | undefined {
		for (const [, provider] of this.providersMap) {
			try {
				// Skip providers that are not enabled
				if (!provider.enabled()) {
					continue;
				}

				const result = provider.provide<T>(expression);

				if (result === undefined) {
					continue;
				}

				return [provider, result];
			} catch (error) {
				logger.error(error);
				continue;
			}
		}

		return undefined;
	}

	private registerCoreProviders() {
		// Order of precedence
		this.registerProvider(new BasicArithmeticProvider());
		this.registerProvider(new PercentageArithmeticProvider());
		this.registerProvider(new UnitsOfMeasurementProvider());
		this.registerProvider(new DatetimeProvider());
		this.registerProvider(new FunctionArithmeticProvider());
		this.registerProvider(new VectorArithmeticProvider());
		this.registerProvider(new DiceProvider());
	}
}

export const solveProviderManager = new ProviderManager();
