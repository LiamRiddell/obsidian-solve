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

export class Value {
	constructor(
		public readonly type: ValueType,
		public readonly value: number | bigint | string | boolean | number[],
		public readonly unit?: string
	) {}

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
		if (typeof this.value === 'number') return this.value;
		if (typeof this.value === 'bigint') return Number(this.value);
		// Prevent silent NaN propagation from non-numeric strings
		const result = parseFloat(this.value as string);
		return isNaN(result) ? 0 : result;
	}

	isNaN(): boolean {
		if (typeof this.value === 'number') return isNaN(this.value);
		if (typeof this.value === 'bigint') return false;
		return isNaN(parseFloat(this.value as string));
	}
}

export function numberValue(n: number): Value {
	return new Value(ValueType.Number, n);
}

export function hexValue(n: number): Value {
	return new Value(ValueType.Hex, n);
}

export function bigIntValue(n: bigint): Value {
	return new Value(ValueType.BigInt, n);
}

export function stringValue(s: string): Value {
	return new Value(ValueType.String, s);
}

export function uomValue(n: number, unit: string): Value {
	return new Value(ValueType.Uom, n, unit);
}

export function vectorValue(v: number[]): Value {
	switch (v.length) {
		case 2: return new Value(ValueType.Vector2, v);
		case 3: return new Value(ValueType.Vector3, v);
		default: return new Value(ValueType.Vector4, v);
	}
}
