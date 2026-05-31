/**
 * Discriminated union tag for {@link Value} objects.
 *
 * Determines the runtime type of a Value and how its `value` field should
 * be interpreted. Used by the VM for type-aware dispatch in arithmetic,
 * comparison, and conversion operations.
 */
export const enum ValueType {
	/** Plain 64-bit floating point number (IEEE 754 double) */
	Number = 0,
	Hex = 1,
	BigInt = 2,
	String = 3,
	Datetime = 4,
	Percentage = 5,
	Uom = 6,
	/** Unified array type (any-length vectors, nested arrays). Value is `number[]`. */
	Array = 7,
	/** Boolean true/false. Value is `boolean`. */
	Boolean = 10,
	/** Unit of measurement token (lexer only, not a runtime value). */
	Unit = 11,
	/** Async result pending resolution. Value stores the queryKey string. */
	Pending = 12,
	/** Plugin-raised error propagated through the DAG. Value stores error code, unit stores message. */
	Error = 13,
}

// ── ValueArena ────────────────────────────────────────────────────────────
// Phase 5.3: Bump-allocator arena for zero-allocation Value reuse during scroll.
// Instead of allocating new Value objects per instruction, we pre-allocate a
// block and bump an index. A single arena.reset() per scroll frame recycles all
// Values — no per-value release overhead, no GC pressure during 60fps scrolling.

/**
 * Bump-allocator arena for zero-allocation Value reuse during scroll.
 *
 * Instead of allocating new Value objects per instruction, pre-allocates a
 * block and bumps an index. `arena.reset()` per scroll frame recycles all
 * Values — no per-value release overhead, no GC pressure during 60fps scrolling.
 *
 * Only active during Tier 2 scroll execution (ThreeTierEvaluator).
 */
export class ValueArena {
	private arena: Value[] = [];
	private index: number = 0;

	/** Pre-allocate initial block. 512 Values covers ~30-line viewport comfortably. */
	constructor(initialSize: number = 512) {
		for (let i = 0; i < initialSize; i++) {
			this.arena.push(new Value(ValueType.Number, 0));
		}
	}

	/** Bump-allocate a recycled Value. Falls back to allocation only for overflow. */
	acquire(type: ValueType, value: number | bigint | string | boolean | number[], unit?: string): Value {
		if (this.index < this.arena.length) {
			const v = this.arena[this.index++];
			v.recycle(type, value, unit);
			return v;
		}
		// Arena overflow — allocate fresh (rare, only for very complex expressions)
		const v = new Value(type, value, unit);
		this.arena.push(v);
		this.index++;
		return v;
	}

	/** Reset for next scroll frame. O(1) — just resets the index. */
	reset(): void {
		this.index = 0;
	}

	/** Current arena utilization (for diagnostics). */
	get usage(): number { return this.index; }
	get capacity(): number { return this.arena.length; }
}

// Module-level arena toggle. Single-threaded JS, so global state is safe.
// The arena is ONLY active during Tier 2 scroll execution — the ThreeTierEvaluator
// enables it before evaluating visible lines and disables it after.
let _arena: ValueArena | null = null;

/** Enable the Value arena for zero-allocation scroll execution. */
export function enableValueArena(size?: number): ValueArena {
	if (!_arena) _arena = new ValueArena(size);
	_arena.reset();
	return _arena;
}

/** Disable the arena (returns to normal GC-collected allocation). */
export function disableValueArena(): void {
	_arena = null;
}

/** Check if arena is active (used by STORE_VAR / HALT to decide cloning). */
export function isArenaActive(): boolean {
	return _arena !== null;
}

/**
 * Allocate a Value that persists beyond the current arena cycle.
 * Used for values stored in variables (STORE_VAR) and final expression results
 * (HALT return) — these must survive arena.reset() in the next scroll frame.
 */
export function persistentValue(v: Value): Value {
	return new Value(v.type, v.value, v.unit);
}

/**
 * Universal runtime value for the solve-js VM.
 *
 * Carries a {@link ValueType} discriminant, a polymorphic `value` payload,
 * and an optional `unit` string (for UoM values). Treated as immutable after
 * construction — the arena reuses objects internally via `recycle()`, but
 * external code should never mutate Value fields.
 *
 * A cached `_cachedNumber` avoids repeated `toNumber()` computation on
 * hot paths (ADD/SUB/MUL in the VM dispatch loop).
 */
export class Value {
	// Cached numeric representation — computed once on first toNumber() call.
	// Cleared on recycle() when the arena reuses this Value for a new value.
	private _cachedNumber: number | undefined;

	// Fields are NOT readonly — the arena reuses Value objects by calling
	// recycle() which overwrites all fields. External code should treat Values
	// as immutable after construction (arena handles mutation internally).
	public type: ValueType;
	public value: number | bigint | string | boolean | number[];
	public unit?: string;

	constructor(
		type: ValueType,
		value: number | bigint | string | boolean | number[],
		unit?: string
	) {
		this.type = type;
		this.value = value;
		this.unit = unit;
		// Eagerly cache for Number and Hex types (the most common case).
		// This avoids a method call + type-check on first toNumber().
		if (typeof value === 'number') {
			this._cachedNumber = value;
		}
	}

	/**
	 * Phase 5.3: Reset all fields for arena reuse.
	 * Called by ValueArena.acquire() — zero allocation, just field assignment.
	 */
	recycle(type: ValueType, value: number | bigint | string | boolean | number[], unit?: string): void {
		this.type = type;
		this.value = value;
		this.unit = unit;
		// Clear cache — value changed, cached number is stale.
		// Re-eager-cache for Number type (most common).
		this._cachedNumber = typeof value === 'number' ? value : undefined;
	}

	isNumber(): this is Value & { value: number } {
		return this.type === ValueType.Number;
	}

	isHex(): this is Value & { value: number } {
		return this.type === ValueType.Hex;
	}

	isBigInt(): this is Value & { value: bigint } {
		return this.type === ValueType.BigInt;
	}

	isString(): this is Value & { value: string } {
		return this.type === ValueType.String;
	}

	isVector(): this is Value & { value: number[] } {
		return this.type === ValueType.Array;
	}

	toNumber(): number {
		// Pending and Error values have no numeric representation
		if (this.type === ValueType.Pending) return 0;
		if (this.type === ValueType.Error) return 0;

		if (this._cachedNumber !== undefined) return this._cachedNumber;

		if (typeof this.value === 'bigint') {
			this._cachedNumber = Number(this.value);
			return this._cachedNumber;
		}
		// Prevent silent NaN propagation from non-numeric strings
		const result = parseFloat(this.value as string);
		this._cachedNumber = isNaN(result) ? 0 : result;
		return this._cachedNumber;
	}

	isNaN(): boolean {
		if (this.type === ValueType.Pending) return false;
		if (this.type === ValueType.Error) return false;
		if (typeof this.value === 'number') return isNaN(this.value);
		if (typeof this.value === 'bigint') return false;
		return isNaN(parseFloat(this.value as string));
	}
}

/**
 * Create a Number-typed Value. Uses the arena when active for zero-allocation.
 * This is the most common factory — over 90% of all Value creations.
 */
export function numberValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Number, n);
	return new Value(ValueType.Number, n);
}

/** Create a Hex-typed Value (0x-prefix literals). */
export function hexValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Hex, n);
	return new Value(ValueType.Hex, n);
}

/** Create a BigInt-typed Value (arbitrary-precision integer). */
export function bigIntValue(n: bigint): Value {
	if (_arena) return _arena.acquire(ValueType.BigInt, n);
	return new Value(ValueType.BigInt, n);
}

/** Create a String-typed Value. */
export function stringValue(s: string): Value {
	if (_arena) return _arena.acquire(ValueType.String, s);
	return new Value(ValueType.String, s);
}

/** Create a Unit-of-Measurement Value (typed number with unit annotation). */
export function uomValue(n: number, unit: string): Value {
	if (_arena) return _arena.acquire(ValueType.Uom, n, unit);
	return new Value(ValueType.Uom, n, unit);
}

/**
 * Create an Array value — any-length vectors and nested arrays.
 * Replaces the old vectorValue() which selected Vec2/Vec3/Vec4 based on length.
 */
export function arrayValue(v: number[]): Value {
	if (_arena) return _arena.acquire(ValueType.Array, v);
	return new Value(ValueType.Array, v);
}

/**
 * @deprecated Use arrayValue() instead. Kept for backward compatibility.
 */
export function vectorValue(v: number[]): Value {
	return arrayValue(v);
}

/** Create a Boolean-typed Value. */
export function boolValue(b: boolean): Value {
	if (_arena) return _arena.acquire(ValueType.Boolean, b);
	return new Value(ValueType.Boolean, b);
}

/** Create a Datetime-typed Value (Unix timestamp in milliseconds). */
export function datetimeValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Datetime, n);
	return new Value(ValueType.Datetime, n);
}

/** Create a Percentage-typed Value (stored as fraction, e.g. 0.5 for 50%). */
export function percentageValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Percentage, n);
	return new Value(ValueType.Percentage, n);
}

/**
 * Create a Pending value — signals that an async result is not yet resolved.
 * The value field stores the queryKey string for deduplication and diagnostics.
 * Pending values should NEVER be stored in the arena (they persist across
 * scroll frames until resolution completes).
 */
export function pendingValue(queryKey: string): Value {
	return new Value(ValueType.Pending, queryKey);
}

/**
 * Create an Error value — propagated through the DAG when a plugin raises an error.
 * The value field stores the SolveError code, unit stores the message.
 * Downstream consumers (lines that depend on errored data) bubble this up.
 * Should NEVER be stored in the arena.
 */
export function errorValue(code: string, message: string): Value {
	return new Value(ValueType.Error, code, message);
}
