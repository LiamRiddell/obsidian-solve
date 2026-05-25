export const enum ValueType {
	Number = 0,
	Hex = 1,
	BigInt = 2,
	String = 3,
	Datetime = 4,
	Percentage = 5,
	Uom = 6,
	Vector2 = 7,
	Vector3 = 8,
	Vector4 = 9,
	Boolean = 10,
	Unit = 11,
}

// ── ValueArena ────────────────────────────────────────────────────────────
// Phase 5.3: Bump-allocator arena for zero-allocation Value reuse during scroll.
// Instead of allocating new Value objects per instruction, we pre-allocate a
// block and bump an index. A single arena.reset() per scroll frame recycles all
// Values — no per-value release overhead, no GC pressure during 60fps scrolling.

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
		return this.type === ValueType.Vector2 || this.type === ValueType.Vector3 || this.type === ValueType.Vector4;
	}

	toNumber(): number {
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
		if (typeof this.value === 'number') return isNaN(this.value);
		if (typeof this.value === 'bigint') return false;
		return isNaN(parseFloat(this.value as string));
	}
}

export function numberValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Number, n);
	return new Value(ValueType.Number, n);
}

export function hexValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Hex, n);
	return new Value(ValueType.Hex, n);
}

export function bigIntValue(n: bigint): Value {
	if (_arena) return _arena.acquire(ValueType.BigInt, n);
	return new Value(ValueType.BigInt, n);
}

export function stringValue(s: string): Value {
	if (_arena) return _arena.acquire(ValueType.String, s);
	return new Value(ValueType.String, s);
}

export function uomValue(n: number, unit: string): Value {
	if (_arena) return _arena.acquire(ValueType.Uom, n, unit);
	return new Value(ValueType.Uom, n, unit);
}

export function vectorValue(v: number[]): Value {
	const type = v.length === 2 ? ValueType.Vector2 : v.length === 3 ? ValueType.Vector3 : ValueType.Vector4;
	if (_arena) return _arena.acquire(type, v);
	return new Value(type, v);
}

export function boolValue(b: boolean): Value {
	if (_arena) return _arena.acquire(ValueType.Boolean, b);
	return new Value(ValueType.Boolean, b);
}

export function datetimeValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Datetime, n);
	return new Value(ValueType.Datetime, n);
}

export function percentageValue(n: number): Value {
	if (_arena) return _arena.acquire(ValueType.Percentage, n);
	return new Value(ValueType.Percentage, n);
}
