import { PluginEventBus } from "@/eventbus/PluginEventBus";
import { IProvider } from "@/providers/IProvider";
import { FormatVisitor } from "@/visitors/FormatVisitor";

export class ProviderBase implements IProvider {
	name: string;
	eventBus: PluginEventBus;
	formatVisitor: FormatVisitor;

	constructor(name: string) {
		this.name = name;
		this.formatVisitor = new FormatVisitor();
	}

	public provide(sentence: string, raw: boolean): string | undefined {
		throw new Error("Method not implemented.");
	}
}
