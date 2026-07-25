/**
 * PageManager — page-based LRU eviction + directional preloading.
 *
 * Groups document lines into fixed-size pages (128 lines each) and manages
 * three temperature tiers:
 *   • Hot  (viewport ± 3 pages): Keep bytecode + results
 *   • Warm (viewport ± 6 pages): Keep bytecode, evict results
 *   • Cold (beyond ± 6 pages): Evict bytecode + results (except variable defs)
 *
 * Variable definition bytecode is **never evicted** because it forms the
 * backbone of the dependency graph and VM checkpoints.
 *
 * Preloading: When the user scrolls in a consistent direction, the next
 * 1–2 pages are pre-compiled via the background worker so bytecode is
 * cache-hot by the time those lines scroll into view.
 *
 * Usage:
 *   const pm = new PageManager();
 *   // After evaluation:
 *   pm.maintainAfterEval(viewport, doc);
 *   // After scroll (viewport-only change):
 *   pm.maintainAfterEval(viewport, doc);
 *   const targets = pm.getPreloadTargets(viewport, doc);
 *   // dispatch targets to compilation worker
 */

import { DocumentModel } from "@solve-js/engine/DocumentModel";
import { sharedLexer } from "@solve-js/lexer/Lexer";

// ── Constants ────────────────────────────────────────────────────────────

/** Number of lines per page. Tunable — 128 balances granularity with overhead. */
export const PAGE_SIZE = 128;

/** Number of pages on each side of the viewport considered "hot." */
const HOT_PAGE_RADIUS = 3;

/** Number of pages on each side of the viewport considered "warm" (includes hot). */
const WARM_PAGE_RADIUS = 6;

/** Number of pages to preload ahead of the scroll direction. */
const PRELOAD_PAGE_COUNT = 2;

/**
 * Pages just beyond the warm range that are "newly cold" — they were warm
 * on the previous scroll and now need bytecode eviction. Once evicted, they
 * stay cold and don't need re-eviction on subsequent frames (the inner
 * `evictPageBytecode` checks for non-null bytecode and short-circuits).
 *
 * This buffer lets us skip iterating the vast majority of cold pages on
 * every scroll, reducing `maintainAfterEval` from O(total pages) to
 * O(hot + warm + buffer) ≈ O(1) for any document size.
 */
const COLD_EVICT_BUFFER = HOT_PAGE_RADIUS;

// ── PageManager ──────────────────────────────────────────────────────────

export class PageManager {
	/** Previous viewport for scroll direction detection. null = no previous viewport. */
	private lastViewportStart: number | null = null;

	/** Saved scroll direction from the most recent maintainAfterEval call. */
	private savedDirection: "down" | "up" | null = null;

	/** Per-page access counter for LRU tracking. */
	private pageAccess: Map<number, number> = new Map();

	/** Monotonically increasing access sequence number. */
	private accessSeq = 0;

	// ── Static helpers ─────────────────────────────────────────────────

	/** Get the page number for a 1-based line number (0-based page index). */
	static pageForLine(lineNumber: number): number {
		return Math.floor((lineNumber - 1) / PAGE_SIZE);
	}

	/** Get the 1-based inclusive line range for a page. */
	static pageRange(
		pageNum: number,
		docLineCount: number
	): { startLine: number; endLine: number } {
		return {
			startLine: pageNum * PAGE_SIZE + 1,
			endLine: Math.min((pageNum + 1) * PAGE_SIZE, docLineCount),
		};
	}

	// ── Public API ─────────────────────────────────────────────────────

	/**
	 * Detect scroll direction from viewport movement.
	 * Returns null on first call (no previous viewport) or no movement.
	 */
	detectDirection(newViewport: { startLine: number }): "down" | "up" | null {
		if (this.lastViewportStart === null) return null;
		if (newViewport.startLine > this.lastViewportStart) return "down";
		if (newViewport.startLine < this.lastViewportStart) return "up";
		return null;
	}

	/**
	 * Maintain page tiers after evaluation.
	 *
	 * 1. Records the new viewport position
	 * 2. Touches hot pages (viewport ± HOT_PAGE_RADIUS) for LRU
	 * 3. Evicts cold/warm pages based on distance from viewport
	 *
	 * Call this after every `evaluate()`, `setViewport()`, or `evaluateAll()`.
	 */
	maintainAfterEval(
		viewport: { startLine: number; endLine: number },
		doc: DocumentModel
	): void {
		// ── Capture direction BEFORE updating lastViewportStart ───
		this.savedDirection = this.detectDirection(viewport);
		this.lastViewportStart = viewport.startLine;

		const docLineCount = doc.lineCount;
		const viewportStartPage = PageManager.pageForLine(viewport.startLine);
		const viewportEndPage = PageManager.pageForLine(viewport.endLine);
		const lastPage = PageManager.pageForLine(docLineCount);

		// Compute hot/warm page ranges in O(1) using range math:
		// A page is within RADIUS of the viewport span iff it falls in
		// [viewportStartPage - RADIUS, viewportEndPage + RADIUS].
		const hotStart = Math.max(0, viewportStartPage - HOT_PAGE_RADIUS);
		const hotEnd = Math.min(lastPage, viewportEndPage + HOT_PAGE_RADIUS);
		const warmStart = Math.max(0, viewportStartPage - WARM_PAGE_RADIUS);
		const warmEnd = Math.min(lastPage, viewportEndPage + WARM_PAGE_RADIUS);

		// Touch hot pages to keep them fresh in LRU
		for (let p = hotStart; p <= hotEnd; p++) {
			this.touchPage(p);
		}

		// Evict warm-but-not-hot pages: keep bytecode, evict results only
		for (let p = warmStart; p <= warmEnd; p++) {
			if (p >= hotStart && p <= hotEnd) continue;
			this.evictPageResults(p, doc, docLineCount);
		}

		// Evict "newly cold" pages: a buffer zone just outside the warm
		// range. Pages beyond this buffer were already evicted on prior
		// scrolls and don't need re-eviction.
		// ── Left side (just above page 0, just below warm range) ──
		const coldLeftEnd = warmStart - 1;
		const coldLeftStart = Math.max(0, coldLeftEnd - COLD_EVICT_BUFFER + 1);
		for (let p = coldLeftStart; p <= coldLeftEnd; p++) {
			this.evictPageBytecode(p, doc, docLineCount);
		}
		// ── Right side (just above warm range, just below lastPage) ──
		const coldRightStart = warmEnd + 1;
		const coldRightEnd = Math.min(lastPage, coldRightStart + COLD_EVICT_BUFFER - 1);
		for (let p = coldRightStart; p <= coldRightEnd; p++) {
			this.evictPageBytecode(p, doc, docLineCount);
		}
	}

	/**
	 * Get lines ahead of the viewport that should be pre-compiled.
	 *
	 * Looks PRELOAD_PAGE_COUNT pages ahead of the current scroll direction.
	 * Only returns lines that are dirty, don't already have bytecode,
	 * and are not empty/markdown-only.
	 *
	 * @param viewport The current viewport.
	 * @param doc The document model.
	 * @returns Items ready to send to the compilation worker.
	 */
	getPreloadTargets(
		viewport: { startLine: number; endLine: number },
		doc: DocumentModel
	): Array<{ lineId: number; expression: string; textHash: number }> {
		// Use the direction saved by the last maintainAfterEval call.
		// We cannot re-detect because maintainAfterEval already updated
		// lastViewportStart to the current viewport position.
		const direction = this.savedDirection;
		if (!direction) return [];

		const items: Array<{ lineId: number; expression: string; textHash: number }> = [];
		// Use viewport end page for downward preload start, start page for upward.
		// This ensures we preload *beyond* the full viewport span, not just its start.
		const viewportEndPage = PageManager.pageForLine(viewport.endLine);
		const viewportStartPage = PageManager.pageForLine(viewport.startLine);
		const lastPage = PageManager.pageForLine(doc.lineCount);

		const pages: number[] = [];
		if (direction === "down") {
			// Preload pages immediately after the viewport's hot radius beyond its end
			const startPage = viewportEndPage + HOT_PAGE_RADIUS + 1;
			const endPage = Math.min(startPage + PRELOAD_PAGE_COUNT - 1, lastPage);
			for (let p = startPage; p <= endPage && p <= lastPage; p++) {
				pages.push(p);
			}
		} else {
			// Preload pages immediately before the viewport's hot radius before its start
			const firstPreloadPage = viewportStartPage - HOT_PAGE_RADIUS - 1;
			for (let p = firstPreloadPage; p > firstPreloadPage - PRELOAD_PAGE_COUNT && p >= 0; p--) {
				pages.push(p);
			}
		}

		for (const pageNum of pages) {
			const range = PageManager.pageRange(pageNum, doc.lineCount);
			for (let pos = range.startLine; pos <= range.endLine; pos++) {
				const state = doc.getLineAt(pos);
				if (!state) continue;
				if (!state.dirty) continue;
				if (state.bytecodes.length > 0 && !state.isVariableDef) continue;
				if (state.isEmpty) continue;

				// Extract expressions using the shared lexer to handle inline
				// solves (s`...`). For full-line expressions, this returns [text].
				// For inline solve lines, this returns each extracted expression.
				if (state.expressions.length > 0) {
					// Use pre-extracted expressions (from prior evaluation)
					for (const expression of state.expressions) {
						if (!expression.trim()) continue;
						items.push({
							lineId: state.lineId,
							expression,
							textHash: state.textHash,
						});
					}
				} else {
					// Expressions not yet extracted — use lexer to find inline solves
					const inlineSpans = sharedLexer.findInlineSolves(state.text);
					if (inlineSpans.length > 0) {
						for (const span of inlineSpans) {
							if (!span.expression.trim()) continue;
							items.push({
								lineId: state.lineId,
								expression: span.expression,
								textHash: state.textHash,
							});
						}
					} else {
						// Full-line expression
						const expression = state.text.trim();
						if (expression) {
							items.push({
								lineId: state.lineId,
								expression,
								textHash: state.textHash,
							});
						}
					}
				}
			}
		}

		return items;
	}

	/**
	 * Reset internal state (e.g., after document switch).
	 */
	clear(): void {
		this.pageAccess.clear();
		this.accessSeq = 0;
		this.lastViewportStart = null;
		this.savedDirection = null;
	}

	// ── Private helpers ─────────────────────────────────────────────────

	/** Record a page access with a monotonic sequence number. */
	private touchPage(pageNum: number): void {
		this.pageAccess.set(pageNum, ++this.accessSeq);
	}

	/**
	 * Evict results from all non-variable-def lines in a page.
	 * Bytecode is preserved so Tier 2 execution works on scroll-back.
	 */
	private evictPageResults(
		pageNum: number,
		doc: DocumentModel,
		docLineCount: number
	): void {
		const range = PageManager.pageRange(pageNum, docLineCount);
		for (let pos = range.startLine; pos <= range.endLine; pos++) {
			const state = doc.getLineAt(pos);
			if (state && !state.isVariableDef && state.results.length > 0) {
				state.results = [];
				state.result = null;
			}
		}
	}

	/**
	 * Evict bytecode + results from all non-variable-def lines in a page.
	 * Variable definition bytecode is **never** evicted — it forms the
	 * backbone of the DAG and VM checkpoints.
	 *
	 * Evicted lines are marked dirty so they get Tier 1 re-evaluation
	 * when scrolled back into view.
	 */
	private evictPageBytecode(
		pageNum: number,
		doc: DocumentModel,
		docLineCount: number
	): void {
		const range = PageManager.pageRange(pageNum, docLineCount);
		for (let pos = range.startLine; pos <= range.endLine; pos++) {
			const state = doc.getLineAt(pos);
			if (!state || state.isVariableDef) continue;

			if (state.bytecodes.length > 0 || state.results.length > 0) {
				state.bytecodes = [];
				state.results = [];
				state.result = null;
				doc.markDirty(state.lineId);
			}
		}
	}
}
