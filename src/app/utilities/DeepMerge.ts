/**
 * Deep-merge two or more plain objects, preserving nested defaults.
 *
 * Unlike `Object.assign`, this recursively merges nested objects rather than
 * replacing them at the top level. This is essential for merging saved user
 * settings with new default sections that the saved data doesn't have yet
 * (e.g., when the plugin adds a new settings section like `validation` or
 * `vm` in a future update).
 *
 * ### Behaviour
 *   - **Plain objects** → recursively merged (source keys are merged into
 *     the target, not replaced wholesale).
 *   - **Arrays** → replaced (the source array overwrites the target).
 *   - **Primitives / null / undefined** → replaced by the source value.
 *   - **Source-only keys** → added to the target.
 *   - **Target-only keys** → preserved.
 *   - **Type conflicts** → source value wins (e.g. if target has `{ x: 1 }`
 *     and source has `{ x: { y: 2 } }`, the source's `x` wins).
 *
 * ### Mutability
 *   Does **not** mutate any source object. Returns a new merged object.
 *
 * @param target - The base object (defaults).
 * @param sources - One or more override objects (later sources take priority).
 * @returns A new deeply-merged object.
 */
export function deepMerge<T>(
  target: T,
  ...sources: Partial<T>[]
): T {
  // Use Record<string, unknown> internally so we can index by string keys
  // without requiring T to have an index signature at the call site.
  const result: Record<string, unknown> = { ...target as Record<string, unknown> };

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const sourceRecord = source as Record<string, unknown>;

    for (const key of Object.keys(sourceRecord)) {
      const sourceVal = sourceRecord[key];
      const targetVal = result[key];

      if (
        sourceVal !== null &&
        typeof sourceVal === "object" &&
        !Array.isArray(sourceVal) &&
        targetVal !== null &&
        typeof targetVal === "object" &&
        !Array.isArray(targetVal)
      ) {
        // Both are plain objects → deep merge
        result[key] = deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>
        );
      } else {
        // Primitive, array, null, or type mismatch → source wins
        result[key] = sourceVal;
      }
    }
  }

  return result as unknown as T;
}
