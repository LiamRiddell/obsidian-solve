import { IVector2 } from "@solve-js/providers/vector/IVector2";

/**
 * Mathematical operations on 2D vectors.
 *
 * All methods are static — this is a pure utility class, not a data container.
 * Vectors are represented as plain `{ x, y }` objects implementing `IVector2`.
 */

export class Vector2 {
	/** Square of the magnitude (x² + y²). Faster than `magnitude` — avoids `Math.sqrt`. */
	static magnitudeSqrt(v: IVector2): number {
		return v.x * v.x + v.y * v.y;
	}

	/** Length of the vector. */
	static magnitude(v: IVector2): number {
		return Math.sqrt(Vector2.magnitudeSqrt(v));
	}

	/** Unit-length vector in the same direction. Returns `zero()` for the null vector. */
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

	/** Dot product (scalar projection). */
	static dot(v1: IVector2, v2: IVector2): number {
		return v1.x * v2.x + v1.y * v2.y;
	}

	/** Euclidean distance between two points. */
	static distance(v1: IVector2, v2: IVector2): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/** Squared distance between two points. Faster than `distance` — avoids `Math.sqrt`. */
	static distanceSq(v1: IVector2, v2: IVector2): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		return dx * dx + dy * dy;
	}

	/** Angle between two vectors in radians (0 to π). */
	static angleBetween(v1: IVector2, v2: IVector2): number {
		const dot = Vector2.dot(v1, v2);

		const magProduct = Vector2.magnitude(v1) * Vector2.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	/** Cross product magnitude (scalar in 2D). */
	static cross(v1: IVector2, v2: IVector2): number {
		return v1.x * v2.y - v1.y * v2.x;
	}

	/** Linear interpolation between `start` and `end`. `t` is clamped to [0, 1]. */
	static lerp(start: IVector2, end: IVector2, t: number): IVector2 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		return { x, y };
	}

	/** Origin constant `{ x: 0, y: 0 }`. */
	public static zero(): IVector2 {
		return { x: 0, y: 0 };
	}

	/** Unit constant `{ x: 1, y: 1 }`. */
	public static one(): IVector2 {
		return { x: 1, y: 1 };
	}
}
