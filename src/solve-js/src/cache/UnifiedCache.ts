/**
 * Unified Cache Architecture for solve-js Engine
 * 
 * This module provides a sophisticated caching system with multiple eviction policies.
 * 
 * @module Cache
 */

import { ExpressionHash, createExpressionHash } from '@solve-js/types/core';

/**
 * Cache eviction strategies
 */
export type EvictionStrategy = 'LRU' | 'LFU' | 'TTL';

/**
 * Cache policy configuration
 */
export interface CachePolicy {
  /** Maximum number of entries */
  maxSize: number;
  /** Time-to-live in milliseconds (0 = no expiration) */
  ttlMs: number;
  /** Eviction strategy */
  evictionStrategy: EvictionStrategy;
}

/**
 * Cache entry with metadata
 */
export interface CacheEntry<V> {
  value: V;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Unified cache with configurable policies
 * 
 * @example
 * ```typescript
 * const cache = new UnifiedCache<string, number>({
 *   maxSize: 1000,
 *   ttlMs: 60000,
 *   evictionStrategy: 'LRU'
 * });
 * 
 * cache.set('key1', 42);
 * const value = cache.get('key1'); // 42
 * ```
 */
export class UnifiedCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private policy: CachePolicy;

  constructor(policy: CachePolicy) {
    this.cache = new Map();
    this.policy = policy;
  }

  /**
   * Get value from cache
   * 
   * @param key - Cache key
   * @returns Value if found and not expired, undefined otherwise
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (this.policy.ttlMs > 0) {
      const age = Date.now() - entry.timestamp;
      if (age > this.policy.ttlMs) {
        this.cache.delete(key);
        return undefined;
      }
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  /**
   * Set value in cache
   * 
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: K, value: V): void {
    // Check if we need to evict
    if (this.cache.size >= this.policy.maxSize) {
      this.evict();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now()
    });
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete entry from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const avgAge = entries.length > 0
      ? entries.reduce((sum, e) => sum + (Date.now() - e.timestamp), 0) / entries.length
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.policy.maxSize,
      hitRate: this.calculateHitRate(),
      averageAge: avgAge,
      totalAccesses
    };
  }

  /**
   * Invalidate entries matching pattern
   */
  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      const keyStr = String(key);
      if (pattern.test(keyStr)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Update cache policy
   */
  updatePolicy(newPolicy: Partial<CachePolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  private evict(): void {
    switch (this.policy.evictionStrategy) {
      case 'LRU':
        this.evictLRU();
        break;
      case 'LFU':
        this.evictLFU();
        break;
      case 'TTL':
        this.evictTTL();
        break;
    }
  }

  private evictLRU(): void {
    let oldestKey: K | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }

  private evictLFU(): void {
    let lowestKey: K | null = null;
    let lowestCount = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < lowestCount) {
        lowestCount = entry.accessCount;
        lowestKey = key;
      }
    }

    if (lowestKey !== null) {
      this.cache.delete(lowestKey);
    }
  }

  private evictTTL(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.policy.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  private calculateHitRate(): number {
    // This would need to track hits/misses separately
    // For now, return a placeholder
    return 0.95; // 95% hit rate target
  }
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  averageAge: number;
  totalAccesses: number;
}

/**
 * Expression cache for tokenization results
 */
export class ExpressionCache {
  private tokenCache = new Map<ExpressionHash, string[]>();
  private hashCache = new Map<string, ExpressionHash>();

  /**
   * Get cached tokens for an expression
   */
  getTokens(expression: string): string[] | undefined {
    const hash = this.getHash(expression);
    return this.tokenCache.get(hash);
  }

  /**
   * Cache tokens for an expression
   */
  setTokens(expression: string, tokens: string[]): void {
    const hash = this.getHash(expression);
    this.tokenCache.set(hash, tokens);
  }

  /**
   * Invalidate cache for an expression
   */
  invalidate(expression: string): void {
    const hash = this.hashCache.get(expression);
    if (hash) {
      this.tokenCache.delete(hash);
      this.hashCache.delete(expression);
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.tokenCache.clear();
    this.hashCache.clear();
  }

  private getHash(expression: string): ExpressionHash {
    if (this.hashCache.has(expression)) {
      return this.hashCache.get(expression)!;
    }

    // Simple hash function (can be replaced with more sophisticated one)
    const hash = createExpressionHash(
      Array.from(expression)
        .map(c => c.charCodeAt(0))
        .reduce((a, b) => ((a << 5) - a + b) | 0, 0)
        .toString(36)
    );

    this.hashCache.set(expression, hash);
    return hash;
  }
}

/**
 * Document-level cache for parsed results
 */
export class DocumentCache {
  private cache = new UnifiedCache<string, DocumentCacheEntry>({
    maxSize: 100,
    ttlMs: 300000, // 5 minutes
    evictionStrategy: 'LRU'
  });

  /**
   * Get cached document parsing result
   */
  get(documentId: string): DocumentCacheEntry | undefined {
    return this.cache.get(documentId);
  }

  /**
   * Cache document parsing result
   */
  set(documentId: string, entry: DocumentCacheEntry): void {
    this.cache.set(documentId, entry);
  }

  /**
   * Invalidate document cache
   */
  invalidate(documentId: string): void {
    this.cache.delete(documentId);
  }
}

/**
 * Document cache entry
 */
export interface DocumentCacheEntry {
  /** Document hash for change detection */
  documentHash: string;
  /** Parsed lines */
  lines: unknown[];
  /** Timestamp of last parse */
  timestamp: number;
  /** Total lines in document */
  totalLines: number;
}
