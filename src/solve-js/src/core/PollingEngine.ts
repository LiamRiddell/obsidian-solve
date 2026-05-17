/**
 * Event types for polling engine lifecycle
 */
export type PollingEventType =
	| "DATA_FETCH_STARTED"
	| "DATA_FETCH_COMPLETE"
	| "DATA_FETCH_ERROR"
	| "STATE_CHANGED";

/**
 * Event payload interface
 */
export interface PollingEvent<T> {
	type: PollingEventType;
	timestamp: number;
	data?: T;
	error?: string;
}

/**
 * Event callback type
 */
export type EventCallback<T> = (event: PollingEvent<T>) => void;

/**
 * Configuration for polling engine
 */
export interface PollingConfig {
	/** Interval in milliseconds between polls */
	interval: number;
	/** Maximum number of retry attempts before giving up */
	maxRetries: number;
	/** Initial delay in milliseconds before retry */
	retryDelay: number;
	/** Multiplier for exponential backoff */
	backoffMultiplier: number;
}

/**
 * Interface for data sources that can be polled
 */
export interface DataSource<T> {
	/** Fetch data from the source */
	fetch(): Promise<T>;
	/** Get the type of the data source */
	getType(): "http" | "websocket" | "sse";
}

/**
 * State machine for polling engine
 */
export interface PollingState {
	isFetching: boolean;
	lastFetchTime: number | null;
	lastSuccessTime: number | null;
	errorCount: number;
	lastError: string | null;
}

/**
 * Generic polling engine with event-driven architecture and nullable state
 */
export class PollingEngine<T> {
	private config: PollingConfig;
	private dataSource: DataSource<T>;
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private retryCount = 0;
	private isRunning = false;
	private callbacks: EventCallback<T>[] = [];

	// Nullable state - starts as null until first successful fetch
	private currentData: T | null = null;
	private state: PollingState = {
		isFetching: false,
		lastFetchTime: null,
		lastSuccessTime: null,
		errorCount: 0,
		lastError: null,
	};

	/**
	 * Creates a new PollingEngine instance.
	 * @param dataSource - The data source to poll
	 * @param config - Configuration options for polling
	 */
	constructor(dataSource: DataSource<T>, config: Partial<PollingConfig> = {}) {
		this.dataSource = dataSource;
		this.config = {
			interval: config.interval ?? 30 * 60 * 1000,
			maxRetries: config.maxRetries ?? 5,
			retryDelay: config.retryDelay ?? 1000,
			backoffMultiplier: config.backoffMultiplier ?? 2,
		};
	}

	/**
	 * Get current data (nullable)
	 */
	get data(): T | null {
		return this.currentData;
	}

	/**
	 * Get current state
	 */
	get currentState(): PollingState {
		return { ...this.state };
	}

	/**
	 * Check if data is available
	 */
	get hasData(): boolean {
		return this.currentData !== null;
	}

	/**
	 * Start the polling engine
	 */
	start(): void {
		if (this.isRunning) return;
		this.isRunning = true;

		// Start polling immediately if we don't have data
		if (!this.hasData) {
			this.poll();
		}

		// Set up regular polling interval
		this.intervalId = setInterval(() => {
			if (!this.state.isFetching) {
				this.poll();
			}
		}, this.config.interval);
	}

	/**
	 * Stop the polling engine
	 */
	stop(): void {
		this.isRunning = false;
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	/**
	 * Register an event callback
	 */
	onEvent(callback: EventCallback<T>): void {
		this.callbacks.push(callback);
	}

	/**
	 * Remove an event callback
	 */
	removeEventCallback(callback: EventCallback<T>): void {
		const index = this.callbacks.indexOf(callback);
		if (index > -1) {
			this.callbacks.splice(index, 1);
		}
	}

	/**
	 * Trigger an immediate poll (non-blocking)
	 */
	triggerPoll(): void {
		if (!this.state.isFetching && this.isRunning) {
			this.poll();
		}
	}

	/**
	 * Perform a single poll operation
	 * This is non-blocking - it returns immediately
	 */
	private poll(): void {
		// Update state
		this.state.isFetching = true;
		this.state.lastFetchTime = Date.now();

		// Emit fetch started event
		this.emitEvent({
			type: "DATA_FETCH_STARTED",
			timestamp: Date.now(),
		});

		// Start async fetch
		this.fetchData();
	}

	/**
	 * Async fetch implementation
	 */
	private async fetchData(): Promise<void> {
		try {
			const data = await this.dataSource.fetch();
			this.retryCount = 0;

			// Update data and state
			this.currentData = data;
			this.state.isFetching = false;
			this.state.lastSuccessTime = Date.now();
			this.state.errorCount = 0;
			this.state.lastError = null;

			// Emit success event
			this.emitEvent({
				type: "DATA_FETCH_COMPLETE",
				timestamp: Date.now(),
				data: data,
			});

			// Emit state change event
			this.emitEvent({
				type: "STATE_CHANGED",
				timestamp: Date.now(),
			});
		} catch (error) {
			this.handleError(error as Error);
		}
	}

	/**
	 * Handle errors from polling
	 */
	private handleError(error: Error): void {
		this.retryCount++;
		this.state.errorCount++;
		this.state.isFetching = false;
		this.state.lastError = error.message;

		// Emit error event
		this.emitEvent({
			type: "DATA_FETCH_ERROR",
			timestamp: Date.now(),
			error: error.message,
		});

		// Emit state change event
		this.emitEvent({
			type: "STATE_CHANGED",
			timestamp: Date.now(),
		});

		if (this.retryCount >= this.config.maxRetries) {
			console.error(`PollingEngine: Max retries exceeded: ${error.message}`);
			return;
		}

		const delay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, this.retryCount - 1);
		console.warn(`PollingEngine: Retry ${this.retryCount}/${this.config.maxRetries} in ${delay}ms: ${error.message}`);

		setTimeout(() => {
			if (this.isRunning && !this.state.isFetching) {
				this.poll();
			}
		}, delay);
	}

	/**
	 * Emit an event to all registered callbacks
	 */
	private emitEvent(event: PollingEvent<T>): void {
		this.callbacks.forEach((callback) => {
			try {
				callback(event);
			} catch (error) {
				console.error("PollingEngine: Event callback error:", error);
			}
		});
	}
}
