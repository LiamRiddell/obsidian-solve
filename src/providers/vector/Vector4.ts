import { IVector4 } from "@/providers/vector/IVector4";

export class Vector4 {
	static magnitudeSqrt(v: IVector4): number {
		return v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w;
	}

	static magnitude(v: IVector4): number {
		return Math.sqrt(Vector4.magnitudeSqrt(v));
	}

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

	static dot(v1: IVector4, v2: IVector4): number {
		return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z + v1.w * v2.w;
	}

	static distance(v1: IVector4, v2: IVector4): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		const dw = v2.w - v1.w;
		return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
	}

	static distanceSq(v1: IVector4, v2: IVector4): number {
		const dx = v2.x - v1.x;
		const dy = v2.y - v1.y;
		const dz = v2.z - v1.z;
		const dw = v2.w - v1.w;
		return dx * dx + dy * dy + dz * dz + dw * dw;
	}

	static angleBetween(v1: IVector4, v2: IVector4): number {
		const dot = Vector4.dot(v1, v2);
		const magProduct = Vector4.magnitude(v1) * Vector4.magnitude(v2);
		return Math.acos(dot / magProduct);
	}

	static lerp(start: IVector4, end: IVector4, t: number): IVector4 {
		t = Math.max(0, Math.min(1, t));
		const x = start.x + (end.x - start.x) * t;
		const y = start.y + (end.y - start.y) * t;
		const z = start.z + (end.z - start.z) * t;
		const w = start.w + (end.w - start.w) * t;
		return { x, y, z, w };
	}

	public static zero(): IVector4 {
		return { x: 0, y: 0, z: 0, w: 0 };
	}

	public static one(): IVector4 {
		return { x: 1, y: 1, z: 1, w: 1 };
	}
}
