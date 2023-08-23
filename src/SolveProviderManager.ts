import { ISolveProvider } from "@/providers/ISolveProvider";
import { BasicArithmeticProvider } from "@/providers/arithmetic/basic/BasicArithmeticProvider";
import { FunctionArithmeticProvider } from "@/providers/arithmetic/function/FunctionArithmeticProvider";
import { VectorArithmeticProvider } from "@/providers/arithmetic/vector/VectorArithmeticProvider";
import { DatetimeProvider } from "@/providers/datetime/DatetimeProvider";
import { fastHash } from "@/utilities/FastHash";

class SolveProviderManager {
	private providersMap: Map<number, ISolveProvider>;
	private _debugMode = false;

	constructor() {
		this.providersMap = new Map();
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
				const result = provider.provide(sentence, raw);

				if (result !== undefined) {
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
		this.registerProvider(new BasicArithmeticProvider());
		this.registerProvider(new FunctionArithmeticProvider());
		this.registerProvider(new VectorArithmeticProvider());
	}
}

export const solveProviderManager = new SolveProviderManager();
