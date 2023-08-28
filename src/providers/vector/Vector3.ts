export class Vector3 {
	x: number;
	y: number;
	z: number;

	constructor(x: number, y: number, z: number) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	public addition(other: Vector3 | number) {
		if (typeof other === "number") {
			return new Vector3(this.x + other, this.y + other, this.z + other);
		}

		return new Vector3(
			this.x + other.x,
			this.y + other.y,
			this.z + other.z
		);
	}

	public subtraction(other: Vector3 | number): Vector3 {
		if (typeof other === "number") {
			return new Vector3(this.x - other, this.y - other, this.z - other);
		}

		return new Vector3(
			this.x - other.x,
			this.y - other.y,
			this.z - other.z
		);
	}

	public multiplication(other: Vector3 | number): Vector3 {
		if (typeof other === "number") {
			return new Vector3(this.x * other, this.y * other, this.z * other);
		}

		return new Vector3(
			this.x * other.x,
			this.y * other.y,
			this.z * other.z
		);
	}

	public division(other: Vector3 | number): Vector3 {
		if (typeof other === "number") {
			return new Vector3(this.x / other, this.y / other, this.z / other);
		}

		return new Vector3(
			this.x / other.x,
			this.y / other.y,
			this.z / other.z
		);
	}

	public exponent(other: Vector3 | number): Vector3 {
		if (typeof other === "number") {
			return new Vector3(
				Math.pow(this.x, other),
				Math.pow(this.y, other),
				Math.pow(this.z, other)
			);
		}

		return new Vector3(
			Math.pow(this.x, other.x),
			Math.pow(this.y, other.y),
			Math.pow(this.z, other.z)
		);
	}

	static magnitudeSqrt(v: Vector3): number {
		return v.x * v.x + v.y * v.y + v.z * v.z;
	}

	static magnitude(v: Vector3): number {
		return Math.sqrt(Vector3.magnitudeSqrt(v));
	}

	static normalise(v: Vector3): Vector3 {
		const l = Vector3.magnitude(v);

		if (l === 0) {
			return Vector3.zero();
		}

		return new Vector3(v.x / l, v.y / l, v.z / l);
	}

	static dot(v1: Vector3, v2: Vector3): number {
		return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
	}

	static distance(v1: Vector3, v2: Vector3): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	static distanceSq(v1: Vector3, v2: Vector3): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		return dx * dx + dy * dy + dz * dz;
	}

	static angleBetween(v1: Vector3, v2: Vector3): number {
		const dot = Vector3.dot(v1, v2);
		const magProduct = Vector3.magnitude(v1) * Vector3.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	static cross(v1: Vector3, v2: Vector3): Vector3 {
		const x = v1.y * v2.z - v1.z * v2.y;
		const y = v1.z * v2.x - v1.x * v2.z;
		const z = v1.x * v2.y - v1.y * v2.x;
		return new Vector3(x, y, z);
	}

	static lerp(start: Vector3, end: Vector3, t: number): Vector3 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		const z = start.z + (end.z - start.z) * t;
		return new Vector3(x, y, z);
	}

	public static zero(): Vector3 {
		return new Vector3(0, 0, 0);
	}

	public static one(): Vector3 {
		return new Vector3(1, 1, 1);
	}

	public toString(precision: number) {
		const x = this.x.toPrecision(precision);
		const y = this.y.toPrecision(precision);
		const z = this.z.toPrecision(precision);

		return `(${x}, ${y}, ${z})`;
	}
}
