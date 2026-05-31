import { IVector3 } from "@solve-js/providers/vector/IVector3";

/**
 * Mathematical operations on 3D vectors.
 *
 * All methods are static — this is a pure utility class.
 * Vectors are represented as plain `{ x, y, z }` objects implementing `IVector3`.
 */

export class Vector3 {
	/** Square of the magnitude (x² + y² + z²). Faster than `magnitude` — avoids `Math.sqrt`. */
	static magnitudeSqrt(v: IVector3): number {
		return v.x * v.x + v.y * v.y + v.z * v.z;
	}

	/** Length of the vector. */
	static magnitude(v: IVector3): number {
		return Math.sqrt(Vector3.magnitudeSqrt(v));
	}

	/** Unit-length vector in the same direction. Returns `zero()` for the null vector. */
	static normalise(v: IVector3): IVector3 {
		const l = Vector3.magnitude(v);

		if (l === 0) {
			return Vector3.zero();
		}

		return {
			x: v.x / l,
			y: v.y / l,
			z: v.z / l,
		};
	}

	/** Dot product (scalar projection). */
	static dot(v1: IVector3, v2: IVector3): number {
		return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
	}

	/** Euclidean distance between two points. */
	static distance(v1: IVector3, v2: IVector3): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	/** Squared distance between two points. Faster than `distance` — avoids `Math.sqrt`. */
	static distanceSq(v1: IVector3, v2: IVector3): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		return dx * dx + dy * dy + dz * dz;
	}

	/** Angle between two vectors in radians (0 to π). */
	static angleBetween(v1: IVector3, v2: IVector3): number {
		const dot = Vector3.dot(v1, v2);
		const magProduct = Vector3.magnitude(v1) * Vector3.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	/** Cross product — returns a vector perpendicular to both inputs. */
	static cross(v1: IVector3, v2: IVector3): IVector3 {
		const x = v1.y * v2.z - v1.z * v2.y;
		const y = v1.z * v2.x - v1.x * v2.z;
		const z = v1.x * v2.y - v1.y * v2.x;
		return { x, y, z };
	}

	/** Linear interpolation between `start` and `end`. `t` is clamped to [0, 1]. */
	static lerp(start: IVector3, end: IVector3, t: number): IVector3 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		const z = start.z + (end.z - start.z) * t;
		return { x, y, z };
	}

	/** Origin constant `{ x: 0, y: 0, z: 0 }`. */
	public static zero(): IVector3 {
		return {
			x: 0,
			y: 0,
			z: 0,
		};
	}

	/** Unit constant `{ x: 1, y: 1, z: 1 }`. */
	public static one(): IVector3 {
		return {
			x: 1,
			y: 1,
			z: 1,
		};
	}
}
