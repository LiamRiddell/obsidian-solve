import { Value } from "@solve-js/vm/Value";

function fastHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export class MemoCache {
  private cache: Map<number, { result: Value; epoch: number }> = new Map();
  private epoch = 0;

  getOrCompute(expr: string, line: number, compute: () => Value): Value {
    const hash = fastHash(expr + line);
    const existing = this.cache.get(hash);
    if (existing && existing.epoch === this.epoch) return existing.result;
    const result = compute();
    this.cache.set(hash, { result, epoch: this.epoch });
    return result;
  }

  invalidateAll(): void {
    this.epoch++;
  }

  invalidate(variable: string): void {
    this.epoch++;
  }

  clear(): void {
    this.cache.clear();
    this.epoch = 0;
  }
}
