/**
 * Data query worker - runs HTTP fetch operations in a background thread.
 * Bundled by esbuild-plugin-inline-worker into a Blob URL at build time.
 *
 * Message protocol:
 *   Main → Worker: { type: "REGISTER_DATA_SOURCE", payload: DataSourceConfig }
 *   Main → Worker: { type: "FETCH_REQUEST", payload: FetchRequest }
 *   Main → Worker: { type: "UNREGISTER_DATA_SOURCE", payload: { dataSourceId } }
 *   Main → Worker: { type: "GET_STATUS" }
 *   Main → Worker: { type: "TERMINATE" }
 *
 *   Worker → Main: { type: "FETCH_RESPONSE", payload: FetchResponse }
 *   Worker → Main: { type: "FETCH_ERROR", payload: { id, error } }
 *   Worker → Main: { type: "DATA_SOURCE_REGISTERED", payload: { config } }
 *   Worker → Main: { type: "STATUS_RESPONSE", payload: StatusPayload }
 */
// @ts-ignore — Worker global is available at runtime
const self = this;

import type { DataSourceStrategy } from "./DataSourceStrategy";
import type { DataSourceConfig, FetchRequest, FetchResponse } from "./DataSourceStrategy";

class DataQueryWorkerInternal {
	private strategies: Map<string, DataSourceStrategy> = new Map();
	private activeRequests: Set<string> = new Set();

	postMessage(message: any): void {
		self.postMessage(message);
	}

	handleRegisterDataSource(payload: any): void {
		const config = payload as import("./DataSourceStrategy").DataSourceConfig;
		let strategy: DataSourceStrategy;

		switch (config.type) {
			case "currency":
				strategy = new (DataSourceStrategy as any).CurrencyDataSource(config.endpoint || "");
				break;
			case "http":
				strategy = new (DataSourceStrategy as any).HttpDataSource(config);
				break;
			default:
				this.postMessage({
					type: "FETCH_ERROR",
					payload: { id: -1, error: `Unknown data source type: ${config.type}` },
				});
				return;
		}

		this.strategies.set(config.id, strategy);
		this.postMessage({
			type: "DATA_SOURCE_REGISTERED",
			payload: { config },
		});
	}

	async handleFetchRequest(payload: any): Promise<void> {
		const request = payload as import("./DataSourceStrategy").FetchRequest;
		this.activeRequests.add(request.id);

		const strategy = this.strategies.get(request.dataSourceId);
		if (!strategy) {
			this.postMessage({
				type: "FETCH_ERROR",
				payload: {
					id: request.id,
					error: `No strategy for data source: ${request.dataSourceId}`,
				},
			});
			this.activeRequests.delete(request.id);
			return;
		}

		try {
			const response = await strategy.execute(request);
			this.postMessage({
				type: "FETCH_RESPONSE",
				payload: response,
			});
		} catch (error) {
			this.postMessage({
				type: "FETCH_ERROR",
				payload: {
					id: request.id,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		}
		this.activeRequests.delete(request.id);
	}

	handleUnregisterDataSource(payload: any): void {
		const { dataSourceId } = payload;
		this.strategies.delete(dataSourceId);
	}

	handleGetStatus(): void {
		this.postMessage({
			type: "STATUS_RESPONSE",
			payload: {
				activeRequests: Array.from(this.activeRequests),
				dataSources: Array.from(this.strategies.keys()),
			},
		});
	}
}

const worker = new DataQueryWorkerInternal();

self.onmessage = (event: MessageEvent) => {
	const { type, payload, id } = event.data;

	switch (type) {
		case "REGISTER_DATA_SOURCE":
			worker.handleRegisterDataSource(payload);
			break;
		case "FETCH_REQUEST":
			worker.handleFetchRequest(payload);
			break;
		case "UNREGISTER_DATA_SOURCE":
			worker.handleUnregisterDataSource(payload);
			break;
		case "GET_STATUS":
			worker.handleGetStatus();
			break;
		case "TERMINATE":
			worker.strategies.clear();
			worker.activeRequests.clear();
			if (id != null) {
				self.postMessage({ id, type: "RESULT", payload: { ok: true } });
			}
			break;
		default:
			self.postMessage({ id: id ?? -1, type: "ERROR", error: `Unknown message type: ${type}` });
	}
};