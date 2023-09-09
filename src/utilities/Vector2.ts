import { IVector2 } from "@/providers/vector/IVector2";

export class Vector2 {
	static magnitudeSqrt(v: IVector2): number {
		return v.x * v.x + v.y * v.y;
	}

	static magnitude(v: IVector2): number {
		return Math.sqrt(Vector2.magnitudeSqrt(v));
	}

	static normalise(v: IVector2): IVector2 {
		const l = Vector2.magnitude(v);

		if (l === 0) {
			return Vector2.zero();
		}

		return {
			x: v.x / l,
			y: v.y / l,
		};
	}

	static dot(v1: IVector2, v2: IVector2): number {
		return v1.x * v2.x + v1.y * v2.y;
	}

	static distance(v1: IVector2, v2: IVector2): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	static distanceSq(v1: IVector2, v2: IVector2): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		return dx * dx + dy * dy;
	}

	static angleBetween(v1: IVector2, v2: IVector2): number {
		const dot = Vector2.dot(v1, v2);

		const magProduct = Vector2.magnitude(v1) * Vector2.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	static cross(v1: IVector2, v2: IVector2): number {
		return v1.x * v2.y - v1.y * v2.x;
	}

	static lerp(start: IVector2, end: IVector2, t: number): IVector2 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		return { x, y };
	}

	public static zero(): IVector2 {
		return { x: 0, y: 0 };
	}

	public static one(): IVector2 {
		return { x: 1, y: 1 };
	}
}
