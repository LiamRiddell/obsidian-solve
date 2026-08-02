import { type MatrixData, type MatrixEntry, type RangeData, Value, ValueType, matrixValue, numberValue, boolValue, symbolicValue, errorValue } from "@solve-js/vm/Value";
import { type SymbolicNode, constNode, simplifySymbolic } from "@solve-js/vm/Symbolic";

/**
 * Shared, pure helpers for reading/building {@link MatrixData}. Kept
 * separate from `VM.ts`'s opcode dispatch and `VMConversion.ts`'s
 * `binaryOp()` so every consumer (arithmetic, indexing, transpose/inverse,
 * map/reduce) reads/writes matrix storage through the same column-major
 * convention rather than each re-deriving the row/col math independently.
 */

/** Column-major single-index read — `a[i]` in the spec's own notation. */
export function matIndex(m: MatrixData, index: number): MatrixEntry {
	return m.data[index];
}

/** `[row, col]` read (both 0-based), via the column-major storage formula `row + col*rows`. */
export function matAt(m: MatrixData, row: number, col: number): MatrixEntry {
	return m.data[row + col * m.rows];
}

/** Whether `[row, col]` is a valid cell for `m`. */
export function inBounds(m: MatrixData, row: number, col: number): boolean {
	return row >= 0 && row < m.rows && col >= 0 && col < m.cols;
}

export function sameShape(a: MatrixData, b: MatrixData): boolean {
	return a.rows === b.rows && a.cols === b.cols;
}

export function isSquare(m: MatrixData): boolean {
	return m.rows === m.cols;
}

/** Converts a matrix cell into a SymbolicNode — its own tree if already symbolic, else a `const` node (boolean coerced to 0/1). */
export function entryToSymbolic(entry: MatrixEntry): SymbolicNode {
	if (typeof entry === "object" && entry !== null) return entry;
	if (typeof entry === "boolean") return constNode(entry ? 1 : 0);
	return constNode(entry);
}

/** Collapses a simplified SymbolicNode back to a plain number when it's a pure constant — keeps matrix cells in their simplest representation rather than always carrying a wrapped tree. */
export function symbolicToEntry(node: SymbolicNode): MatrixEntry {
	const simplified = simplifySymbolic(node);
	return simplified.kind === "const" ? simplified.value : simplified;
}

/** Converts a matrix cell into a real Value — Boolean/Symbolic preserved as-is, plain numbers wrapped via numberValue(). Used anywhere a cell needs to leave MatrixData and become an ordinary VM value (indexing, map/reduce collection iteration). */
export function matrixEntryToValue(cell: MatrixEntry): Value {
	if (typeof cell === "boolean") return boolValue(cell);
	if (typeof cell === "object" && cell !== null) return symbolicValue(cell);
	return numberValue(cell);
}

/**
 * A matrix literal is naturally written and parsed row-major (`[1,2;3,4]`
 * reads row 0 then row 1), but {@link MatrixData.data} is stored
 * column-major (matching the spec's own `a[index]` semantics directly).
 * This is the one place that translation happens — every other consumer
 * of `MatrixData` just reads/writes column-major storage directly.
 */
export function rowMajorToColumnMajor(rows: number, cols: number, rowMajorData: readonly MatrixEntry[]): MatrixEntry[] {
	const data = new Array<MatrixEntry>(rows * cols);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			data[r + c * rows] = rowMajorData[r * cols + c];
		}
	}
	return data;
}

/** Inverse of {@link rowMajorToColumnMajor} — used by display code, which reads back out row-by-row. */
export function columnMajorToRowMajor(m: MatrixData): MatrixEntry[] {
	const data = new Array<MatrixEntry>(m.rows * m.cols);
	for (let r = 0; r < m.rows; r++) {
		for (let c = 0; c < m.cols; c++) {
			data[r * m.cols + c] = matAt(m, r, c);
		}
	}
	return data;
}

/**
 * `*` between two matrices — genuinely different from `+`/`-`/comparisons,
 * which stay element-wise. Distinguishes three cases per the Calca spec:
 * a `1×1` operand ("scalar") broadcasts (multiplies every cell of the
 * other operand); otherwise, if the inner dimensions agree
 * (`l.cols === r.rows`), this is a real `(m×n)*(n×p)=(m×p)` matrix
 * product; anything else is a dimension mismatch. Called from VM.ts's MUL
 * case BEFORE falling through to the always-element-wise `binaryOp()` —
 * `binaryOp()` itself never disambiguates multiplication this way.
 *
 * Symbolic-aware: when either operand `hasSymbolic`, every cell is
 * computed via `SymbolicNode` add/multiply + simplify instead of plain
 * `number` arithmetic — the ordinary numeric fast path only runs when
 * NEITHER operand carries any symbolic cell.
 */
export function matrixMultiply(l: MatrixData, r: MatrixData): Value {
	const lIsScalar = l.rows === 1 && l.cols === 1;
	const rIsScalar = r.rows === 1 && r.cols === 1;
	const useSymbolic = l.hasSymbolic || r.hasSymbolic;

	if (lIsScalar || rIsScalar) {
		const [scalarOperand, matrixOperand] = lIsScalar ? [l, r] : [r, l];
		if (useSymbolic) {
			const scalarNode = entryToSymbolic(scalarOperand.data[0]);
			const result = matrixOperand.data.map(v => symbolicToEntry(simplifySymbolic({ kind: "mul", left: entryToSymbolic(v), right: scalarNode })));
			return matrixValue(matrixOperand.rows, matrixOperand.cols, result);
		}
		const scalar = scalarOperand.data[0] as number;
		const result = matrixOperand.data.map(v => (v as number) * scalar);
		return matrixValue(matrixOperand.rows, matrixOperand.cols, result);
	}

	if (l.cols !== r.rows) {
		return errorValue(
			"DIMENSION_MISMATCH",
			`Cannot multiply a ${l.rows}x${l.cols} matrix by a ${r.rows}x${r.cols} matrix — inner dimensions must match (${l.cols} !== ${r.rows}).`,
		);
	}

	const resultRows = l.rows;
	const resultCols = r.cols;
	const data = new Array<MatrixEntry>(resultRows * resultCols);
	for (let row = 0; row < resultRows; row++) {
		for (let col = 0; col < resultCols; col++) {
			if (useSymbolic) {
				let acc: SymbolicNode = constNode(0);
				for (let k = 0; k < l.cols; k++) {
					const term: SymbolicNode = { kind: "mul", left: entryToSymbolic(matAt(l, row, k)), right: entryToSymbolic(matAt(r, k, col)) };
					acc = simplifySymbolic({ kind: "add", left: acc, right: term });
				}
				data[row + col * resultRows] = symbolicToEntry(acc);
			} else {
				let sum = 0;
				for (let k = 0; k < l.cols; k++) {
					sum += (matAt(l, row, k) as number) * (matAt(r, k, col) as number);
				}
				data[row + col * resultRows] = sum;
			}
		}
	}
	return matrixValue(resultRows, resultCols, data);
}

/**
 * Element-wise comparison — `[1,6;3,8] < [5,2;7,4] => [true,false;true,false]`.
 * Unlike arithmetic, comparison NEVER does matrix-vs-matrix "real" dispatch
 * (there's no such thing as a "comparison product") — always element-wise,
 * same shape required, producing a Matrix of booleans.
 *
 * NOT symbolic-aware — comparing a free-variable formula's ordering has no
 * general meaning without knowing its value (is `sx < 5`? unknowable), and
 * no spec example compares two symbolic matrices — a disclosed, narrow gap
 * rather than attempted-and-wrong.
 */
export function matrixCompare(l: MatrixData, r: MatrixData, cmp: (a: number, b: number) => boolean): Value {
	if (!sameShape(l, r)) {
		return errorValue(
			"DIMENSION_MISMATCH",
			`Cannot compare matrices of different shapes: ${l.rows}x${l.cols} and ${r.rows}x${r.cols}`,
		);
	}
	const data: MatrixEntry[] = new Array(l.data.length);
	for (let i = 0; i < l.data.length; i++) data[i] = cmp(l.data[i] as number, r.data[i] as number);
	return matrixValue(l.rows, l.cols, data);
}

/** `a^T` — swaps rows/cols; cell `[r,c]` in the result is cell `[c,r]` in `m`. Cell-type-agnostic (just rearranges), so this needs no symbolic-aware variant. */
export function transpose(m: MatrixData): Value {
	const data = new Array<MatrixEntry>(m.rows * m.cols);
	for (let r = 0; r < m.cols; r++) {
		for (let c = 0; c < m.rows; c++) {
			data[r + c * m.cols] = matAt(m, c, r);
		}
	}
	return matrixValue(m.cols, m.rows, data);
}

/**
 * Copies `m` into a plain row-major `number[][]` working copy for
 * elimination — {@link numericDeterminant}/{@link numericInverse} both
 * mutate their own copy in place rather than touching `m.data` (which
 * callers may still hold a reference to elsewhere).
 */
function toWorkingRows(m: MatrixData): number[][] {
	const rows: number[][] = [];
	for (let r = 0; r < m.rows; r++) {
		const row: number[] = [];
		for (let c = 0; c < m.cols; c++) row.push(matAt(m, r, c) as number);
		rows.push(row);
	}
	return rows;
}

/**
 * `|a|` / `det(a)` — Gaussian elimination with partial pivoting, reusing
 * the elimination's own running pivot product as the determinant (rather
 * than a separate cofactor-expansion implementation). A row swap flips the
 * product's sign, matching the standard determinant-under-row-swap
 * identity. A zero pivot column (no non-zero candidate at or below it)
 * means the matrix is singular — determinant 0, not an error, since 0 is
 * the mathematically correct answer for a singular matrix.
 */
function numericDeterminant(m: MatrixData): Value {
	const n = m.rows;
	const a = toWorkingRows(m);
	let det = 1;
	for (let col = 0; col < n; col++) {
		let pivotRow = col;
		let maxAbs = Math.abs(a[col][col]);
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(a[r][col]) > maxAbs) { maxAbs = Math.abs(a[r][col]); pivotRow = r; }
		}
		if (maxAbs === 0) return numberValue(0);
		if (pivotRow !== col) {
			const tmp = a[col]; a[col] = a[pivotRow]; a[pivotRow] = tmp;
			det = -det;
		}
		det *= a[col][col];
		for (let r = col + 1; r < n; r++) {
			const factor = a[r][col] / a[col][col];
			if (factor === 0) continue;
			for (let c = col; c < n; c++) a[r][c] -= factor * a[col][c];
		}
	}
	return numberValue(det);
}

/**
 * Symbolic determinant — SAME diagonal-first, NO-row-swap elimination
 * strategy as {@link symbolicInverse} (see its own doc comment for why:
 * row-swapping under free-variable pivots has no general "is this bigger"
 * ordering to search by). A pivot that simplifies to the exact constant
 * `0` yields determinant `0` (mathematically correct for a genuinely
 * singular structure); anything else — including a pivot that's an
 * unresolved formula which MIGHT be zero for some assignment — is treated
 * as non-zero and elimination proceeds. This is a disclosed limitation,
 * not full symbolic zero-detection (out of scope — "not a general CAS").
 */
function symbolicDeterminant(m: MatrixData): Value {
	const n = m.rows;
	const a: SymbolicNode[][] = [];
	for (let r = 0; r < n; r++) {
		const row: SymbolicNode[] = [];
		for (let c = 0; c < n; c++) row.push(entryToSymbolic(matAt(m, r, c)));
		a.push(row);
	}
	let det: SymbolicNode = constNode(1);
	for (let col = 0; col < n; col++) {
		const pivot = simplifySymbolic(a[col][col]);
		if (pivot.kind === "const" && pivot.value === 0) return numberValue(0);
		det = simplifySymbolic({ kind: "mul", left: det, right: pivot });
		for (let r = col + 1; r < n; r++) {
			const factor = simplifySymbolic({ kind: "div", left: a[r][col], right: pivot });
			for (let c = col; c < n; c++) {
				a[r][c] = simplifySymbolic({ kind: "sub", left: a[r][c], right: { kind: "mul", left: factor, right: a[col][c] } });
			}
		}
	}
	return det.kind === "const" ? numberValue(det.value) : symbolicValue(det);
}

/** `|a|` / `det(a)` — dispatches to the symbolic or plain-numeric implementation based on `m.hasSymbolic`. */
export function determinant(m: MatrixData): Value {
	if (!isSquare(m)) {
		return errorValue("DETERMINANT_REQUIRES_SQUARE_MATRIX", `det: matrix must be square (got ${m.rows}x${m.cols}).`);
	}
	return m.hasSymbolic ? symbolicDeterminant(m) : numericDeterminant(m);
}

/**
 * `a^-1` / `inv(a)` — Gauss-Jordan elimination with partial pivoting on
 * the augmented `[A | I]` matrix, reducing the left half to the identity
 * while the right half becomes `A`'s inverse. Requires a square, non-
 * singular matrix — a near-zero pivot (below `1e-10`, guarding against
 * floating-point noise rather than requiring an exact zero) means the
 * matrix isn't invertible, reported as a clear error rather than
 * returning `Infinity`-poisoned cells.
 */
function numericInverse(m: MatrixData): Value {
	const n = m.rows;
	const a = toWorkingRows(m);
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) a[r].push(c === r ? 1 : 0);
	}
	for (let col = 0; col < n; col++) {
		let pivotRow = col;
		let maxAbs = Math.abs(a[col][col]);
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(a[r][col]) > maxAbs) { maxAbs = Math.abs(a[r][col]); pivotRow = r; }
		}
		if (maxAbs < 1e-10) {
			return errorValue("SINGULAR_MATRIX", `inv: a ${n}x${n} matrix with a zero (or near-zero) pivot column is not invertible.`);
		}
		if (pivotRow !== col) {
			const tmp = a[col]; a[col] = a[pivotRow]; a[pivotRow] = tmp;
		}
		const pivot = a[col][col];
		for (let c = 0; c < 2 * n; c++) a[col][c] /= pivot;
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = a[r][col];
			if (factor === 0) continue;
			for (let c = 0; c < 2 * n; c++) a[r][c] -= factor * a[col][c];
		}
	}
	const data = new Array<MatrixEntry>(n * n);
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) data[r + c * n] = a[r][n + c];
	}
	return matrixValue(n, n, data);
}

/** Matrices at or beyond this size are rejected for symbolic inversion — see {@link symbolicInverse}'s doc comment. */
const SYMBOLIC_INVERSE_DIMENSION_LIMIT = 9;

/**
 * Symbolic Gauss-Jordan inverse — SAME [A|I] augmented-elimination shape
 * as {@link numericInverse}, but every cell is a `SymbolicNode` and every
 * arithmetic step (divide by pivot, multiply-and-subtract to eliminate a
 * column) goes through `simplifySymbolic()` instead of plain `number` ops.
 *
 * Deliberately uses a DIAGONAL-FIRST pivot strategy with NO row-swapping —
 * a real, disclosed limitation: `numericInverse`'s partial-pivoting
 * searches for the numerically-largest candidate, but there's no general
 * "is this free-variable formula bigger than that one" ordering to search
 * by, so this always pivots on the diagonal entry as-is. A pivot that
 * simplifies to the exact constant `0` is reported as singular/unsolvable
 * via this strategy (a genuinely different structure, or one needing row
 * reordering the caller would have to do manually, produces this error) —
 * this is sufficient for the spec's own already-triangular-friendly
 * example (`s`/`t`'s diagonal entries are never structurally zero).
 *
 * Capped at {@link SYMBOLIC_INVERSE_DIMENSION_LIMIT} — beyond this,
 * expression trees from repeated symbolic elimination steps can grow
 * large enough to make the "not a general CAS" bounded simplifier
 * genuinely slow; the spec's own examples are all well under this size.
 */
function symbolicInverse(m: MatrixData): Value {
	const n = m.rows;
	if (n >= SYMBOLIC_INVERSE_DIMENSION_LIMIT) {
		return errorValue(
			"SYMBOLIC_INVERSE_DIMENSION_LIMIT",
			`Symbolic matrix inversion is limited to matrices smaller than ${SYMBOLIC_INVERSE_DIMENSION_LIMIT}x${SYMBOLIC_INVERSE_DIMENSION_LIMIT} (got ${n}x${n}).`,
		);
	}
	const a: SymbolicNode[][] = [];
	for (let r = 0; r < n; r++) {
		const row: SymbolicNode[] = [];
		for (let c = 0; c < n; c++) row.push(entryToSymbolic(matAt(m, r, c)));
		for (let c = 0; c < n; c++) row.push(constNode(c === r ? 1 : 0));
		a.push(row);
	}
	for (let col = 0; col < n; col++) {
		const pivot = simplifySymbolic(a[col][col]);
		if (pivot.kind === "const" && pivot.value === 0) {
			return errorValue(
				"SYMBOLIC_SINGULAR_OR_UNSUPPORTED_PIVOT",
				`Symbolic inverse: the pivot at row/col ${col} is exactly zero — this matrix's structure isn't invertible via this engine's diagonal-first symbolic elimination (no row-swapping); try reordering rows manually.`,
			);
		}
		for (let c = 0; c < 2 * n; c++) {
			a[col][c] = simplifySymbolic({ kind: "div", left: a[col][c], right: pivot });
		}
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = simplifySymbolic(a[r][col]);
			if (factor.kind === "const" && factor.value === 0) continue;
			for (let c = 0; c < 2 * n; c++) {
				a[r][c] = simplifySymbolic({ kind: "sub", left: a[r][c], right: { kind: "mul", left: factor, right: a[col][c] } });
			}
		}
	}
	const data = new Array<MatrixEntry>(n * n);
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) data[r + c * n] = symbolicToEntry(a[r][n + c]);
	}
	return matrixValue(n, n, data);
}

/** `a^-1` / `inv(a)` — dispatches to the symbolic or plain-numeric implementation based on `m.hasSymbolic`. */
export function inverse(m: MatrixData): Value {
	if (!isSquare(m)) {
		return errorValue("INVERSE_REQUIRES_SQUARE_MATRIX", `inv: matrix must be square (got ${m.rows}x${m.cols}).`);
	}
	return m.hasSymbolic ? symbolicInverse(m) : numericInverse(m);
}

/**
 * Reads a `map`/`reduce` "collection" argument into a flat array of
 * per-cell Values — a Matrix's own cells (column-major order, matching
 * `MAT_INDEX1`'s reading convention) or a Range materialized into its
 * inclusive integer sequence (`0:3` -> `[0,1,2,3]`, matching `map(f,
 * 0:3)`'s spec example). Returns an error Value directly (not thrown) if
 * `v` is neither — same "propagate as a value, don't throw" convention
 * `matrixMultiply`/`matrixCompare` above already use.
 */
export function collectionToValues(v: Value): Value[] | Value {
	if (v.type === ValueType.Error) return v;
	if (v.type === ValueType.Matrix) {
		const m = v.value as MatrixData;
		return m.data.map(matrixEntryToValue);
	}
	if (v.type === ValueType.Range) {
		const r = v.value as RangeData;
		const out: Value[] = [];
		for (let i = r.min; i <= r.max; i++) out.push(numberValue(i));
		return out;
	}
	return errorValue(
		"MAP_REDUCE_REQUIRES_COLLECTION",
		`map/reduce requires a Matrix or Range collection (e.g. "[1,2,3]" or "0:3").`,
	);
}
