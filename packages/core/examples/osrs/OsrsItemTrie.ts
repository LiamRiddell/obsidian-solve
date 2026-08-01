import type { Token } from "@solve-js/lexer/Token";
import type { OsrsItem } from "./types";

interface TrieNode {
  children: Map<string, TrieNode>;
  item?: OsrsItem;
}

export class OsrsItemTrie {
  private root: TrieNode = { children: new Map() };

  constructor(items: OsrsItem[]) {
    for (const item of items) {
      this.insert(item);
    }
  }

  private insert(item: OsrsItem): void {
    const words = item.nameLower.split(" ");
    let node = this.root;
    for (const word of words) {
      let child = node.children.get(word);
      if (!child) {
        child = { children: new Map() };
        node.children.set(word, child);
      }
      node = child;
    }
    if (!node.item) {
      node.item = item;
    }
  }

  longestMatch(
    tokens: Token[],
    startIdx: number,
  ): { item: OsrsItem; wordCount: number } | null {
    let node = this.root;
    let lastMatch: { item: OsrsItem; wordCount: number } | null = null;
    let i = startIdx;

    while (i < tokens.length) {
      const token = tokens[i];
      if (token.type !== "IDENT") break;

      const word = token.value.toLowerCase();
      const child = node.children.get(word);
      if (!child) break;

      node = child;
      i++;

      if (node.item) {
        lastMatch = { item: node.item, wordCount: i - startIdx };
      }
    }

    return lastMatch;
  }
}
