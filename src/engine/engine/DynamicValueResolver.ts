import { IDynamicDataSource } from "@/engine/engine/IDynamicDataSource";
import { DependencyGraph } from "@/engine/vm/DependencyGraph";
import { LineCache } from "@/engine/cache/LineCache";

export interface PendingUpdate {
  variable: string;
  newValue: number | string;
}

export class DynamicValueResolver {
  private sources: Map<string, IDynamicDataSource> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private pendingUpdates: PendingUpdate[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  constructor(
    private dag: DependencyGraph,
    private lineCache: LineCache,
    private onBatch: (lines: Set<number>) => void,
    private batchIntervalMs = 100
  ) {}

  registerSource(source: IDynamicDataSource): void {
    this.sources.set(source.name, source);
  }

  unregisterSource(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    this.sources.delete(name);
  }

  subscribe(symbol: string, sourceName: string): void {
    const source = this.sources.get(sourceName);
    if (!source) return;

    const existing = this.timers.get(symbol);
    if (existing) clearInterval(existing);

    const timer = setInterval(async () => {
      if (this.paused) return;
      try {
        const newValue = await source.fetch(symbol);
        this.enqueueUpdate(symbol, newValue);
      } catch {
        // fetch failed, skip this tick
      }
    }, source.refreshIntervalMs);

    this.timers.set(symbol, timer);
  }

  unsubscribe(symbol: string): void {
    const timer = this.timers.get(symbol);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(symbol);
    }
  }

  private enqueueUpdate(variable: string, newValue: number | string): void {
    this.pendingUpdates.push({ variable, newValue });
    this.scheduleBatch();
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.flushBatch();
    }, this.batchIntervalMs);
  }

  flushBatch(): void {
    if (this.pendingUpdates.length === 0) return;

    const mergedLines = new Set<number>();
    for (const update of this.pendingUpdates) {
      const affected = this.dag.getAffectedLines(update.variable);
      for (const line of affected) {
        mergedLines.add(line);
      }
    }
    this.pendingUpdates = [];

    for (const line of mergedLines) {
      this.lineCache.markDirty(line);
    }

    this.onBatch(mergedLines);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  clear(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.sources.clear();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.pendingUpdates = [];
  }
}