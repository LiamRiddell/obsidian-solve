import { ISolveProvider } from "@/providers/ISolveProvider";
import { BasicArithmeticProvider } from "@/providers/arithmetic/basic/BasicArithmeticProvider";
import { FunctionArithmeticProvider } from "@/providers/arithmetic/function/FunctionArithmeticProvider";
import { PercentageArithmeticProvider } from "@/providers/arithmetic/percentage/PercentageArithmeticProvider";
import { VectorArithmeticProvider } from "@/providers/arithmetic/vector/VectorArithmeticProvider";
import { DatetimeProvider } from "@/providers/datetime/DatetimeProvider";
import UserSettings from "@/settings/UserSettings";
import { fastHash } from "@/utilities/FastHash";

class SolveProviderManager {
	private providersMap: Map<number, ISolveProvider>;
	private _debugMode = false;
	private settings: UserSettings;

	constructor() {
		this.providersMap = new Map();
		this.settings = UserSettings.getInstance();
		this.registerCoreProviders();
	}

	public registerProvider(provider: ISolveProvider) {
		this.providersMap.set(fastHash(provider.name), provider);
	}

	public provideFirst(
		sentence: string,
		raw: boolean = false
	): string | undefined {
		for (const [, provider] of this.providersMap) {
			try {
				let result = provider.provide(sentence, raw);

				if (result !== undefined) {
					if (raw) {
						return result;
					}

					if (this.settings.renderEqualsBeforeResult) {
						result = `= ${result}`;
					}

					return this._debugMode
						? `${result} [${provider.name}]`
						: `${result}`;
				}
			} catch (error) {
				// console.error(error);
				continue;
			}
		}

		return undefined;
	}

	private registerCoreProviders() {
		// Order of precedence
		this.registerProvider(new DatetimeProvider());
		this.registerProvider(new PercentageArithmeticProvider());
		this.registerProvider(new BasicArithmeticProvider());
		this.registerProvider(new FunctionArithmeticProvider());
		this.registerProvider(new VectorArithmeticProvider());
	}
}

export const solveProviderManager = new SolveProviderManager();
