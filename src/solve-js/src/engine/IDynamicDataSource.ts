export interface IDynamicDataSource {
  name: string;
  refreshIntervalMs: number;
  fetch(symbol: string): Promise<number | string>;
}
