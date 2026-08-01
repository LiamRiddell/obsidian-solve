//#region ─── Module Overview ───────────────────────────────────────────────────

/**
 * PhraseTrie — optimized word-level trie for multi-word phrase fusion.
 *
 * ## Problem
 * The normalizer previously applied N separate `phraseFusionRule` instances,
 * each scanning forward from the current token position. For R phrase rules
 * and W average phrase length, this cost O(N × R × W) per pass.
 *
 * ## Solution
 * A single trie walk per position collapses all phrase rules into O(D)
 * where D ≤ longest phrase depth (typically ≤ 5 words). The trie tracks
 * the deepest terminal node reached, implementing longest-match-wins
 * without priority sorting.
 *
 * ## Optimizations
 * 1. **Set<string> quick-reject** — the `startWords` set contains the first
 *    word of every registered phrase. At each position, if the token's
 *    lowercase value isn't in the set, we bail in O(1) without touching
 *    the trie. ~80% of tokens (numbers, operators) hit this fast path.
 * 2. **Longest-match-wins** — the `matchAt()` walk continues past terminal
 *    nodes, tracking the deepest one. Shorter overlapping phrases (e.g.,
 *    "power of") don't need lower priority — the trie naturally prefers
 *    the longer match.
 * 3. **Map-based children** — `Map<string, TrieNode>` gives O(1) amortized
 *    child lookup per word, faster than array scanning for sparse branches.
 *
 * ## Package integration
 * Packages add phrases via {@link TokenNormalizer.addPhrase} (public API)
 * or the {@link IEnginePackage.phrases} declarative field. Each call to
 * `addPhrase()` inserts the phrase into this trie and updates `startWords`.
 *
 * @module PhraseTrie
 */

//#endregion
//#region ─── Imports ──────────────────────────────────────────────────────────

import type { Token } from "@solve-js/lexer/Token";
import type { NormalizerMatch } from "./NormalizerRule";
import { createFusedToken } from "./TokenNormalizer";

//#endregion
//#region ─── TrieNode ─────────────────────────────────────────────────────────

/**
 * Internal trie node.
 *
 * Each node represents a matched word in a phrase. The path from root
 * to a node spells out a partial or complete phrase.
 */
interface TrieNode {
	/** Child nodes keyed by next word (all lowercase). */
	children: Map<string, TrieNode>;
	/**
	 * If this node completes a phrase, the terminal metadata.
	 * A node can be both terminal AND have children — this handles
	 * overlapping phrases like "power of" and "to the power of".
	 */
	terminal: TrieTerminal | null;
}

/** Metadata stored at terminal nodes for deferred token creation. */
interface TrieTerminal {
	/** The target token type after fusion (e.g., "CARET", "TIMES_BY"). */
	tokenType: string;
	/** The original phrase string (e.g., "to the power of"). */
	phrase: string;
	/** Number of tokens consumed by this phrase. */
	consumed: number;
}

//#endregion
//#region ─── PhraseTrie ─────────────────────────────────────────────────────

/**
 * Word-level trie for single-pass multi-word phrase matching.
 *
 * @example
 * ```ts
 * const trie = new PhraseTrie();
 * trie.addPhrase("to the power of", "CARET");
 * trie.addPhrase("power of", "CARET");
 * trie.addPhrase("abyssal whip", "ITEM");
 *
 * // At position 0 with tokens ["to","the","power","of","3"]
 * const match = trie.matchAt(tokens, 0);
 * // → { consumed: 4, replacement: [CARET("to the power of")] }
 * ```
 */
export class PhraseTrie {
	/**
	 * First words that can start any registered phrase (all lowercase).
	 * O(1) quick-reject: if `tokens[pos].value.toLowerCase()` isn't here,
	 * no phrase can match at this position.
	 */
	private startWords = new Set<string>();

	/**
	 * Root maps first word → child node.
	 * Two-level root avoids an unnecessary intermediate TrieNode.
	 */
	private root = new Map<string, TrieNode>();

	// ── Registration ──────────────────────────────────────────────────────

	/**
	 * Register a phrase for fusion into a single compound token.
	 *
	 * @param phrase    - Multi-word phrase (e.g., "to the power of")
	 * @param tokenType - Target token type after fusion (e.g., "CARET")
	 */
	addPhrase(phrase: string, tokenType: string): void {
		const words = phrase.toLowerCase().trim().split(/\s+/);
		if (words.length === 0 || words[0] === "") return;

		this.startWords.add(words[0]);

		const firstWord = words[0];
		let node: TrieNode;

		if (this.root.has(firstWord)) {
			node = this.root.get(firstWord)!;
		} else {
			node = { children: new Map(), terminal: null };
			this.root.set(firstWord, node);
		}

		// Single-word phrase: terminal at root's child
		if (words.length === 1) {
			node.terminal = { tokenType, phrase, consumed: 1 };
			return;
		}

		// Walk/insert remaining words
		for (let i = 1; i < words.length; i++) {
			const word = words[i];
			if (!node.children.has(word)) {
				node.children.set(word, { children: new Map(), terminal: null });
			}
			node = node.children.get(word)!;
		}

		node.terminal = { tokenType, phrase, consumed: words.length };
	}

	// ── Matching ──────────────────────────────────────────────────────────

	/**
	 * Attempt to match a phrase starting at `pos` in the token stream.
	 *
	 * Walks the trie one token at a time, tracking the deepest terminal
	 * node reached. Returns the longest match found, or `null` if no
	 * phrase starts at this position.
	 *
	 * @param tokens - The current token stream
	 * @param pos    - Position to attempt matching from
	 * @returns The longest {@link NormalizerMatch}, or `null` on no match
	 */
	matchAt(tokens: Token[], pos: number): NormalizerMatch | null {
		// ── Bounds guard ──
		if (pos >= tokens.length) return null;

		// ── O(1) quick-reject: first word not a phrase starter ──
		const firstWord = tokens[pos].value.toLowerCase();
		if (!this.startWords.has(firstWord)) return null;

		// ── Walk trie, tracking deepest terminal ──
		let node: TrieNode | undefined = this.root.get(firstWord);
		if (!node) return null;

		let best: NormalizerMatch | null = null;
		let depth = 1;

		// Check single-word phrase at first node
		if (node.terminal) {
			const sourceTokens = tokens.slice(pos, pos + 1);
			best = {
				consumed: 1,
				replacement: [createFusedToken(node.terminal.tokenType, node.terminal.phrase, sourceTokens)],
				ruleName: node.terminal.phrase,
			};
		}

		// Walk deeper for multi-word phrases
		for (let i = pos + 1; i < tokens.length && node?.children; i++) {
			const word = tokens[i].value.toLowerCase();
			node = node.children.get(word);
			if (!node) break; // dead end
			depth++;

			if (node.terminal) {
				// Deferred fused-token creation — only on deepest match found
				const sourceTokens = tokens.slice(pos, pos + depth);
				best = {
					consumed: depth,
					replacement: [
						createFusedToken(node.terminal.tokenType, node.terminal.phrase, sourceTokens),
					],
					ruleName: node.terminal.phrase,
				};
			}
		}

		return best;
	}

	// ── Introspection ─────────────────────────────────────────────────────

	/** Number of unique first words (not total phrases). */
	get size(): number {
		return this.root.size;
	}

	/**
	 * Return all registered phrases and their target token types.
	 *
	 * Used by diagnostic mode to expose the complete trie structure to the
	 * playground's NormalizerTab for rendering ALL registered phrases
	 * (not just the ones that matched in this evaluation).
	 */
	getAllPhrases(): Record<string, string> {
		const result: Record<string, string> = {};

		const collect = (node: TrieNode, path: string[]): void => {
			if (node.terminal) {
				result[path.join(' ')] = node.terminal.tokenType;
			}
			for (const [word, child] of node.children) {
				collect(child, [...path, word]);
			}
		};

		for (const [firstWord, node] of this.root) {
			collect(node, [firstWord]);
		}

		return result;
	}

	/** Check if any phrase starts with this word (case-insensitive). */
	canStart(word: string): boolean {
		return this.startWords.has(word.toLowerCase());
	}
}

//#endregion
