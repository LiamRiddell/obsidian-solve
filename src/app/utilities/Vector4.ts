import { IVector4 } from "@solve-js/packages/vector/IVector4";

/**
 * Mathematical operations on 4D vectors (common in graphics and physics).
 *
 * All methods are static — this is a pure utility class.
 * Vectors are represented as plain `{ x, y, z, w }` objects implementing `IVector4`.
 */

export class Vector4 {
	/** Square of the magnitude (x² + y² + z² + w²). Faster than `magnitude` — avoids `Math.sqrt`. */
	static magnitudeSqrt(v: IVector4): number {
		return v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w;
	}

	/** Length of the vector. */
	static magnitude(v: IVector4): number {
		return Math.sqrt(Vector4.magnitudeSqrt(v));
	}

	/** Unit-length vector in the same direction. Returns `zero()` for the null vector. */
	static normalise(v: IVector4): IVector4 {
		const l = Vector4.magnitude(v);

		if (l === 0) {
			return Vector4.zero();
		}

		return {
			x: v.x / l,
			y: v.y / l,
			z: v.z / l,
			w: v.w / l,
		};
	}

	/** Dot product (scalar projection). */
	static dot(v1: IVector4, v2: IVector4): number {
		return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z + v1.w * v2.w;
	}

	/** Euclidean distance between two points. */
	static distance(v1: IVector4, v2: IVector4): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		const dw = v2.w - v1.w;
		return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
	}

	/** Squared distance between two points. Faster than `distance` — avoids `Math.sqrt`. */
	static distanceSq(v1: IVector4, v2: IVector4): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		const dw = v2.w - v1.w;
		return dx * dx + dy * dy + dz * dz + dw * dw;
	}

	/** Angle between two vectors in radians (0 to π). */
	static angleBetween(v1: IVector4, v2: IVector4): number {
		const dot = Vector4.dot(v1, v2);
		const magProduct = Vector4.magnitude(v1) * Vector4.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	/** Linear interpolation between `start` and `end`. `t` is clamped to [0, 1]. */
	static lerp(start: IVector4, end: IVector4, t: number): IVector4 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		const z = start.z + (end.z - start.z) * t;
		const w = start.w + (end.w - start.w) * t;
		return { x, y, z, w };
	}

	/** Origin constant `{ x: 0, y: 0, z: 0, w: 0 }`. */
	public static zero(): IVector4 {
		return { x: 0, y: 0, z: 0, w: 0 };
	}

	/** Unit constant `{ x: 1, y: 1, z: 1, w: 1 }`. */
	public static one(): IVector4 {
		return { x: 1, y: 1, z: 1, w: 1 };
	}
}
