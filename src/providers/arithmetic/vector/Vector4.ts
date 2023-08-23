export class Vector4 {
	x: number;
	y: number;
	z: number;
	w: number;

	constructor(x: number, y: number, z: number, w: number) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;
	}

	public addition(other: Vector4 | number) {
		if (typeof other === "number") {
			return new Vector4(
				this.x + other,
				this.y + other,
				this.z + other,
				this.w + other
			);
		}

		return new Vector4(
			this.x + other.x,
			this.y + other.y,
			this.z + other.z,
			this.w + other.w
		);
	}

	public subtraction(other: Vector4 | number): Vector4 {
		if (typeof other === "number") {
			return new Vector4(
				this.x - other,
				this.y - other,
				this.z - other,
				this.w - other
			);
		}

		return new Vector4(
			this.x - other.x,
			this.y - other.y,
			this.z - other.z,
			this.w - other.w
		);
	}

	public multiplication(other: Vector4 | number): Vector4 {
		if (typeof other === "number") {
			return new Vector4(
				this.x * other,
				this.y * other,
				this.z * other,
				this.w * other
			);
		}

		return new Vector4(
			this.x * other.x,
			this.y * other.y,
			this.z * other.z,
			this.w * other.w
		);
	}

	public division(other: Vector4 | number): Vector4 {
		if (typeof other === "number") {
			return new Vector4(
				this.x / other,
				this.y / other,
				this.z / other,
				this.w / other
			);
		}

		return new Vector4(
			this.x / other.x,
			this.y / other.y,
			this.z / other.z,
			this.w / other.w
		);
	}

	public exponent(other: Vector4 | number): Vector4 {
		if (typeof other === "number") {
			return new Vector4(
				Math.pow(this.x, other),
				Math.pow(this.y, other),
				Math.pow(this.z, other),
				Math.pow(this.w, other)
			);
		}

		return new Vector4(
			Math.pow(this.x, other.x),
			Math.pow(this.y, other.y),
			Math.pow(this.z, other.z),
			Math.pow(this.w, other.w)
		);
	}

	static magnitudeSqrt(v: Vector4): number {
		return v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w;
	}

	static magnitude(v: Vector4): number {
		return Math.sqrt(Vector4.magnitudeSqrt(v));
	}

	static normalise(v: Vector4): Vector4 {
		const l = Vector4.magnitude(v);

		if (l === 0) {
			return Vector4.zero();
		}

		return new Vector4(v.x / l, v.y / l, v.z / l, v.w / l);
	}

	static dot(v1: Vector4, v2: Vector4): number {
		return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z + v1.w * v2.w;
	}

	static distance(v1: Vector4, v2: Vector4): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		const dw = v2.w - v1.w;
		return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
	}

	static distanceSq(v1: Vector4, v2: Vector4): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		const dw = v2.w - v1.w;
		return dx * dx + dy * dy + dz * dz + dw * dw;
	}

	static angleBetween(v1: Vector4, v2: Vector4): number {
		const dot = Vector4.dot(v1, v2);
		const magProduct = Vector4.magnitude(v1) * Vector4.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	static lerp(start: Vector4, end: Vector4, t: number): Vector4 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		const z = start.z + (end.z - start.z) * t;
		const w = start.w + (end.w - start.w) * t;
		return new Vector4(x, y, z, w);
	}

	public static zero(): Vector4 {
		return new Vector4(0, 0, 0, 0);
	}

	public static one(): Vector4 {
		return new Vector4(1, 1, 1, 1);
	}

	public toString(precision: number) {
		const x = this.x.toPrecision(precision);
		const y = this.y.toPrecision(precision);
		const z = this.z.toPrecision(precision);
		const w = this.w.toPrecision(precision);

		return `(${x}, ${y}, ${z}, ${w})`;
	}
}
