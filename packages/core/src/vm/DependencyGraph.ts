/** Serialized snapshot of the dependency graph for diagnostic rendering. */
export interface DagSnapshot {
  consumers: Record<string, number[]>;
  writes: Record<number, string[]>;
  reads: Record<number, string[]>;
  dataSourceDeps: Record<number, string[]>;
  dataSourceConsumers: Record<string, number[]>;
}

/**
 * Dependency graph for variable and data-source tracking across document lines.
 *
 * Tracks which lines read/write which variables, and propagates changes through
 * the graph when a variable is modified. Supports:
 * - Variable dependency tracking (registerLine, getAffectedLines)
 * - Data-source dependency tracking (registerLineDataSourceDependency)
 * - Topological ordering of affected lines (getAffectedLinesInOrder)
 * - Efficient removal of deleted lines (removeLine)
 */
export class DependencyGraph {
   private consumers: Map<string, Set<number>> = new Map();
   private dependencies: Map<number, Set<string>> = new Map();
   private writes: Map<number, Set<string>> = new Map();
   private lineReads: Map<number, Set<string>> = new Map();

   // Data source dependencies: line number -> Set of query keys
   private dataSourceDependencies: Map<number, Set<string>> = new Map();
   // Reverse map: query key -> Set of line numbers
   private dataSourceConsumers: Map<string, Set<number>> = new Map();

  /**
   * Register a line's variable reads and writes in the dependency graph.
   *
   * If re-registering the same line (e.g., after editing), old consumer
   * references are cleaned up first. Write-variables are removed from
   * the consumer set so that redefinition breaks the old dependency chain.
   *
   * @param lineNumber - 1-based line number in the document
   * @param reads - Variable names this line reads
   * @param writes - Variable names this line writes (assigns to)
   */
   registerLine(lineNumber: number, reads: string[], writes: string[]): void {
     // Clean up old consumer references if re-registering this line
     const oldReads = this.lineReads.get(lineNumber);
     if (oldReads) {
       for (const oldRead of oldReads) {
         const consumers = this.consumers.get(oldRead);
         if (consumers) consumers.delete(lineNumber);
       }
     }

     // Track what this line reads
     this.lineReads.set(lineNumber, new Set(reads));

     // Add new consumer references
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

  /**
   * Register a line's dependency on an external data source (e.g., currency rate, OSRS GE price).
   *
   * When the data source updates, {@link getAffectedLinesByDataSource} returns all lines
   * that depend on this data, enabling targeted re-evaluation.
   *
   * @param lineNumber - 1-based line number in the document
   * @param dataSourceId - Unique identifier for the data source (e.g., "currency", "osrs-ge")
   * @param queryKey - Query key array identifying the specific data (e.g., ["USD", "EUR"])
   */
  registerLineDataSourceDependency(lineNumber: number, dataSourceId: string, queryKey: string[]): void {
    const queryKeyStr = JSON.stringify(queryKey);
    const key = `${dataSourceId}:${queryKeyStr}`;
    
    if (!this.dataSourceDependencies.has(lineNumber)) {
      this.dataSourceDependencies.set(lineNumber, new Set());
    }
    this.dataSourceDependencies.get(lineNumber)!.add(key);
    
    if (!this.dataSourceConsumers.has(key)) {
      this.dataSourceConsumers.set(key, new Set());
    }
    this.dataSourceConsumers.get(key)!.add(lineNumber);
  }

  /**
   * Find all lines affected by a changed variable via BFS through the consumer graph.
   *
   * When a variable is modified (e.g., `:x = 5` changes to `:x = 10`), this returns
   * all lines that transitively depend on it — lines that read `x`, lines that read
   * variables written by those lines, and so on.
   *
   * @param changedVariable - The variable name that changed
   * @returns Set of line numbers that need re-evaluation
   */
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

  /**
   * Phase 1.4 DAG-walk optimization: return affected lines in dependency-safe
   * topological order. Uses Kahn's algorithm (BFS-based) to ensure every line
   * is evaluated AFTER all lines it depends on have been processed.
   *
   * This is more correct than ascending line-number sort, which fails when
   * variable definitions and their consumers are not in document order.
   *
   * @returns Line numbers in topological order (producers before consumers).
   */
  getAffectedLinesInOrder(startVariable: string): number[] {
    const affected = this.getAffectedLines(startVariable);
    if (affected.size === 0) return [];

    // Build a local subgraph: for each affected line, compute in-degree
    // (how many other affected lines produce variables it reads).
    const inDegree = new Map<number, number>();
    const adjacency = new Map<number, number[]>(); // line → downstream lines

    for (const line of affected) {
      if (!inDegree.has(line)) inDegree.set(line, 0);
      if (!adjacency.has(line)) adjacency.set(line, []);
    }

    // Build a variable→producer map in one pass, then do O(1) lookups
    // per read variable instead of O(n) scanning otherAffected lines.
    const producerOf = new Map<string, number>();
    for (const line of affected) {
      const lineWrites = this.writes.get(line);
      if (lineWrites) {
        for (const w of lineWrites) producerOf.set(w, line);
      }
    }

    // For each affected line, check if any reads are produced by another
    // affected line. If so, add an edge from producer → consumer.
    for (const line of affected) {
      const reads = this.lineReads.get(line);
      if (!reads) continue;

      for (const readVar of reads) {
        const producer = producerOf.get(readVar);
        if (producer !== undefined && producer !== line) {
          // producer writes readVar, which this line reads
          // Edge: producer → line (producer → consumer)
          adjacency.get(producer)!.push(line);
          inDegree.set(line, (inDegree.get(line) ?? 0) + 1);
        }
      }
    }

    // Kahn's algorithm: start with zero-indegree lines (no dependencies within
    // the affected set), then iteratively remove them, adding newly-freed lines.
    const queue: number[] = [];
    for (const [line, degree] of inDegree) {
      if (degree === 0) queue.push(line);
    }

    // If every affected line has at least one dependency (cycle or external),
    // start with the lowest line number as a fallback.
    if (queue.length === 0 && affected.size > 0) {
      const sorted = Array.from(affected).sort((a, b) => a - b);
      queue.push(sorted[0]);
    }

    const ordered: number[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(current);

      for (const downstream of adjacency.get(current) ?? []) {
        const newDegree = (inDegree.get(downstream) ?? 1) - 1;
        inDegree.set(downstream, newDegree);
        if (newDegree === 0) queue.push(downstream);
      }
    }

    // Append any remaining lines that couldn't be topologically sorted
    // (cycles or external-only dependencies) in ascending order.
    if (ordered.length < affected.size) {
      const orderedSet = new Set(ordered);
      const remaining = Array.from(affected)
        .filter((l) => !orderedSet.has(l))
        .sort((a, b) => a - b);
      ordered.push(...remaining);
    }

    return ordered;
  }

  /**
   * Find all lines affected by a data source update.
   *
   * When an async data source resolves (e.g., currency rate fetch completes),
   * this returns all lines that depend on that specific data query.
   *
   * @param dataSourceId - The data source identifier
   * @param queryKey - The query key that was updated
   * @returns Set of line numbers that need re-evaluation
   */
  getAffectedLinesByDataSource(dataSourceId: string, queryKey: string[]): Set<number> {
    const queryKeyStr = JSON.stringify(queryKey);
    const key = `${dataSourceId}:${queryKeyStr}`;
    return this.dataSourceConsumers.get(key) ?? new Set();
  }

  /**
   * Remove a line from the dependency graph (e.g., when a line is deleted from the document).
   *
   * Cleans up all consumer references, write registrations, and data source dependencies
   * for the removed line. O(k) where k is the number of variables the line reads.
   *
   * @param lineNumber - The line number being removed
   */
  removeLine(lineNumber: number): void {
     // Remove from consumers of variables this line read — O(k) not O(V)
     const reads = this.lineReads.get(lineNumber);
     if (reads) {
       for (const readVar of reads) {
         const consumers = this.consumers.get(readVar);
         if (consumers) consumers.delete(lineNumber);
       }
       this.lineReads.delete(lineNumber);
     }

     this.dependencies.delete(lineNumber);
     this.writes.delete(lineNumber);

     // Remove from consumers of the data-source keys THIS line depends on —
     // O(k) via the line's own dependency set, not O(total unique keys in
     // the document). Must read dataSourceDependencies before deleting it.
     const dataSourceKeys = this.dataSourceDependencies.get(lineNumber);
     if (dataSourceKeys) {
       for (const key of dataSourceKeys) {
         this.dataSourceConsumers.get(key)?.delete(lineNumber);
       }
       this.dataSourceDependencies.delete(lineNumber);
     }
   }

  /**
   * Get all line numbers that consume (read) a given variable.
   *
   * @param variable - The variable name
   * @returns Set of line numbers that read this variable, or empty set if none
   */
  getConsumers(variable: string): Set<number> {
    return this.consumers.get(variable) ?? new Set();
  }

  /**
   * Get all variables that a line depends on (reads).
   *
   * @param lineNumber - The line number to query
   * @returns Set of variable names this line reads, or empty set if none
   */
  getDependencies(lineNumber: number): Set<string> {
    return this.dependencies.get(lineNumber) ?? new Set();
  }

  /**
   * Get all variables that a line writes (assigns to).
   *
   * @param lineNumber - The line number to query
   * @returns Set of variable names this line writes, or empty set if none
   */
  getWrites(lineNumber: number): Set<string> {
    return this.writes.get(lineNumber) ?? new Set();
  }

  /**
   * Get a serializable snapshot of the entire dependency graph for diagnostics.
   *
   * Returns plain objects (not Maps/Sets) so consumers don't need to reach
   * into private fields. Used by playground diagnostic tabs for DAG visualization.
   */
  getSnapshot(): DagSnapshot {
    const consumers: Record<string, number[]> = {};
    for (const [variable, lines] of this.consumers) {
      consumers[variable] = Array.from(lines);
    }

    const writes: Record<number, string[]> = {};
    for (const [line, vars] of this.writes) {
      writes[line] = Array.from(vars);
    }

    const reads: Record<number, string[]> = {};
    for (const [line, vars] of this.lineReads) {
      reads[line] = Array.from(vars);
    }

    const dataSourceDeps: Record<number, string[]> = {};
    for (const [line, keys] of this.dataSourceDependencies) {
      dataSourceDeps[line] = Array.from(keys);
    }

    const dataSourceConsumers: Record<string, number[]> = {};
    for (const [key, lines] of this.dataSourceConsumers) {
      dataSourceConsumers[key] = Array.from(lines);
    }

    return { consumers, writes, reads, dataSourceDeps, dataSourceConsumers };
  }

  /** Clear all dependency graph state. Called on document switch or engine reset. */
  clear(): void {
    this.consumers.clear();
    this.dependencies.clear();
    this.writes.clear();
    this.lineReads.clear();
    this.dataSourceDependencies.clear();
    this.dataSourceConsumers.clear();
  }
}
