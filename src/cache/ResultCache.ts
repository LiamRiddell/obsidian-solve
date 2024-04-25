import { LFUCache } from "@/cache/strategy/LFUCache";
import { IProvider } from "@/providers/IProvider";
import { AnyResult } from "@/results/AnyResult";
import { fastHash } from "@/utilities/FastHash";

export class ResultCache {
	private lfuCache: LFUCache<number, [IProvider, AnyResult]>;

	constructor(capacity: number) {
		this.lfuCache = new LFUCache<number, [IProvider, AnyResult]>(capacity);
	}

	get(expression: string): [IProvider, AnyResult] | undefined {
		const hashedKey = fastHash(expression);
		return this.lfuCache.get(hashedKey);
	}

	set(
		expression: string,
		value: [IProvider, AnyResult]
	): [IProvider, AnyResult] {
		const hashedKey = fastHash(expression);

		this.lfuCache.set(hashedKey, value);

		return value;
	}

	clear() {
		this.lfuCache.clear();
	}
}

export const GlobalResultCache = new ResultCache(200);
