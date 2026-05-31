/**
 * Lightweight typed event bus for intra-plugin communication.
 *
 * Supports {@link EPluginEvent}-keyed listeners with `on`, `emit`,
 * `removeListener`, and `removeAllListeners`. A singleton instance
 * is exported as `pluginEventBus`.
 */
export class PluginEventBus {
	private listeners: { [event: number]: ((...args: unknown[]) => void)[] } = {};

	public on(event: number, callback: (...args: unknown[]) => void) {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(callback);
	}

	public emit(event: number, ...args: unknown[]) {
		const callbacks = this.listeners[event];
		if (callbacks) {
			callbacks.forEach((callback) => callback(...args));
		}
	}

	public removeListener(event: number, callback: (...args: unknown[]) => void) {
		const callbacks = this.listeners[event];
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index !== -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	public removeAllListeners() {
		this.listeners = {};
	}
}

export const pluginEventBus = new PluginEventBus();
