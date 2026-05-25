Now I have full context. Let me implement the DocumentModel. Key design:

-   Persistent line IDs (monotonically increasing) so caches survive structural edits
-   Map<lineId, LineState> for O(1) data lookup
-   Sorted lineId[] array for ordered traversal + binary search (O(log N) lookups, O(N) splices — adequate for Obsidian docs; upgradeable to Segment Tree later)
-   Simple djb2 hash inline for text change detection (no FastHash utility exists yet)

-- IMPROVEMENTS

1. Dead code: \_binarySearchBuffer
   DocumentModel.ts declares private \_binarySearchBuffer: number[] = [] on line but it's never used. Remove it.
2. applyChanges() doesn't return removed line IDs
   Callers that need to clean up the dependency graph (remove stale reads/writes for deleted lines) have no way to know which IDs were removed. The method returns affected: Set<number> but that only includes newly inserted IDs. Consider also returning the removed IDs, or add a separate return value.
3. getLinePosition() is O(N) and will be called in hot paths
   The comment acknowledges this, but the dependency graph integration in later phases will call getLinePosition for every affected line. Consider adding a simple Map<lineId, number> position cache that gets rebuilt on structural edits. This can be done lazily — flag \_positionsDirty on any splice, rebuild on first getLinePosition call.
4. Thread safety gap for future worker integration
   When Phase 5.2h sends compilation to a worker, the worker will post back {lineId, bytecode, reads, writes, textHash} . If the user edited that line between dispatch and response, the main thread needs to reject the stale result. Add a method like:
   // typescript
   isBytecodeValid(lineId: number, compiledAgainstHash: number): boolean {
   const state = this.lines.get(lineId);
   return state !== undefined && state.textHash === compiledAgainstHash;
   }
   This is trivial to add now and critical for correctness later.
5. djb2Hash in the wrong module
   A hash utility doesn't belong in DocumentModel.ts . Move it to src/solve-js/src/utilities/FastHash.ts (or Hash.ts ) and import it. This keeps the DocumentModel focused on document structure.
6. Ambiguous updateLineBytecode behavior
   updateLineResult sets dirty = false but updateLineBytecode doesn't. This is intentional (Tier 3 compile-only), but the method names don't make the distinction obvious. Consider renaming to updateLineCompiled or adding a JSDoc comment explaining that the line remains dirty and needs execution.
7. applyChanges doesn't validate non-overlapping changes
   If two LineChange objects in the same call target overlapping ranges, the reverse-order processing silently produces wrong results. Add a precondition check or at minimum document that changes must be non-overlapping.

-- These could all be implemented
