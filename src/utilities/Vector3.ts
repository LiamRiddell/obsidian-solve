import { IVector3 } from "@/providers/vector/IVector3";

export class Vector3 {
	static magnitudeSqrt(v: IVector3): number {
		return v.x * v.x + v.y * v.y + v.z * v.z;
	}

	static magnitude(v: IVector3): number {
		return Math.sqrt(Vector3.magnitudeSqrt(v));
	}

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

	static dot(v1: IVector3, v2: IVector3): number {
		return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
	}

	static distance(v1: IVector3, v2: IVector3): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	static distanceSq(v1: IVector3, v2: IVector3): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		return dx * dx + dy * dy + dz * dz;
	}

	static angleBetween(v1: IVector3, v2: IVector3): number {
		const dot = Vector3.dot(v1, v2);
		const magProduct = Vector3.magnitude(v1) * Vector3.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	static cross(v1: IVector3, v2: IVector3): IVector3 {
		const x = v1.y * v2.z - v1.z * v2.y;
		const y = v1.z * v2.x - v1.x * v2.z;
		const z = v1.x * v2.y - v1.y * v2.x;
		return { x, y, z };
	}

	static lerp(start: IVector3, end: IVector3, t: number): IVector3 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		const z = start.z + (end.z - start.z) * t;
		return { x, y, z };
	}

	public static zero(): IVector3 {
		return {
			x: 0,
			y: 0,
			z: 0,
		};
	}

	public static one(): IVector3 {
		return {
			x: 1,
			y: 1,
			z: 1,
		};
	}
}
