export { SolveLanguageService, type SemanticToken, type SolveLanguageServiceOptions } from "./SolveLanguageService";
export type { SolveTokenCategory } from "./SolveTokenCategory";
export {
	getTokenCategory,
	registerTokenCategory,
	unregisterTokenCategory,
	UNCATEGORIZED_TOKEN_TYPES,
} from "./TokenCategoryMap";
export { categoryClassName } from "./adapters/codemirror";
