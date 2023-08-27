import { PluginEventBus } from "@/PluginEventBus";
import { ISolveProvider } from "@/providers/ISolveProvider";
import { FormatVisitor } from "@/visitors/FormatVisitor";

export class BaseSolveProvider<T> implements ISolveProvider {
	name: string;
	eventBus: PluginEventBus;
	semantics: T;
	formatVisitor: FormatVisitor;

	constructor() {
		this.formatVisitor = new FormatVisitor();
	}

	public provide(sentence: string, raw: boolean): string | undefined {
		throw new Error("Method not implemented.");
	}
}
