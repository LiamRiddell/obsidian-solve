export class Vector2 {
	x: number;
	y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	public addition(other: Vector2 | number) {
		if (typeof other === "number") {
			return new Vector2(this.x + other, this.y + other);
		}

		return new Vector2(this.x + other.x, this.y + other.y);
	}

	public subtraction(other: Vector2 | number): Vector2 {
		if (typeof other === "number") {
			return new Vector2(this.x - other, this.y - other);
		}

		return new Vector2(this.x - other.x, this.y - other.y);
	}

	public multiplication(other: Vector2 | number): Vector2 {
		if (typeof other === "number") {
			return new Vector2(this.x * other, this.y * other);
		}

		return new Vector2(this.x * other.x, this.y * other.y);
	}

	public division(other: Vector2 | number): Vector2 {
		if (typeof other === "number") {
			return new Vector2(this.x / other, this.y / other);
		}

		return new Vector2(this.x / other.x, this.y / other.y);
	}

	public exponent(other: Vector2 | number): Vector2 {
		if (typeof other === "number") {
			return new Vector2(
				Math.pow(this.x, other),
				Math.pow(this.y, other)
			);
		}

		return new Vector2(
			Math.pow(this.x, other.x),
			Math.pow(this.y, other.y)
		);
	}

	static magnitudeSqrt(v: Vector2): number {
		return v.x * v.x + v.y * v.y;
	}

	static magnitude(v: Vector2): number {
		return Math.sqrt(Vector2.magnitudeSqrt(v));
	}

	static normalise(v: Vector2): Vector2 {
		const l = Vector2.magnitude(v);

		if (l === 0) {
			return Vector2.zero();
		}

		return new Vector2(v.x / l, v.y / l);
	}

	static dot(v1: Vector2, v2: Vector2): number {
		return v1.x * v2.x + v1.y * v2.y;
	}

	static distance(v1: Vector2, v2: Vector2): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	static distanceSq(v1: Vector2, v2: Vector2): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		return dx * dx + dy * dy;
	}

	static angleBetween(v1: Vector2, v2: Vector2): number {
		const dot = Vector2.dot(v1, v2);
		const magProduct = Vector2.magnitude(v1) * Vector2.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	static cross(v1: Vector2, v2: Vector2): number {
		return v1.x * v2.y - v1.y * v2.x;
	}

	static lerp(start: Vector2, end: Vector2, t: number): Vector2 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		return new Vector2(x, y);
	}

	public static zero(): Vector2 {
		return new Vector2(0, 0);
	}

	public static one(): Vector2 {
		return new Vector2(1, 1);
	}

	public toString(precision: number) {
		const x = this.x.toPrecision(precision);
		const y = this.y.toPrecision(precision);

		return `(${x}, ${y})`;
	}
}
