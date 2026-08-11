/**
 * Compute a fast, non-cryptographic integer hash of a string.
 *
 * Uses a multiplicative hash (Fowler–Noll–Vo–inspired): iterates over each
 * code point, accumulating via `Math.imul(31, hash) + charCode`. The result
 * is truncated to a 32-bit signed integer via bitwise OR with 0.
 *
 * Suitable for checksums, cache-key sharding, and quick deduplication.
 * Not suitable for cryptographic use or guaranteed-unique IDs.
 *
 * @param text - Arbitrary string input.
 * @returns A 32-bit signed integer hash.
 */
export const fastHash = (text: string) => {
	return [...text].reduce(
		(hash, c) => (Math.imul(31, hash) + c.charCodeAt(0)) | 0,
		0
	);
};
