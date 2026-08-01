/**
 * LFU (Least Frequently Used) Cache implementation
 * 
 * A cache that evicts the least frequently used items when capacity is reached.
 * Frequency is tracked by counting how many times each item is accessed.
 */

export class LFUCache<T = string> {	private cache: Map<string, { value: T; frequency: number }> = new Map();

	constructor(private maxSize: number = 1000) {}

  /**
   * Get a value from the cache and update its frequency
   * @param key The key to retrieve
   * @returns The cached value or null if not found
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Update frequency
    entry.frequency++;
    return entry.value;
  }

  /**
   * Store a value in the cache
   * @param key The key to store
   * @param value The value to store
   */
  put(key: string, value: T): void {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.value = value;
      entry.frequency++;
      return;
    }

    // If cache is at max capacity, evict least frequently used
    if (this.cache.size >= this.maxSize) {
      this.evictLeastFrequent();
    }		this.cache.set(key, { value, frequency: 1 });
	}

	/**
   * Check if a key exists in the cache
   * @param key The key to check
   * @returns true if the key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get the frequency of a cached item
   * @param key The key to check
   * @returns The frequency count
   */
  getFrequency(key: string): number {
    const entry = this.cache.get(key);
    return entry ? entry.frequency : 0;
  }

  /**
   * Clear all items from the cache
   */	clear(): void {
		this.cache.clear();	}

	/**
   * Evict the least frequently used item from the cache
   */
  private evictLeastFrequent(): void {
    let leastFrequentKey: string | null = null;
    let minFreq = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.frequency < minFreq) {
        minFreq = entry.frequency;
        leastFrequentKey = key;
      }
    }

    if (leastFrequentKey) {
      this.cache.delete(leastFrequentKey);
    }
  }
}

export default LFUCache;
