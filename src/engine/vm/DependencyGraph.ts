export class DependencyGraph {
  private consumers: Map<string, Set<number>> = new Map();
  private dependencies: Map<number, Set<string>> = new Map();
  private writes: Map<number, Set<string>> = new Map();

  registerLine(lineNumber: number, reads: string[], writes: string[]): void {
    for (const dep of reads) {
      if (!this.consumers.has(dep)) this.consumers.set(dep, new Set());
      this.consumers.get(dep)!.add(lineNumber);
    }
    if (writes.length > 0) {
      this.dependencies.set(lineNumber, new Set(reads));
      this.writes.set(lineNumber, new Set(writes));
      for (const write of writes) {
        const prevConsumer = this.consumers.get(write);
        if (prevConsumer) prevConsumer.delete(lineNumber);
      }
    }
  }

  getAffectedLines(changedVariable: string): Set<number> {
    const visited = new Set<number>();
    const queue = [changedVariable];
    while (queue.length > 0) {
      const varName = queue.pop()!;
      const consumers = this.consumers.get(varName);
      if (!consumers) continue;
      for (const line of consumers) {
        if (visited.has(line)) continue;
        visited.add(line);
        const lineWrites = this.writes.get(line);
        if (lineWrites) {
          for (const writtenVar of lineWrites) {
            queue.push(writtenVar);
          }
        }
      }
    }
    return visited;
  }

  removeLine(lineNumber: number): void {
    this.dependencies.delete(lineNumber);
    this.writes.delete(lineNumber);
    for (const [, consumers] of this.consumers) {
      consumers.delete(lineNumber);
    }
  }

  getConsumers(variable: string): Set<number> {
    return this.consumers.get(variable) ?? new Set();
  }

  getDependencies(lineNumber: number): Set<string> {
    return this.dependencies.get(lineNumber) ?? new Set();
  }

  getWrites(lineNumber: number): Set<string> {
    return this.writes.get(lineNumber) ?? new Set();
  }

  clear(): void {
    this.consumers.clear();
    this.dependencies.clear();
    this.writes.clear();
  }
}