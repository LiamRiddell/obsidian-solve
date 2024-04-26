import { GlobalResultCache } from "@/cache/ResultCache";
import { IProvider } from "@/providers/IProvider";
import { BasicArithmeticProvider } from "@/providers/arithmetic/BasicArithmeticProvider";
import { DatetimeProvider } from "@/providers/datetime/DatetimeProvider";
import { DiceProvider } from "@/providers/dice/DiceProvider";
import { FunctionArithmeticProvider } from "@/providers/function/FunctionArithmeticProvider";
import { PercentageArithmeticProvider } from "@/providers/percentage/PercentageArithmeticProvider";
import { UnitsOfMeasurementProvider } from "@/providers/uom/UnitsOfMeasurementProvider";
import { VectorArithmeticProvider } from "@/providers/vector/VectorArithmeticProvider";
import { AnyResult } from "@/results/AnyResult";
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

	public provideFirst(
		expression: string
	): [IProvider, AnyResult] | undefined {
		const cachedProviderResultTuple = GlobalResultCache.get(expression);

		if (cachedProviderResultTuple) {
			return cachedProviderResultTuple;
		}

		for (const [, provider] of this.providersMap) {
			try {
				// Skip providers that are not enabled
				if (!provider.enabled()) {
					continue;
				}

				const result = provider.provide<AnyResult>(expression);

				if (result === undefined) {
					continue;
				}

				if (provider.cacheable) {
					// Setting the cache returns the tuple back for simplicity.
					return GlobalResultCache.set(expression, [
						provider,
						result,
					]);
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
		this.registerProvider(new DatetimeProvider());
		this.registerProvider(new BasicArithmeticProvider());
		this.registerProvider(new PercentageArithmeticProvider());
		this.registerProvider(new UnitsOfMeasurementProvider());
		this.registerProvider(new FunctionArithmeticProvider());
		this.registerProvider(new VectorArithmeticProvider());
		this.registerProvider(new DiceProvider());
	}
}

export const solveProviderManager = new ProviderManager();
