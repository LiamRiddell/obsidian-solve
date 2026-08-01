export {
	LanguageService,
	type SemanticToken,
	type LanguageServiceOptions,
	type CompletionItem,
} from "./LanguageService";
export type { TokenCategory } from "./TokenCategory";
export {
	getTokenCategory,
	registerTokenCategory,
	unregisterTokenCategory,
	UNCATEGORIZED_TOKEN_TYPES,
} from "./TokenCategoryMap";
export { categoryClassName, completionItemToOption } from "./adapters/codemirror";
