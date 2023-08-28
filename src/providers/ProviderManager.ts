import { IProvider } from "@/providers/IProvider";
import { BasicArithmeticProvider } from "@/providers/arithmetic/BasicArithmeticProvider";
import { DatetimeProvider } from "@/providers/datetime/DatetimeProvider";
import { FunctionArithmeticProvider } from "@/providers/function/FunctionArithmeticProvider";
import { PercentageArithmeticProvider } from "@/providers/percentage/PercentageArithmeticProvider";
import { VectorArithmeticProvider } from "@/providers/vector/VectorArithmeticProvider";
import UserSettings from "@/settings/UserSettings";
import { fastHash } from "@/utilities/FastHash";

class ProviderManager {
	private providersMap: Map<number, IProvider>;
	private _debugMode = false;
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

export const solveProviderManager = new ProviderManager();
