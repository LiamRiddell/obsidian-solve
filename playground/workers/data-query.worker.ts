/**
 * Data Query Worker — Vite-compatible version.
 *
 * Mirrors the logic from @solve-js/workers/DataQueryWorker.worker.ts but
 * uses Vite's native module worker support (new Worker(new URL(...), { type: 'module' }))
 * instead of esbuild-plugin-inline-worker.
 *
 * Imports the real strategy classes via the @solve-js alias so the same
 * CurrencyDataSource and HttpDataSource implementations are used.
 */

import { CurrencyDataSource, HttpDataSource } from "@solve-js/workers/DataSourceStrategy";
import type { DataSourceStrategy } from "@solve-js/workers/DataSourceStrategy";
import type { DataSourceConfig, FetchRequest, FetchResponse } from "@solve-js/workers/DataSourceStrategy";

class DataQueryWorkerInternal {
	public strategies: Map<string, DataSourceStrategy> = new Map();
	public activeRequests: Set<string> = new Set();

	postMessage(message: unknown): void {
		self.postMessage(message);
	}

	handleRegisterDataSource(payload: unknown): void {
		const config = payload as DataSourceConfig;
		let strategy: DataSourceStrategy;

		switch (config.type) {
			case "currency":
				strategy = new CurrencyDataSource(config.endpoint || "");
				break;
			case "http":
				strategy = new HttpDataSource(config);
				break;
			default:
				self.postMessage({
					type: "FETCH_ERROR",
					payload: { id: -1, error: `Unknown data source type: ${config.type}` },
				});
				return;
		}

		this.strategies.set(config.id, strategy);
		self.postMessage({
			type: "DATA_SOURCE_REGISTERED",
			payload: { config },
		});
	}

	async handleFetchRequest(payload: unknown): Promise<void> {
		const request = payload as FetchRequest;
		this.activeRequests.add(request.id);

		const strategy = this.strategies.get(request.dataSourceId);
		if (!strategy) {
			self.postMessage({
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
			self.postMessage({
				type: "FETCH_RESPONSE",
				payload: response,
			});
		} catch (error) {
			self.postMessage({
				type: "FETCH_ERROR",
				payload: {
					id: request.id,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		}
		this.activeRequests.delete(request.id);
	}

	handleUnregisterDataSource(payload: { dataSourceId: string }): void {
		const { dataSourceId } = payload;
		this.strategies.delete(dataSourceId);
	}

	handleGetStatus(): void {
		self.postMessage({
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
