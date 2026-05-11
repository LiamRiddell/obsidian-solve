export type ValueType = 'number' | 'hex' | 'bigint' | 'string' | 'datetime' | 'duration' | 'percentage' | 'uom' | 'vector2' | 'vector3' | 'vector4' | 'boolean' | 'unit';

export class Value {
	constructor(
		public readonly type: ValueType,
		public readonly value: number | bigint | string | boolean | number[],
		public readonly unit?: string
	) {}

	isNumber(): this is Value & { value: number } {
		return this.type === 'number';
	}

	isHex(): this is Value & { value: number } {
		return this.type === 'hex';
	}

	isBigInt(): this is Value & { value: bigint } {
		return this.type === 'bigint';
	}

	isString(): this is Value & { value: string } {
		return this.type === 'string';
	}

	isVector(): this is Value & { value: number[] } {
		return this.type.startsWith('vector');
	}

	toNumber(): number {
		if (typeof this.value === 'number') return this.value;
		if (typeof this.value === 'bigint') return Number(this.value);
		return parseFloat(this.value as string);
	}
}

export function numberValue(n: number): Value {
	return new Value('number', n);
}

export function hexValue(n: number): Value {
	return new Value('hex', n);
}

export function bigIntValue(n: bigint): Value {
	return new Value('bigint', n);
}

export function stringValue(s: string): Value {
	return new Value('string', s);
}

export function uomValue(n: number, unit: string): Value {
	return new Value('uom', n, unit);
}

export function vectorValue(v: number[]): Value {
	const type = v.length === 2 ? 'vector2' : v.length === 3 ? 'vector3' : 'vector4';
	return new Value(type as ValueType, v);
}