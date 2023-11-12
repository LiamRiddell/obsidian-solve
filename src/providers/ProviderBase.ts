import { PluginEventBus } from "@/eventbus/PluginEventBus";
import { IProvider } from "@/providers/IProvider";
import { FormatVisitor } from "@/visitors/format/FormatVisitor";

export class ProviderBase implements IProvider {
	name: string;
	eventBus: PluginEventBus;
	formatVisitor: FormatVisitor;

	constructor(name: string) {
		this.name = name;
		this.formatVisitor = new FormatVisitor();
	}

	public enabled(): boolean {
		throw new Error("Method not implemented.");
	}

	public provide<T = string>(sentence: string, raw: boolean): T | undefined {
		throw new Error("Method not implemented.");
	}
}
