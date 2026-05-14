import { PollingEngine, DataSource, PollingEvent } from "../engine/core/PollingEngine";
import { HttpDataSource } from "../engine/sources/HttpDataSource";

/**
 * Interface for currency rate data from API
 */
interface CurrencyRateData {
	base: string;
	quote: string;
	rate: number;
}

/**
 * Interface for worker messages
 */
interface WorkerMessage {
	type: "update" | "error" | "loading";
	data?: Record<string, number>;
	error?: string;
}

/**
 * Parse Frankfurter API response into a map of currency rates
 * @param response - API response array
 * @returns Map of currency code to rate relative to USD
 */
function parseFrankfurterResponse(response: CurrencyRateData[]): Record<string, number> {
	const rates: Record<string, number> = { USD: 1.0 };
	for (const item of response) {
		rates[item.quote] = item.rate;
	}
	return rates;
}

/**
 * Currency polling worker implementation
 */
class CurrencyPollingWorker {
	private pollingEngine: PollingEngine<Record<string, number>>;
	private dataSource: DataSource<Record<string, number>>;

	constructor() {
		// Create HTTP data source for Frankfurter API
		this.dataSource = new HttpDataSource(
			"https://api.frankfurter.dev/v2/rates?base=USD",
			parseFrankfurterResponse
		);

		// Create polling engine with 30-minute interval
		this.pollingEngine = new PollingEngine(this.dataSource, {
			interval: 30 * 60 * 1000, // 30 minutes
			maxRetries: 5,
			retryDelay: 1000,
			backoffMultiplier: 2,
		});

		// Set up event listener to post updates to main thread
		this.pollingEngine.onEvent((event: PollingEvent<Record<string, number>>) => {
			switch (event.type) {
				case "DATA_FETCH_STARTED":
					this.postMessage({ type: "loading" });
					break;
				case "DATA_FETCH_COMPLETE":
					if (event.data) {
						this.postMessage({ type: "update", data: event.data });
					}
					break;
				case "DATA_FETCH_ERROR":
					this.postMessage({ type: "error", error: event.error });
					break;
			}
		});
	}

	/**
	 * Start the polling engine
	 */
	start(): void {
		this.pollingEngine.start();
	}

	/**
	 * Stop the polling engine
	 */
	stop(): void {
		this.pollingEngine.stop();
	}

	/**
	 * Post a message to the main thread
	 */
	private postMessage(message: WorkerMessage): void {
		// In a worker context, we use self.postMessage
		// This will be mocked in tests
		if (typeof self !== "undefined" && self.postMessage) {
			self.postMessage(message);
		}
	}
}

/**
 * Initialize the worker when loaded in a Web Worker context
 */
const worker = new CurrencyPollingWorker();

// Handle messages from main thread
if (typeof self !== "undefined") {
	self.onmessage = (event: MessageEvent<string>) => {
		if (event.data === "start") {
			worker.start();
		} else if (event.data === "stop") {
			worker.stop();
		}
	};

	// Start polling immediately
	worker.start();
}
