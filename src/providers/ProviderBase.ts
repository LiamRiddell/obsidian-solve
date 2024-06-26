import { PluginEventBus } from "@/eventbus/PluginEventBus";
import { IProvider } from "@/providers/IProvider";
import { IResult } from "@/results/definition/IResult";

export class ProviderBase implements IProvider {
	name: string;
	eventBus: PluginEventBus;
	cacheable: boolean;

	constructor(name: string) {
		this.name = name;
		this.cacheable = true;
	}

	public enabled(): boolean {
		throw new Error("Method not implemented.");
	}

	public provide<T = IResult<any>>(expression: string): T | undefined {
		throw new Error("Method not implemented.");
	}
}
