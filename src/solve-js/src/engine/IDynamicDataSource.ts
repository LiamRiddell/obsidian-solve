/**
 * Contract for a dynamic data source that pushes real-time variable updates.
 *
 * Used by {@link DynamicValueResolver} to poll external data providers at
 * a configurable interval. Each call to `fetch()` should return the current
 * value for the given symbol.
 *
 * @example
 * ```typescript
 * const stockSource: IDynamicDataSource = {
 *   name: "StockTicker",
 *   refreshIntervalMs: 5000,
 *   fetch: async (symbol) => {
 *     const response = await fetch(`https://api.example.com/stocks/${symbol}`);
 *     const data = await response.json();
 *     return data.price;
 *   },
 * };
 * ```
 */
export interface IDynamicDataSource {
  name: string;
  refreshIntervalMs: number;
  fetch(symbol: string): Promise<number | string>;
}
