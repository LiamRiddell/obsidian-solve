export interface OsrsItem {
  id: number;
  name: string;
  nameLower: string;
}

export interface OsrsPrice {
  high: number;
  low: number;
  highTime: number;
  lowTime: number;
}

export interface OsrsApiResponse {
  data: Record<string, OsrsPrice>;
}

export function midPrice(price: OsrsPrice): number {
  if (!price.low || price.low <= 0) return price.high;
  return Math.round((price.high + price.low) / 2);
}
