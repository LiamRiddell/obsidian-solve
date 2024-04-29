export class LFUCache<K, V> {
	private capacity: number;
	private cache: Map<K, { value: V; frequency: number; order: number }>;
	private frequencies: Map<number, Set<K>>;
	private minFrequency: number;
	private order: number;

	constructor(capacity: number) {
		this.capacity = capacity;
		this.cache = new Map();
		this.frequencies = new Map();
		this.minFrequency = 0;
		this.order = 0;
	}

	private updateFrequency(key: K): void {
		const item = this.cache.get(key);

		if (!item) return;

		const oldFreq = item.frequency;

		item.frequency++;
		item.order = this.order++;

		const oldSet = this.frequencies.get(oldFreq);
		oldSet?.delete(key);

		if (oldSet && oldSet.size === 0) {
			this.frequencies.delete(oldFreq);

			if (oldFreq === this.minFrequency) {
				this.minFrequency++;
			}
		}

		let newSet = this.frequencies.get(item.frequency);

		if (!newSet) {
			newSet = new Set();
			this.frequencies.set(item.frequency, newSet);
		}

		newSet.add(key);
	}

	public get(key: K): V | undefined {
		const item = this.cache.get(key);

		if (item) {
			this.updateFrequency(key);
			return item.value;
		}

		return undefined;
	}

	public set(key: K, value: V): void {
		const item = this.cache.get(key);

		if (item) {
			item.value = value;
			this.updateFrequency(key);
			return;
		}

		if (this.cache.size === this.capacity) {
			const leastUsedSet = this.frequencies.get(this.minFrequency);

			if (leastUsedSet) {
				let oldestKey = null;
				let oldestOrder = Infinity;

				for (const k of leastUsedSet) {
					const order = this.cache.get(k)?.order ?? Infinity;

					if (order < oldestOrder) {
						oldestOrder = order;
						oldestKey = k;
					}
				}

				if (oldestKey) {
					leastUsedSet.delete(oldestKey);
					this.cache.delete(oldestKey);
				}
			}
		}

		this.cache.set(key, { value, frequency: 1, order: this.order++ });
		this.minFrequency = 1;

		let freqSet = this.frequencies.get(1);

		if (!freqSet) {
			freqSet = new Set();
			this.frequencies.set(1, freqSet);
		}

		freqSet.add(key);
	}

	public clear(): void {
		this.cache.clear();
		this.frequencies.clear();
		this.minFrequency = 0;
		this.order = 0;
	}
}
