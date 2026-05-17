export class PluginEventBus {
	private listeners: { [event: number]: ((...args: any[]) => void)[] } = {};

	public on(event: number, callback: (...args: any[]) => void) {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(callback);
	}

	public emit(event: number, ...args: any[]) {
		const callbacks = this.listeners[event];
		if (callbacks) {
			callbacks.forEach((callback) => callback(...args));
		}
	}

	public removeListener(event: number, callback: (...args: any[]) => void) {
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
