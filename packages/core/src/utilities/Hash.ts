/**
 * Fast, non-cryptographic string hashing utilities.
 *
 * djb2 is chosen for its speed, simplicity, and excellent distribution
 * for short strings (typical line lengths in markdown documents).
 * It produces a 32-bit unsigned integer hash.
 */

/**
 * djb2 string hash — fast, simple, good distribution.
 * Used for O(1) line text change detection in DocumentModel.
 */
export function djb2Hash(str: string): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
	}
	return hash >>> 0; // unsigned 32-bit
}
