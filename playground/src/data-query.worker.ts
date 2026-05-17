/**
 * Data Query Worker for Playground
 * Handles currency data fetching in the playground environment
 */

// ============================================================================
// WORKER IMPLEMENTATION
// ============================================================================

export class DataQueryWorker {
  private dataSources: Map<string, any> = new Map();
  private activeRequests: Set<string> = new Set();

  constructor() {
    console.log("[DataQueryWorker] Playground worker initialized");
  }

  // ------------------------------------------------------------------------
  // DATA SOURCE MANAGEMENT
  // ------------------------------------------------------------------------

  registerDataSource(config: any): void {
    this.dataSources.set(config.id, config);
    this.postMessage({
      type: "DATA_SOURCE_REGISTERED",
      payload: { config },
    });
  }

  // ------------------------------------------------------------------------
  // FETCH EXECUTION
  // ------------------------------------------------------------------------

  async executeFetch(request: any): Promise<any> {
    const { id, dataSourceId, queryKey } = request;
    
    // Track active request
    this.activeRequests.add(id);
    this.postMessage({
      type: "FETCH_STARTED",
      payload: { id, dataSourceId, queryKey },
    });

    try {
      let data: any;
      
      // Handle currency data source natively
      if (dataSourceId === "currency" || (this.dataSources.get(dataSourceId)?.type === "currency")) {
        data = await this.handleCurrencyQuery(queryKey);
      } else {
        // For other data sources, return mock data
        data = { mock: true, queryKey };
      }

      // Simulate network delay for realism
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      this.activeRequests.delete(id);
      
      return {
        id,
        dataSourceId,
        queryKey,
        data,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.activeRequests.delete(id);
      
      return {
        id,
        dataSourceId,
        queryKey,
        data: null,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }

  // ------------------------------------------------------------------------
  // CURRENCY DATA SOURCE HANDLER
  // ------------------------------------------------------------------------

  private async handleCurrencyQuery(queryKey: string[]): Promise<number> {
    const [, from, to] = queryKey;
    
    if (!from || !to) {
      throw new Error("Invalid currency query key");
    }

    // For same currency, return 1
    if (from.toUpperCase() === to.toUpperCase()) {
      return 1;
    }

    // Mock currency rates (in playground, we don't want to make real API calls)
    const mockRates: Record<string, number> = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.73,
      JPY: 151.5,
      CAD: 1.36,
      AUD: 1.53,
      CHF: 0.88,
    };

    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    if (!mockRates[fromUpper] || !mockRates[toUpper]) {
      return 1; // Fallback rate
    }

    // Calculate cross rate
    return mockRates[toUpper] / mockRates[fromUpper];
  }

  // ------------------------------------------------------------------------
  // MESSAGE PASSING
  // ------------------------------------------------------------------------

  private postMessage(message: any): void {
    if (typeof self !== "undefined") {
      (self as any).postMessage(message);
    }
  }

  // ------------------------------------------------------------------------
  // MESSAGE HANDLER
  // ------------------------------------------------------------------------

  handleMessage(event: MessageEvent): void {
    const { type, payload } = event.data;

    switch (type) {
      case "REGISTER_DATA_SOURCE":
        this.registerDataSource(payload);
        break;

      case "FETCH_REQUEST":
        this.executeFetch(payload)
          .then((response) => {
            this.postMessage({
              type: "FETCH_RESPONSE",
              payload: response,
            });
          })
          .catch((error) => {
            this.postMessage({
              type: "FETCH_ERROR",
              payload: {
                id: payload.id,
                error: error.message,
              },
            });
          });
        break;

      case "GET_STATUS":
        this.postMessage({
          type: "STATUS_RESPONSE",
          payload: {
            activeRequests: Array.from(this.activeRequests),
            dataSources: Array.from(this.dataSources.keys()),
          },
        });
        break;
    }
  }
}

// ============================================================================
// WORKER INITIALIZATION
// ============================================================================

const worker = new DataQueryWorker();

(self as any).onmessage = (event: MessageEvent) => {
  worker.handleMessage(event);
};

export { worker as dataQueryWorker };