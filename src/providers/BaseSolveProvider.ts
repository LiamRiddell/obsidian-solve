import { PluginEventBus } from "@/PluginEventBus";
import { ISolveProvider } from "@/providers/ISolveProvider";

export class BaseSolveProvider implements ISolveProvider {
	name: string;
	eventBus: PluginEventBus;

	constructor() {}

	public provide(sentence: string, raw: boolean): string | undefined {
		throw new Error("Method not implemented.");
	}
}
