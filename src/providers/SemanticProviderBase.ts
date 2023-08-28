import { ProviderBase } from "@/providers/ProviderBase";

export class SemanticProviderBase<T> extends ProviderBase {
	semantics: T;

	constructor(name: string) {
		super(name);
	}
}
