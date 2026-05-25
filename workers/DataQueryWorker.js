var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/solve-js/src/workers/DataQueryWorker.ts
var DataQueryWorker_exports = {};
__export(DataQueryWorker_exports, {
  DataQueryWorker: () => DataQueryWorker
});
module.exports = __toCommonJS(DataQueryWorker_exports);

// src/solve-js/src/errors/UnifiedErrorFramework.ts
var SolveError = class _SolveError extends Error {
  /**
   * Creates a new SolveError instance
   * 
   * @param category - Error category for classification
   * @param code - Unique error code for identification
   * @param message - Human-readable error message
   * @param severity - Error severity level (default: ERROR)
   * @param recovery - Recovery strategy (default: NONE)
   * @param context - Additional context information
   */
  constructor(category, code, message, severity = "ERROR" /* ERROR */, recovery = "NONE" /* NONE */, context) {
    super(message);
    this.category = category;
    this.code = code;
    this.severity = severity;
    this.recovery = recovery;
    this.context = context;
    this.name = "SolveError";
    this.timestamp = /* @__PURE__ */ new Date();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, _SolveError);
    }
  }
  /**
   * Convert error to JSON-serializable object
   */
  toJSON() {
    return {
      name: this.name,
      category: this.category,
      code: this.code,
      message: this.message,
      severity: this.severity,
      recovery: this.recovery,
      context: this.context,
      timestamp: this.timestamp.toISOString()
    };
  }
  /**
   * Check if error is recoverable
   */
  isRecoverable() {
    return this.recovery !== "NONE" /* NONE */;
  }
  /**
   * Create a formatted error message with context
   */
  format() {
    const base = `[${this.category}] ${this.code}: ${this.message}`;
    if (this.context) {
      const contextStr = JSON.stringify(this.context);
      return `${base} | Context: ${contextStr}`;
    }
    return base;
  }
};
var ErrorFactory = class {
  /**
   * Create a validation error
   */
  static validation(code, message, context) {
    return new SolveError(
      "VALIDATION" /* VALIDATION */,
      code,
      message,
      "ERROR" /* ERROR */,
      "NONE" /* NONE */,
      context
    );
  }
  /**
   * Create a parsing error
   */
  static parsing(code, message, context) {
    return new SolveError(
      "PARSING" /* PARSING */,
      code,
      message,
      "ERROR" /* ERROR */,
      "SKIP" /* SKIP */,
      context
    );
  }
  /**
   * Create an execution error
   */
  static execution(code, message, context) {
    return new SolveError(
      "EXECUTION" /* EXECUTION */,
      code,
      message,
      "ERROR" /* ERROR */,
      "DEGRADED" /* DEGRADED */,
      context
    );
  }
  /**
   * Create an external service error
   */
  static external(code, message, context) {
    return new SolveError(
      "EXTERNAL" /* EXTERNAL */,
      code,
      message,
      "ERROR" /* ERROR */,
      "RETRY" /* RETRY */,
      context
    );
  }
  /**
   * Create an internal error
   */
  static internal(code, message, context) {
    return new SolveError(
      "INTERNAL" /* INTERNAL */,
      code,
      message,
      "CRITICAL" /* CRITICAL */,
      "NONE" /* NONE */,
      context
    );
  }
  /**
   * Create a configuration error
   */
  static config(code, message, context) {
    return new SolveError(
      "CONFIG" /* CONFIG */,
      code,
      message,
      "CRITICAL" /* CRITICAL */,
      "NONE" /* NONE */,
      context
    );
  }
};

// src/solve-js/src/workers/DataSourceStrategy.ts
var CurrencyDataSource = class {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }
  async execute(request) {
    try {
      const [, from, to] = request.queryKey;
      if (!from || !to) {
        return {
          id: request.id,
          dataSourceId: request.dataSourceId,
          queryKey: request.queryKey,
          error: "Invalid currency query key",
          timestamp: Date.now()
        };
      }
      if (from.toUpperCase() === to.toUpperCase()) {
        return {
          id: request.id,
          dataSourceId: request.dataSourceId,
          queryKey: request.queryKey,
          data: 1,
          timestamp: Date.now()
        };
      }
      const response = await fetch(`${this.endpoint}?base=${from}`);
      if (!response.ok) {
        throw ErrorFactory.external(
          "HTTP_ERROR",
          `HTTP ${response.status}: ${response.statusText}`,
          { status: response.status, statusText: response.statusText }
        );
      }
      const data = await response.json();
      const rates = { USD: 1 };
      if (data.rates) {
        Object.entries(data.rates).forEach(([currency, rate]) => {
          rates[currency] = rate;
        });
      }
      const fromUpper = from.toUpperCase();
      const toUpper = to.toUpperCase();
      if (!rates[fromUpper] || !rates[toUpper]) {
        return {
          id: request.id,
          dataSourceId: request.dataSourceId,
          queryKey: request.queryKey,
          data: 1,
          timestamp: Date.now()
        };
      }
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data: rates[toUpper] / rates[fromUpper],
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now()
      };
    }
  }
};
var HttpDataSource = class {
  constructor(config) {
    this.config = config;
  }
  async execute(request) {
    if (!this.config.endpoint) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        error: "No endpoint configured",
        timestamp: Date.now()
      };
    }
    try {
      const url = new URL(this.config.endpoint);
      request.queryKey.forEach((key, index) => {
        if (index > 0) {
          url.searchParams.append(`param${index}`, String(key));
        }
      });
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(this.config.timeout || 5e3)
      });
      if (!response.ok) {
        throw ErrorFactory.external(
          "HTTP_ERROR",
          `HTTP ${response.status}: ${response.statusText}`,
          { status: response.status, statusText: response.statusText }
        );
      }
      const data = await response.json();
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        data,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        id: request.id,
        dataSourceId: request.dataSourceId,
        queryKey: request.queryKey,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now()
      };
    }
  }
};
var ConfigurableWorker = class {
  constructor() {
    this.strategies = /* @__PURE__ */ new Map();
  }
  /**
   * Register a data source strategy
   */
  registerStrategy(type, strategy) {
    this.strategies.set(type, strategy);
  }
  /**
   * Post a message to the worker
   */
  postMessage(message) {
    const { type, payload } = message;
    switch (type) {
      case "FETCH_REQUEST":
        this.handleFetchRequest(payload);
        break;
      case "REGISTER_DATA_SOURCE":
        this.handleRegisterDataSource(payload);
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
    }
  }
  /**
   * Handle incoming messages from the worker
   */
  onMessage(handler) {
    this.messageHandler = handler;
  }
  /**
   * Handle worker errors
   */
  onError(handler) {
    this.errorHandler = handler;
  }
  /**
   * Terminate the worker
   */
  terminate() {
    this.strategies.clear();
    this.messageHandler = void 0;
    this.errorHandler = void 0;
  }
  async handleFetchRequest(request) {
    const strategy = this.strategies.get(request.dataSourceId);
    if (!strategy) {
      this.postResponse({
        type: "FETCH_ERROR",
        payload: {
          id: request.id,
          error: `No strategy for data source: ${request.dataSourceId}`
        }
      });
      return;
    }
    try {
      const response = await strategy.execute(request);
      this.postResponse({
        type: "FETCH_RESPONSE",
        payload: response
      });
    } catch (error) {
      this.postResponse({
        type: "FETCH_ERROR",
        payload: {
          id: request.id,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  }
  handleRegisterDataSource(config) {
    let strategy;
    switch (config.type) {
      case "currency":
        strategy = new CurrencyDataSource(config.endpoint || "");
        break;
      case "http":
        strategy = new HttpDataSource(config);
        break;
      default:
        console.warn(`Unknown data source type: ${config.type}`);
        return;
    }
    this.strategies.set(config.id, strategy);
    this.postResponse({
      type: "DATA_SOURCE_REGISTERED",
      payload: { config }
    });
  }
  postResponse(response) {
    if (this.messageHandler) {
      this.messageHandler(response);
    }
  }
};

// src/solve-js/src/workers/DataQueryWorker.ts
var DataQueryWorker = class {
  constructor() {
    this.messageHandlers = /* @__PURE__ */ new Map();
    this.worker = new ConfigurableWorker();
    this.setupMessageHandlers();
  }
  /**
   * Register a data source configuration
   */
  registerDataSource(config) {
    this.worker.postMessage({
      type: "REGISTER_DATA_SOURCE",
      payload: config
    });
  }
  /**
   * Execute a fetch request
   */
  async executeFetch(request) {
    return new Promise((resolve) => {
      const handler = (response) => {
        const payload = response.payload;
        if (response.type === "FETCH_RESPONSE" && (payload == null ? void 0 : payload.id) === request.id) {
          this.worker.onMessage(() => {
          });
          resolve(response.payload);
        } else if (response.type === "FETCH_ERROR" && (payload == null ? void 0 : payload.id) === request.id) {
          this.worker.onMessage(() => {
          });
          resolve({
            id: request.id,
            dataSourceId: request.dataSourceId,
            queryKey: request.queryKey,
            error: payload == null ? void 0 : payload.error,
            timestamp: Date.now()
          });
        }
      };
      this.worker.onMessage(handler);
      this.worker.postMessage({
        type: "FETCH_REQUEST",
        payload: request
      });
    });
  }
  /**
   * Terminate the worker
   */
  terminate() {
    this.worker.terminate();
    this.messageHandlers.clear();
  }
  setupMessageHandlers() {
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3NvbHZlLWpzL3NyYy93b3JrZXJzL0RhdGFRdWVyeVdvcmtlci50cyIsICIuLi9zcmMvc29sdmUtanMvc3JjL2Vycm9ycy9VbmlmaWVkRXJyb3JGcmFtZXdvcmsudHMiLCAiLi4vc3JjL3NvbHZlLWpzL3NyYy93b3JrZXJzL0RhdGFTb3VyY2VTdHJhdGVneS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBQcm9kdWN0aW9uLWdyYWRlIHNjYWxhYmxlIGRhdGEgcXVlcnkgd29ya2VyXG4gKiBSZWZhY3RvcmVkIHRvIGFjdCBhcyBhIHB1cmUgZmV0Y2ggZXhlY3V0b3IgZm9yIHRoZSBtYWluIHRocmVhZCBWaXJ0dWFsIFF1ZXJ5IENsaWVudFxuICogXG4gKiBAbW9kdWxlIFdvcmtlcnNcbiAqL1xuXG5pbXBvcnQgeyBDb25maWd1cmFibGVXb3JrZXIsIERhdGFTb3VyY2VDb25maWcsIEZldGNoUmVxdWVzdCwgRmV0Y2hSZXNwb25zZSB9IGZyb20gJy4vRGF0YVNvdXJjZVN0cmF0ZWd5JztcbmltcG9ydCB7IElXb3JrZXIsIFdvcmtlck1lc3NhZ2UsIFdvcmtlclJlc3BvbnNlIH0gZnJvbSAnLi9Xb3JrZXJJbnRlcmZhY2UnO1xuXG4vKipcbiAqIERhdGEgcXVlcnkgd29ya2VyIGltcGxlbWVudGF0aW9uXG4gKiBcbiAqIEByZW1hcmtzXG4gKiBUaGlzIHdvcmtlciBpcyByZXNwb25zaWJsZSBmb3IgZXhlY3V0aW5nIGRhdGEgZmV0Y2ggb3BlcmF0aW9ucyBpbiBhIGJhY2tncm91bmQgdGhyZWFkLlxuICogSXQgdXNlcyBhIHN0cmF0ZWd5IHBhdHRlcm4gdG8gc3VwcG9ydCBtdWx0aXBsZSBkYXRhIHNvdXJjZSB0eXBlcy5cbiAqIFxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IHdvcmtlciA9IG5ldyBEYXRhUXVlcnlXb3JrZXIoKTtcbiAqIHdvcmtlci5yZWdpc3RlckRhdGFTb3VyY2Uoe1xuICogICBpZDogJ2N1cnJlbmN5JyxcbiAqICAgdHlwZTogJ2N1cnJlbmN5JyxcbiAqICAgZW5kcG9pbnQ6ICdodHRwczovL2FwaS5mcmFua2Z1cnRlci5kZXYvdjIvcmF0ZXMnXG4gKiB9KTtcbiAqIGBgYFxuICovXG4vKiogUGF5bG9hZCBzaGFwZSBmb3IgZGF0YSBxdWVyeSB3b3JrZXIgZmV0Y2ggcmVzcG9uc2VzICovXG5pbnRlcmZhY2UgRmV0Y2hlclBheWxvYWQge1xuICBpZDogc3RyaW5nO1xuICBlcnJvcj86IHN0cmluZztcbiAgZGF0YT86IHVua25vd247XG4gIGRhdGFTb3VyY2VJZD86IHN0cmluZztcbiAgcXVlcnlLZXk/OiBzdHJpbmdbXTtcbiAgdGltZXN0YW1wPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgRGF0YVF1ZXJ5V29ya2VyIHtcbiAgcHJpdmF0ZSB3b3JrZXI6IElXb3JrZXI7XG4gIHByaXZhdGUgbWVzc2FnZUhhbmRsZXJzOiBNYXA8c3RyaW5nLCAocmVzcG9uc2U6IFdvcmtlclJlc3BvbnNlKSA9PiB2b2lkPiA9IG5ldyBNYXAoKTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLndvcmtlciA9IG5ldyBDb25maWd1cmFibGVXb3JrZXIoKTtcbiAgICB0aGlzLnNldHVwTWVzc2FnZUhhbmRsZXJzKCk7XG4gIH1cblxuICAvKipcbiAgICogUmVnaXN0ZXIgYSBkYXRhIHNvdXJjZSBjb25maWd1cmF0aW9uXG4gICAqL1xuICByZWdpc3RlckRhdGFTb3VyY2UoY29uZmlnOiBEYXRhU291cmNlQ29uZmlnKTogdm9pZCB7XG4gICAgdGhpcy53b3JrZXIucG9zdE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogJ1JFR0lTVEVSX0RBVEFfU09VUkNFJyxcbiAgICAgIHBheWxvYWQ6IGNvbmZpZ1xuICAgIH0gYXMgV29ya2VyTWVzc2FnZSk7XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBhIGZldGNoIHJlcXVlc3RcbiAgICovXG4gIGFzeW5jIGV4ZWN1dGVGZXRjaChyZXF1ZXN0OiBGZXRjaFJlcXVlc3QpOiBQcm9taXNlPEZldGNoUmVzcG9uc2U+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAocmVzcG9uc2U6IFdvcmtlclJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSByZXNwb25zZS5wYXlsb2FkIGFzIEZldGNoZXJQYXlsb2FkIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAocmVzcG9uc2UudHlwZSA9PT0gJ0ZFVENIX1JFU1BPTlNFJyAmJiBwYXlsb2FkPy5pZCA9PT0gcmVxdWVzdC5pZCkge1xuICAgICAgICAgIHRoaXMud29ya2VyLm9uTWVzc2FnZSgoKSA9PiB7fSk7IC8vIENsZWFyIGhhbmRsZXJcbiAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlLnBheWxvYWQgYXMgRmV0Y2hSZXNwb25zZSk7XG4gICAgICAgIH0gZWxzZSBpZiAocmVzcG9uc2UudHlwZSA9PT0gJ0ZFVENIX0VSUk9SJyAmJiBwYXlsb2FkPy5pZCA9PT0gcmVxdWVzdC5pZCkge1xuICAgICAgICAgIHRoaXMud29ya2VyLm9uTWVzc2FnZSgoKSA9PiB7fSk7XG4gICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICBpZDogcmVxdWVzdC5pZCxcbiAgICAgICAgICAgIGRhdGFTb3VyY2VJZDogcmVxdWVzdC5kYXRhU291cmNlSWQsXG4gICAgICAgICAgICBxdWVyeUtleTogcmVxdWVzdC5xdWVyeUtleSxcbiAgICAgICAgICAgIGVycm9yOiBwYXlsb2FkPy5lcnJvcixcbiAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICB0aGlzLndvcmtlci5vbk1lc3NhZ2UoaGFuZGxlcik7XG4gICAgdGhpcy53b3JrZXIucG9zdE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogJ0ZFVENIX1JFUVVFU1QnLFxuICAgICAgcGF5bG9hZDogcmVxdWVzdFxuICAgIH0gYXMgV29ya2VyTWVzc2FnZSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogVGVybWluYXRlIHRoZSB3b3JrZXJcbiAgICovXG4gIHRlcm1pbmF0ZSgpOiB2b2lkIHtcbiAgICB0aGlzLndvcmtlci50ZXJtaW5hdGUoKTtcbiAgICB0aGlzLm1lc3NhZ2VIYW5kbGVycy5jbGVhcigpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cE1lc3NhZ2VIYW5kbGVycygpOiB2b2lkIHtcbiAgICAvLyBTZXR1cCBhbnkgbmVjZXNzYXJ5IG1lc3NhZ2UgaGFuZGxlcnNcbiAgfVxufVxuXG4vKipcbiAqIFJlLWV4cG9ydCB0eXBlcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICovXG5leHBvcnQgdHlwZSB7IERhdGFTb3VyY2VUeXBlIH0gZnJvbSAnLi9EYXRhU291cmNlU3RyYXRlZ3knO1xuZXhwb3J0IHR5cGUgeyBEYXRhU291cmNlQ29uZmlnLCBGZXRjaFJlcXVlc3QsIEZldGNoUmVzcG9uc2UgfSBmcm9tICcuL0RhdGFTb3VyY2VTdHJhdGVneSc7XG4iLCAiLyoqXG4gKiBVbmlmaWVkIEVycm9yIEZyYW1ld29yayBmb3Igc29sdmUtanMgRW5naW5lXG4gKiBcbiAqIFRoaXMgbW9kdWxlIHByb3ZpZGVzIGEgY29tcHJlaGVuc2l2ZSBlcnJvciBoYW5kbGluZyBzeXN0ZW0gd2l0aCBjYXRlZ29yaXplZCBlcnJvcnMsXG4gKiBzZXZlcml0eSBsZXZlbHMsIGFuZCByZWNvdmVyeSBzdHJhdGVnaWVzLlxuICogXG4gKiBAbW9kdWxlIEVycm9yc1xuICovXG5cbi8qKlxuICogRXJyb3IgY2F0ZWdvcmllcyBmb3IgY2xhc3NpZmljYXRpb24gYW5kIGhhbmRsaW5nXG4gKi9cbmV4cG9ydCBlbnVtIEVycm9yQ2F0ZWdvcnkge1xuICAvKiogRXJyb3JzIGR1cmluZyBleHByZXNzaW9uIHBhcnNpbmcgKi9cbiAgUEFSU0lORyA9ICdQQVJTSU5HJyxcbiAgXG4gIC8qKiBFcnJvcnMgZHVyaW5nIGJ5dGVjb2RlIGV4ZWN1dGlvbiAqL1xuICBFWEVDVVRJT04gPSAnRVhFQ1VUSU9OJyxcbiAgXG4gIC8qKiBFcnJvcnMgZnJvbSBpbnB1dCB2YWxpZGF0aW9uICovXG4gIFZBTElEQVRJT04gPSAnVkFMSURBVElPTicsXG4gIFxuICAvKiogRXJyb3JzIGZyb20gZXh0ZXJuYWwgc2VydmljZXMvQVBJcyAqL1xuICBFWFRFUk5BTCA9ICdFWFRFUk5BTCcsXG4gIFxuICAvKiogSW50ZXJuYWwgZW5naW5lIGVycm9ycyAqL1xuICBJTlRFUk5BTCA9ICdJTlRFUk5BTCcsXG4gIFxuICAvKiogQ29uZmlndXJhdGlvbiBlcnJvcnMgKi9cbiAgQ09ORklHID0gJ0NPTkZJRydcbn1cblxuLyoqXG4gKiBFcnJvciBzZXZlcml0eSBsZXZlbHMgZm9yIGxvZ2dpbmcgYW5kIGhhbmRsaW5nXG4gKi9cbmV4cG9ydCBlbnVtIEVycm9yU2V2ZXJpdHkge1xuICAvKiogSW5mb3JtYXRpb25hbCAtIG5vIGFjdGlvbiByZXF1aXJlZCAqL1xuICBJTkZPID0gJ0lORk8nLFxuICBcbiAgLyoqIFdhcm5pbmcgLSBzaG91bGQgYmUgcmV2aWV3ZWQgYnV0IG5vdCBjcml0aWNhbCAqL1xuICBXQVJOSU5HID0gJ1dBUk5JTkcnLFxuICBcbiAgLyoqIEVycm9yIC0gcHJvY2Vzc2luZyBmYWlsZWQgYnV0IGNhbiBjb250aW51ZSAqL1xuICBFUlJPUiA9ICdFUlJPUicsXG4gIFxuICAvKiogQ3JpdGljYWwgLSBwcm9jZXNzaW5nIGNhbm5vdCBjb250aW51ZSAqL1xuICBDUklUSUNBTCA9ICdDUklUSUNBTCdcbn1cblxuLyoqXG4gKiBFcnJvciByZWNvdmVyeSBzdHJhdGVnaWVzXG4gKi9cbmV4cG9ydCBlbnVtIEVycm9yUmVjb3Zlcnkge1xuICAvKiogTm8gcmVjb3ZlcnkgLSBmYWlsIGltbWVkaWF0ZWx5ICovXG4gIE5PTkUgPSAnTk9ORScsXG4gIFxuICAvKiogUmV0cnkgdGhlIG9wZXJhdGlvbiB3aXRoIGJhY2tvZmYgKi9cbiAgUkVUUlkgPSAnUkVUUlknLFxuICBcbiAgLyoqIFVzZSBmYWxsYmFjayB2YWx1ZSBvciBzdHJhdGVneSAqL1xuICBGQUxMQkFDSyA9ICdGQUxMQkFDSycsXG4gIFxuICAvKiogQ29udGludWUgd2l0aCBkZWdyYWRlZCBmdW5jdGlvbmFsaXR5ICovXG4gIERFR1JBREVEID0gJ0RFR1JBREVEJyxcbiAgXG4gIC8qKiBTa2lwIHByb2JsZW1hdGljIGl0ZW0gYW5kIGNvbnRpbnVlICovXG4gIFNLSVAgPSAnU0tJUCdcbn1cblxuLyoqXG4gKiBSZXN1bHQgdHlwZSBmb3Igb3BlcmF0aW9ucyB0aGF0IGNhbiBmYWlsXG4gKi9cbmV4cG9ydCB0eXBlIFJlc3VsdDxULCBFID0gU29sdmVFcnJvcj4gPVxuICB8IHsgb2s6IHRydWU7IHZhbHVlOiBUIH1cbiAgfCB7IG9rOiBmYWxzZTsgZXJyb3I6IEUgfTtcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIGZvciBlcnJvciByZWNvdmVyeVxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVycm9yU3RyYXRlZ3kge1xuICByZWNvdmVyeTogRXJyb3JSZWNvdmVyeTtcbiAgbWF4UmV0cmllcz86IG51bWJlcjtcbiAgYmFja29mZk1zPzogbnVtYmVyO1xuICBmYWxsYmFjaz86ICgpID0+IHVua25vd247XG59XG5cbi8qKlxuICogQmFzZSBlcnJvciBjbGFzcyBmb3Igc29sdmUtanMgZW5naW5lXG4gKiBcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiB0aHJvdyBuZXcgU29sdmVFcnJvcihcbiAqICAgRXJyb3JDYXRlZ29yeS5WQUxJREFUSU9OLFxuICogICAnSU5WQUxJRF9FWFBSRVNTSU9OJyxcbiAqICAgJ0V4cHJlc3Npb24gY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyxcbiAqICAgRXJyb3JTZXZlcml0eS5FUlJPUixcbiAqICAgRXJyb3JSZWNvdmVyeS5OT05FLFxuICogICB7IGV4cHJlc3Npb246ICdpbnZhbGlkIUAjJyB9XG4gKiApO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBTb2x2ZUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBwdWJsaWMgcmVhZG9ubHkgdGltZXN0YW1wOiBEYXRlO1xuICBwdWJsaWMgcmVhZG9ubHkgc3RhY2s/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgU29sdmVFcnJvciBpbnN0YW5jZVxuICAgKiBcbiAgICogQHBhcmFtIGNhdGVnb3J5IC0gRXJyb3IgY2F0ZWdvcnkgZm9yIGNsYXNzaWZpY2F0aW9uXG4gICAqIEBwYXJhbSBjb2RlIC0gVW5pcXVlIGVycm9yIGNvZGUgZm9yIGlkZW50aWZpY2F0aW9uXG4gICAqIEBwYXJhbSBtZXNzYWdlIC0gSHVtYW4tcmVhZGFibGUgZXJyb3IgbWVzc2FnZVxuICAgKiBAcGFyYW0gc2V2ZXJpdHkgLSBFcnJvciBzZXZlcml0eSBsZXZlbCAoZGVmYXVsdDogRVJST1IpXG4gICAqIEBwYXJhbSByZWNvdmVyeSAtIFJlY292ZXJ5IHN0cmF0ZWd5IChkZWZhdWx0OiBOT05FKVxuICAgKiBAcGFyYW0gY29udGV4dCAtIEFkZGl0aW9uYWwgY29udGV4dCBpbmZvcm1hdGlvblxuICAgKi9cbiAgY29uc3RydWN0b3IoXG4gICAgcHVibGljIHJlYWRvbmx5IGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5LFxuICAgIHB1YmxpYyByZWFkb25seSBjb2RlOiBzdHJpbmcsXG4gICAgbWVzc2FnZTogc3RyaW5nLFxuICAgIHB1YmxpYyByZWFkb25seSBzZXZlcml0eTogRXJyb3JTZXZlcml0eSA9IEVycm9yU2V2ZXJpdHkuRVJST1IsXG4gICAgcHVibGljIHJlYWRvbmx5IHJlY292ZXJ5OiBFcnJvclJlY292ZXJ5ID0gRXJyb3JSZWNvdmVyeS5OT05FLFxuICAgIHB1YmxpYyByZWFkb25seSBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5uYW1lID0gJ1NvbHZlRXJyb3InO1xuICAgIHRoaXMudGltZXN0YW1wID0gbmV3IERhdGUoKTtcbiAgICBcbiAgICAvLyBDYXB0dXJlIHN0YWNrIHRyYWNlIChleGNsdWRpbmcgY29uc3RydWN0b3IgY2FsbClcbiAgICBpZiAoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcbiAgICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMsIFNvbHZlRXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IGVycm9yIHRvIEpTT04tc2VyaWFsaXphYmxlIG9iamVjdFxuICAgKi9cbiAgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgICByZXR1cm4ge1xuICAgICAgbmFtZTogdGhpcy5uYW1lLFxuICAgICAgY2F0ZWdvcnk6IHRoaXMuY2F0ZWdvcnksXG4gICAgICBjb2RlOiB0aGlzLmNvZGUsXG4gICAgICBtZXNzYWdlOiB0aGlzLm1lc3NhZ2UsXG4gICAgICBzZXZlcml0eTogdGhpcy5zZXZlcml0eSxcbiAgICAgIHJlY292ZXJ5OiB0aGlzLnJlY292ZXJ5LFxuICAgICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICAgICAgdGltZXN0YW1wOiB0aGlzLnRpbWVzdGFtcC50b0lTT1N0cmluZygpXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBlcnJvciBpcyByZWNvdmVyYWJsZVxuICAgKi9cbiAgaXNSZWNvdmVyYWJsZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5yZWNvdmVyeSAhPT0gRXJyb3JSZWNvdmVyeS5OT05FO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIGZvcm1hdHRlZCBlcnJvciBtZXNzYWdlIHdpdGggY29udGV4dFxuICAgKi9cbiAgZm9ybWF0KCk6IHN0cmluZyB7XG4gICAgY29uc3QgYmFzZSA9IGBbJHt0aGlzLmNhdGVnb3J5fV0gJHt0aGlzLmNvZGV9OiAke3RoaXMubWVzc2FnZX1gO1xuICAgIGlmICh0aGlzLmNvbnRleHQpIHtcbiAgICAgIGNvbnN0IGNvbnRleHRTdHIgPSBKU09OLnN0cmluZ2lmeSh0aGlzLmNvbnRleHQpO1xuICAgICAgcmV0dXJuIGAke2Jhc2V9IHwgQ29udGV4dDogJHtjb250ZXh0U3RyfWA7XG4gICAgfVxuICAgIHJldHVybiBiYXNlO1xuICB9XG59XG5cbi8qKlxuICogRmFjdG9yeSBmb3IgY3JlYXRpbmcgY29tbW9uIGVycm9yc1xuICovXG5leHBvcnQgY2xhc3MgRXJyb3JGYWN0b3J5IHtcbiAgLyoqXG4gICAqIENyZWF0ZSBhIHZhbGlkYXRpb24gZXJyb3JcbiAgICovXG4gIHN0YXRpYyB2YWxpZGF0aW9uKFxuICAgIGNvZGU6IHN0cmluZyxcbiAgICBtZXNzYWdlOiBzdHJpbmcsXG4gICAgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gICk6IFNvbHZlRXJyb3Ige1xuICAgIHJldHVybiBuZXcgU29sdmVFcnJvcihcbiAgICAgIEVycm9yQ2F0ZWdvcnkuVkFMSURBVElPTixcbiAgICAgIGNvZGUsXG4gICAgICBtZXNzYWdlLFxuICAgICAgRXJyb3JTZXZlcml0eS5FUlJPUixcbiAgICAgIEVycm9yUmVjb3ZlcnkuTk9ORSxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIHBhcnNpbmcgZXJyb3JcbiAgICovXG4gIHN0YXRpYyBwYXJzaW5nKFxuICAgIGNvZGU6IHN0cmluZyxcbiAgICBtZXNzYWdlOiBzdHJpbmcsXG4gICAgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gICk6IFNvbHZlRXJyb3Ige1xuICAgIHJldHVybiBuZXcgU29sdmVFcnJvcihcbiAgICAgIEVycm9yQ2F0ZWdvcnkuUEFSU0lORyxcbiAgICAgIGNvZGUsXG4gICAgICBtZXNzYWdlLFxuICAgICAgRXJyb3JTZXZlcml0eS5FUlJPUixcbiAgICAgIEVycm9yUmVjb3ZlcnkuU0tJUCxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhbiBleGVjdXRpb24gZXJyb3JcbiAgICovXG4gIHN0YXRpYyBleGVjdXRpb24oXG4gICAgY29kZTogc3RyaW5nLFxuICAgIG1lc3NhZ2U6IHN0cmluZyxcbiAgICBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgKTogU29sdmVFcnJvciB7XG4gICAgcmV0dXJuIG5ldyBTb2x2ZUVycm9yKFxuICAgICAgRXJyb3JDYXRlZ29yeS5FWEVDVVRJT04sXG4gICAgICBjb2RlLFxuICAgICAgbWVzc2FnZSxcbiAgICAgIEVycm9yU2V2ZXJpdHkuRVJST1IsXG4gICAgICBFcnJvclJlY292ZXJ5LkRFR1JBREVELFxuICAgICAgY29udGV4dFxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGFuIGV4dGVybmFsIHNlcnZpY2UgZXJyb3JcbiAgICovXG4gIHN0YXRpYyBleHRlcm5hbChcbiAgICBjb2RlOiBzdHJpbmcsXG4gICAgbWVzc2FnZTogc3RyaW5nLFxuICAgIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuICApOiBTb2x2ZUVycm9yIHtcbiAgICByZXR1cm4gbmV3IFNvbHZlRXJyb3IoXG4gICAgICBFcnJvckNhdGVnb3J5LkVYVEVSTkFMLFxuICAgICAgY29kZSxcbiAgICAgIG1lc3NhZ2UsXG4gICAgICBFcnJvclNldmVyaXR5LkVSUk9SLFxuICAgICAgRXJyb3JSZWNvdmVyeS5SRVRSWSxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhbiBpbnRlcm5hbCBlcnJvclxuICAgKi9cbiAgc3RhdGljIGludGVybmFsKFxuICAgIGNvZGU6IHN0cmluZyxcbiAgICBtZXNzYWdlOiBzdHJpbmcsXG4gICAgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gICk6IFNvbHZlRXJyb3Ige1xuICAgIHJldHVybiBuZXcgU29sdmVFcnJvcihcbiAgICAgIEVycm9yQ2F0ZWdvcnkuSU5URVJOQUwsXG4gICAgICBjb2RlLFxuICAgICAgbWVzc2FnZSxcbiAgICAgIEVycm9yU2V2ZXJpdHkuQ1JJVElDQUwsXG4gICAgICBFcnJvclJlY292ZXJ5Lk5PTkUsXG4gICAgICBjb250ZXh0XG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBjb25maWd1cmF0aW9uIGVycm9yXG4gICAqL1xuICBzdGF0aWMgY29uZmlnKFxuICAgIGNvZGU6IHN0cmluZyxcbiAgICBtZXNzYWdlOiBzdHJpbmcsXG4gICAgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gICk6IFNvbHZlRXJyb3Ige1xuICAgIHJldHVybiBuZXcgU29sdmVFcnJvcihcbiAgICAgIEVycm9yQ2F0ZWdvcnkuQ09ORklHLFxuICAgICAgY29kZSxcbiAgICAgIG1lc3NhZ2UsXG4gICAgICBFcnJvclNldmVyaXR5LkNSSVRJQ0FMLFxuICAgICAgRXJyb3JSZWNvdmVyeS5OT05FLFxuICAgICAgY29udGV4dFxuICAgICk7XG4gIH1cbn1cblxuLyoqXG4gKiBFcnJvciByZWNvdmVyeSBtYW5hZ2VyIGZvciBoYW5kbGluZyBlcnJvcnMgd2l0aCByZWNvdmVyeSBzdHJhdGVnaWVzXG4gKi9cbmV4cG9ydCBjbGFzcyBFcnJvclJlY292ZXJ5TWFuYWdlciB7XG4gIC8qKlxuICAgKiBFeGVjdXRlIGFuIG9wZXJhdGlvbiB3aXRoIGVycm9yIHJlY292ZXJ5XG4gICAqIFxuICAgKiBAcGFyYW0gb3BlcmF0aW9uIC0gVGhlIG9wZXJhdGlvbiB0byBleGVjdXRlXG4gICAqIEBwYXJhbSBzdHJhdGVneSAtIEVycm9yIHJlY292ZXJ5IHN0cmF0ZWd5XG4gICAqIEByZXR1cm5zIFJlc3VsdCBvZiB0aGUgb3BlcmF0aW9uXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZXhlY3V0ZTxUPihcbiAgICBvcGVyYXRpb246ICgpID0+IFByb21pc2U8VD4sXG4gICAgc3RyYXRlZ3k6IEVycm9yU3RyYXRlZ3lcbiAgKTogUHJvbWlzZTxSZXN1bHQ8VCwgU29sdmVFcnJvcj4+IHtcbiAgICBsZXQgbGFzdEVycm9yOiBTb2x2ZUVycm9yIHwgbnVsbCA9IG51bGw7XG4gICAgY29uc3QgbWF4UmV0cmllcyA9IHN0cmF0ZWd5Lm1heFJldHJpZXMgfHwgMztcbiAgICBjb25zdCBiYWNrb2ZmTXMgPSBzdHJhdGVneS5iYWNrb2ZmTXMgfHwgMTAwMDtcblxuICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDw9IG1heFJldHJpZXM7IGF0dGVtcHQrKykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlcmF0aW9uKCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZTogcmVzdWx0IH07XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zdCBzb2x2ZWRFcnJvciA9IHRoaXMubm9ybWFsaXplRXJyb3IoZXJyb3IpO1xuICAgICAgICBsYXN0RXJyb3IgPSBzb2x2ZWRFcnJvcjtcblxuICAgICAgICBpZiAoYXR0ZW1wdCA9PT0gbWF4UmV0cmllcyB8fCBzdHJhdGVneS5yZWNvdmVyeSA9PT0gRXJyb3JSZWNvdmVyeS5OT05FKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RyYXRlZ3kucmVjb3ZlcnkgPT09IEVycm9yUmVjb3ZlcnkuUkVUUlkpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmJhY2tvZmYoYmFja29mZk1zLCBhdHRlbXB0KTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdHJhdGVneS5yZWNvdmVyeSA9PT0gRXJyb3JSZWNvdmVyeS5GQUxMQkFDSyAmJiBzdHJhdGVneS5mYWxsYmFjaykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmYWxsYmFja1Jlc3VsdCA9IHN0cmF0ZWd5LmZhbGxiYWNrKCk7XG4gICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IGZhbGxiYWNrUmVzdWx0IGFzIFQgfTtcbiAgICAgICAgICB9IGNhdGNoIChmYWxsYmFja0Vycm9yKSB7XG4gICAgICAgICAgICAvLyBGYWxsYmFjayBmYWlsZWQsIHJldHVybiBvcmlnaW5hbCBlcnJvclxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0cmF0ZWd5LnJlY292ZXJ5ID09PSBFcnJvclJlY292ZXJ5LkRFR1JBREVEKSB7XG4gICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogc29sdmVkRXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGxhc3RFcnJvciEgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBOb3JtYWxpemUgYW55IGVycm9yIHRvIFNvbHZlRXJyb3JcbiAgICovXG4gIHN0YXRpYyBub3JtYWxpemVFcnJvcihlcnJvcjogdW5rbm93bik6IFNvbHZlRXJyb3Ige1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFNvbHZlRXJyb3IpIHtcbiAgICAgIHJldHVybiBlcnJvcjtcbiAgICB9XG5cbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgcmV0dXJuIEVycm9yRmFjdG9yeS5pbnRlcm5hbChcbiAgICAgICAgJ1VORVhQRUNURURfRVJST1InLFxuICAgICAgICBlcnJvci5tZXNzYWdlLFxuICAgICAgICB7IG9yaWdpbmFsRXJyb3I6IGVycm9yLm5hbWUgfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gRXJyb3JGYWN0b3J5LmludGVybmFsKFxuICAgICAgJ1VOS05PV05fRVJST1InLFxuICAgICAgJ0FuIHVua25vd24gZXJyb3Igb2NjdXJyZWQnLFxuICAgICAgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9XG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeHBvbmVudGlhbCBiYWNrb2ZmIHdpdGggaml0dGVyXG4gICAqL1xuICBwcml2YXRlIHN0YXRpYyBhc3luYyBiYWNrb2ZmKGJhc2VNczogbnVtYmVyLCBhdHRlbXB0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBleHBvbmVudGlhbEJhY2tvZmYgPSBiYXNlTXMgKiBNYXRoLnBvdygyLCBhdHRlbXB0KTtcbiAgICBjb25zdCBqaXR0ZXIgPSBNYXRoLnJhbmRvbSgpICogMTAwOyAvLyBBZGQgcmFuZG9tbmVzcyB0byBwcmV2ZW50IHRodW5kZXJpbmcgaGVyZFxuICAgIGNvbnN0IGRlbGF5ID0gZXhwb25lbnRpYWxCYWNrb2ZmICsgaml0dGVyO1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xuICB9XG59XG4iLCAiLyoqXHJcbiAqIFdvcmtlciBTdHJhdGVneSBQYXR0ZXJuIEltcGxlbWVudGF0aW9uXHJcbiAqIFxyXG4gKiBUaGlzIG1vZHVsZSBwcm92aWRlcyBwbHVnZ2FibGUgZGF0YSBzb3VyY2Ugc3RyYXRlZ2llcyBmb3Igd29ya2Vycy5cclxuICogXHJcbiAqIEBtb2R1bGUgV29ya2Vyc1xyXG4gKi9cclxuXHJcbmltcG9ydCB7IFdvcmtlck1lc3NhZ2UsIFdvcmtlclJlc3BvbnNlLCBJV29ya2VyIH0gZnJvbSAnQHNvbHZlLWpzL3dvcmtlcnMvV29ya2VySW50ZXJmYWNlJztcclxuaW1wb3J0IHsgRXJyb3JGYWN0b3J5IH0gZnJvbSAnQHNvbHZlLWpzL2Vycm9ycy9VbmlmaWVkRXJyb3JGcmFtZXdvcmsnO1xyXG5cclxuLyoqXHJcbiAqIERhdGEgc291cmNlIHR5cGVzXHJcbiAqL1xyXG5leHBvcnQgdHlwZSBEYXRhU291cmNlVHlwZSA9IFwiY3VycmVuY3lcIiB8IFwiYXNzZXRcIiB8IFwiY29uZmlnXCIgfCBcImN1c3RvbVwiIHwgXCJodHRwXCI7XHJcblxyXG4vKipcclxuICogRGF0YSBzb3VyY2UgY29uZmlndXJhdGlvblxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBEYXRhU291cmNlQ29uZmlnIHtcclxuICBpZDogc3RyaW5nO1xyXG4gIHR5cGU6IERhdGFTb3VyY2VUeXBlO1xyXG4gIGVuZHBvaW50Pzogc3RyaW5nO1xyXG4gIHJlZnJlc2hJbnRlcnZhbD86IG51bWJlcjtcclxuICB0aW1lb3V0PzogbnVtYmVyO1xyXG4gIHJldHJ5UG9saWN5PzogUmV0cnlQb2xpY3k7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXRyeSBwb2xpY3kgY29uZmlndXJhdGlvblxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBSZXRyeVBvbGljeSB7XHJcbiAgbWF4UmV0cmllczogbnVtYmVyO1xyXG4gIGJhY2tvZmZNczogbnVtYmVyO1xyXG4gIGJhY2tvZmZNdWx0aXBsaWVyOiBudW1iZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGZXRjaCByZXF1ZXN0IGZvciBkYXRhIHNvdXJjZXNcclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgRmV0Y2hSZXF1ZXN0IHtcclxuICBpZDogc3RyaW5nO1xyXG4gIGRhdGFTb3VyY2VJZDogc3RyaW5nO1xyXG4gIHF1ZXJ5S2V5OiBzdHJpbmdbXTtcclxuICBwYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcclxuICB0aW1lc3RhbXA6IG51bWJlcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZldGNoIHJlc3BvbnNlIGZyb20gZGF0YSBzb3VyY2VzXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIEZldGNoUmVzcG9uc2Uge1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgZGF0YVNvdXJjZUlkOiBzdHJpbmc7XHJcbiAgcXVlcnlLZXk6IHN0cmluZ1tdO1xyXG4gIGRhdGE/OiB1bmtub3duO1xyXG4gIGVycm9yPzogc3RyaW5nO1xyXG4gIHRpbWVzdGFtcDogbnVtYmVyO1xyXG59XHJcblxyXG4vKipcclxuICogRGF0YSBzb3VyY2Ugc3RyYXRlZ3kgaW50ZXJmYWNlXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIERhdGFTb3VyY2VTdHJhdGVneSB7XHJcbiAgZXhlY3V0ZShyZXF1ZXN0OiBGZXRjaFJlcXVlc3QpOiBQcm9taXNlPEZldGNoUmVzcG9uc2U+O1xyXG59XHJcblxyXG4vKipcclxuICogQ3VycmVuY3kgZGF0YSBzb3VyY2Ugc3RyYXRlZ3lcclxuICovXHJcbmV4cG9ydCBjbGFzcyBDdXJyZW5jeURhdGFTb3VyY2UgaW1wbGVtZW50cyBEYXRhU291cmNlU3RyYXRlZ3kge1xyXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZW5kcG9pbnQ6IHN0cmluZykge31cclxuXHJcbiAgYXN5bmMgZXhlY3V0ZShyZXF1ZXN0OiBGZXRjaFJlcXVlc3QpOiBQcm9taXNlPEZldGNoUmVzcG9uc2U+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IFssIGZyb20sIHRvXSA9IHJlcXVlc3QucXVlcnlLZXk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIWZyb20gfHwgIXRvKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGlkOiByZXF1ZXN0LmlkLFxyXG4gICAgICAgICAgZGF0YVNvdXJjZUlkOiByZXF1ZXN0LmRhdGFTb3VyY2VJZCxcclxuICAgICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxyXG4gICAgICAgICAgZXJyb3I6ICdJbnZhbGlkIGN1cnJlbmN5IHF1ZXJ5IGtleScsXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoZnJvbS50b1VwcGVyQ2FzZSgpID09PSB0by50b1VwcGVyQ2FzZSgpKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGlkOiByZXF1ZXN0LmlkLFxyXG4gICAgICAgICAgZGF0YVNvdXJjZUlkOiByZXF1ZXN0LmRhdGFTb3VyY2VJZCxcclxuICAgICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxyXG4gICAgICAgICAgZGF0YTogMSxcclxuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7dGhpcy5lbmRwb2ludH0/YmFzZT0ke2Zyb219YCk7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBFcnJvckZhY3RvcnkuZXh0ZXJuYWwoXHJcbiAgICAgICAgICAnSFRUUF9FUlJPUicsXHJcbiAgICAgICAgICBgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gLFxyXG4gICAgICAgICAgeyBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cywgc3RhdHVzVGV4dDogcmVzcG9uc2Uuc3RhdHVzVGV4dCB9XHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgY29uc3QgcmF0ZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7IFVTRDogMS4wIH07XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZGF0YS5yYXRlcykge1xyXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKGRhdGEucmF0ZXMpLmZvckVhY2goKFtjdXJyZW5jeSwgcmF0ZV0pID0+IHtcclxuICAgICAgICAgIHJhdGVzW2N1cnJlbmN5XSA9IHJhdGUgYXMgbnVtYmVyO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBmcm9tVXBwZXIgPSBmcm9tLnRvVXBwZXJDYXNlKCk7XHJcbiAgICAgIGNvbnN0IHRvVXBwZXIgPSB0by50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgaWYgKCFyYXRlc1tmcm9tVXBwZXJdIHx8ICFyYXRlc1t0b1VwcGVyXSkge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBpZDogcmVxdWVzdC5pZCxcclxuICAgICAgICAgIGRhdGFTb3VyY2VJZDogcmVxdWVzdC5kYXRhU291cmNlSWQsXHJcbiAgICAgICAgICBxdWVyeUtleTogcmVxdWVzdC5xdWVyeUtleSxcclxuICAgICAgICAgIGRhdGE6IDEsXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGlkOiByZXF1ZXN0LmlkLFxyXG4gICAgICAgIGRhdGFTb3VyY2VJZDogcmVxdWVzdC5kYXRhU291cmNlSWQsXHJcbiAgICAgICAgcXVlcnlLZXk6IHJlcXVlc3QucXVlcnlLZXksXHJcbiAgICAgICAgZGF0YTogcmF0ZXNbdG9VcHBlcl0gLyByYXRlc1tmcm9tVXBwZXJdLFxyXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpZDogcmVxdWVzdC5pZCxcclxuICAgICAgICBkYXRhU291cmNlSWQ6IHJlcXVlc3QuZGF0YVNvdXJjZUlkLFxyXG4gICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxyXG4gICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcclxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZW5lcmljIEhUVFAgZGF0YSBzb3VyY2Ugc3RyYXRlZ3lcclxuICovXHJcbmV4cG9ydCBjbGFzcyBIdHRwRGF0YVNvdXJjZSBpbXBsZW1lbnRzIERhdGFTb3VyY2VTdHJhdGVneSB7XHJcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBjb25maWc6IERhdGFTb3VyY2VDb25maWcpIHt9XHJcblxyXG4gIGFzeW5jIGV4ZWN1dGUocmVxdWVzdDogRmV0Y2hSZXF1ZXN0KTogUHJvbWlzZTxGZXRjaFJlc3BvbnNlPiB7XHJcbiAgICBpZiAoIXRoaXMuY29uZmlnLmVuZHBvaW50KSB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQ6IHJlcXVlc3QuaWQsXHJcbiAgICAgICAgZGF0YVNvdXJjZUlkOiByZXF1ZXN0LmRhdGFTb3VyY2VJZCxcclxuICAgICAgICBxdWVyeUtleTogcmVxdWVzdC5xdWVyeUtleSxcclxuICAgICAgICBlcnJvcjogJ05vIGVuZHBvaW50IGNvbmZpZ3VyZWQnLFxyXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodGhpcy5jb25maWcuZW5kcG9pbnQpO1xyXG4gICAgICBcclxuICAgICAgcmVxdWVzdC5xdWVyeUtleS5mb3JFYWNoKChrZXksIGluZGV4KSA9PiB7XHJcbiAgICAgICAgaWYgKGluZGV4ID4gMCkge1xyXG4gICAgICAgICAgdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoYHBhcmFtJHtpbmRleH1gLCBTdHJpbmcoa2V5KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLnRvU3RyaW5nKCksIHtcclxuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQodGhpcy5jb25maWcudGltZW91dCB8fCA1MDAwKVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBFcnJvckZhY3RvcnkuZXh0ZXJuYWwoXHJcbiAgICAgICAgICAnSFRUUF9FUlJPUicsXHJcbiAgICAgICAgICBgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gLFxyXG4gICAgICAgICAgeyBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cywgc3RhdHVzVGV4dDogcmVzcG9uc2Uuc3RhdHVzVGV4dCB9XHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQ6IHJlcXVlc3QuaWQsXHJcbiAgICAgICAgZGF0YVNvdXJjZUlkOiByZXF1ZXN0LmRhdGFTb3VyY2VJZCxcclxuICAgICAgICBxdWVyeUtleTogcmVxdWVzdC5xdWVyeUtleSxcclxuICAgICAgICBkYXRhLFxyXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpZDogcmVxdWVzdC5pZCxcclxuICAgICAgICBkYXRhU291cmNlSWQ6IHJlcXVlc3QuZGF0YVNvdXJjZUlkLFxyXG4gICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxyXG4gICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcclxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb25maWd1cmFibGUgd29ya2VyIHdpdGggc3RyYXRlZ3kgcGF0dGVyblxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYWJsZVdvcmtlciBpbXBsZW1lbnRzIElXb3JrZXIge1xyXG4gIHByaXZhdGUgc3RyYXRlZ2llcyA9IG5ldyBNYXA8c3RyaW5nLCBEYXRhU291cmNlU3RyYXRlZ3k+KCk7XHJcbiAgcHJpdmF0ZSBtZXNzYWdlSGFuZGxlcj86IChyZXNwb25zZTogV29ya2VyUmVzcG9uc2UpID0+IHZvaWQ7XHJcbiAgcHJpdmF0ZSBlcnJvckhhbmRsZXI/OiAoZXJyb3I6IEVycm9yKSA9PiB2b2lkO1xyXG5cclxuICAvKipcclxuICAgKiBSZWdpc3RlciBhIGRhdGEgc291cmNlIHN0cmF0ZWd5XHJcbiAgICovXHJcbiAgcmVnaXN0ZXJTdHJhdGVneSh0eXBlOiBzdHJpbmcsIHN0cmF0ZWd5OiBEYXRhU291cmNlU3RyYXRlZ3kpOiB2b2lkIHtcclxuICAgIHRoaXMuc3RyYXRlZ2llcy5zZXQodHlwZSwgc3RyYXRlZ3kpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUG9zdCBhIG1lc3NhZ2UgdG8gdGhlIHdvcmtlclxyXG4gICAqL1xyXG4gIHBvc3RNZXNzYWdlKG1lc3NhZ2U6IFdvcmtlck1lc3NhZ2UpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgdHlwZSwgcGF5bG9hZCB9ID0gbWVzc2FnZTtcclxuICAgIFxyXG4gICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgIGNhc2UgJ0ZFVENIX1JFUVVFU1QnOlxyXG4gICAgICAgIHRoaXMuaGFuZGxlRmV0Y2hSZXF1ZXN0KHBheWxvYWQgYXMgRmV0Y2hSZXF1ZXN0KTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnUkVHSVNURVJfREFUQV9TT1VSQ0UnOlxyXG4gICAgICAgIHRoaXMuaGFuZGxlUmVnaXN0ZXJEYXRhU291cmNlKHBheWxvYWQgYXMgRGF0YVNvdXJjZUNvbmZpZyk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgY29uc29sZS53YXJuKGBVbmtub3duIG1lc3NhZ2UgdHlwZTogJHt0eXBlfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlIGluY29taW5nIG1lc3NhZ2VzIGZyb20gdGhlIHdvcmtlclxyXG4gICAqL1xyXG4gIG9uTWVzc2FnZShoYW5kbGVyOiAocmVzcG9uc2U6IFdvcmtlclJlc3BvbnNlKSA9PiB2b2lkKTogdm9pZCB7XHJcbiAgICB0aGlzLm1lc3NhZ2VIYW5kbGVyID0gaGFuZGxlcjtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEhhbmRsZSB3b3JrZXIgZXJyb3JzXHJcbiAgICovXHJcbiAgb25FcnJvcihoYW5kbGVyOiAoZXJyb3I6IEVycm9yKSA9PiB2b2lkKTogdm9pZCB7XHJcbiAgICB0aGlzLmVycm9ySGFuZGxlciA9IGhhbmRsZXI7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUZXJtaW5hdGUgdGhlIHdvcmtlclxyXG4gICAqL1xyXG4gIHRlcm1pbmF0ZSgpOiB2b2lkIHtcclxuICAgIHRoaXMuc3RyYXRlZ2llcy5jbGVhcigpO1xyXG4gICAgdGhpcy5tZXNzYWdlSGFuZGxlciA9IHVuZGVmaW5lZDtcclxuICAgIHRoaXMuZXJyb3JIYW5kbGVyID0gdW5kZWZpbmVkO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVGZXRjaFJlcXVlc3QocmVxdWVzdDogRmV0Y2hSZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBzdHJhdGVneSA9IHRoaXMuc3RyYXRlZ2llcy5nZXQocmVxdWVzdC5kYXRhU291cmNlSWQpO1xyXG4gICAgaWYgKCFzdHJhdGVneSkge1xyXG4gICAgICB0aGlzLnBvc3RSZXNwb25zZSh7XHJcbiAgICAgICAgdHlwZTogJ0ZFVENIX0VSUk9SJyxcclxuICAgICAgICBwYXlsb2FkOiB7XHJcbiAgICAgICAgICBpZDogcmVxdWVzdC5pZCxcclxuICAgICAgICAgIGVycm9yOiBgTm8gc3RyYXRlZ3kgZm9yIGRhdGEgc291cmNlOiAke3JlcXVlc3QuZGF0YVNvdXJjZUlkfWBcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKHJlcXVlc3QpO1xyXG4gICAgICB0aGlzLnBvc3RSZXNwb25zZSh7XHJcbiAgICAgICAgdHlwZTogJ0ZFVENIX1JFU1BPTlNFJyxcclxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZVxyXG4gICAgICB9KTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMucG9zdFJlc3BvbnNlKHtcclxuICAgICAgICB0eXBlOiAnRkVUQ0hfRVJST1InLFxyXG4gICAgICAgIHBheWxvYWQ6IHtcclxuICAgICAgICAgIGlkOiByZXF1ZXN0LmlkLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlUmVnaXN0ZXJEYXRhU291cmNlKGNvbmZpZzogRGF0YVNvdXJjZUNvbmZpZyk6IHZvaWQge1xyXG4gICAgbGV0IHN0cmF0ZWd5OiBEYXRhU291cmNlU3RyYXRlZ3k7XHJcbiAgICBcclxuICAgIHN3aXRjaCAoY29uZmlnLnR5cGUpIHtcclxuICAgICAgY2FzZSAnY3VycmVuY3knOlxyXG4gICAgICAgIHN0cmF0ZWd5ID0gbmV3IEN1cnJlbmN5RGF0YVNvdXJjZShjb25maWcuZW5kcG9pbnQgfHwgJycpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdodHRwJzpcclxuICAgICAgICBzdHJhdGVneSA9IG5ldyBIdHRwRGF0YVNvdXJjZShjb25maWcpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIGNvbnNvbGUud2FybihgVW5rbm93biBkYXRhIHNvdXJjZSB0eXBlOiAke2NvbmZpZy50eXBlfWApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnN0cmF0ZWdpZXMuc2V0KGNvbmZpZy5pZCwgc3RyYXRlZ3kpO1xyXG4gICAgdGhpcy5wb3N0UmVzcG9uc2Uoe1xyXG4gICAgICB0eXBlOiAnREFUQV9TT1VSQ0VfUkVHSVNURVJFRCcsXHJcbiAgICAgIHBheWxvYWQ6IHsgY29uZmlnIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwb3N0UmVzcG9uc2UocmVzcG9uc2U6IFdvcmtlclJlc3BvbnNlKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5tZXNzYWdlSGFuZGxlcikge1xyXG4gICAgICB0aGlzLm1lc3NhZ2VIYW5kbGVyKHJlc3BvbnNlKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBXb3JrZXIgcG9vbCBmb3IgbWFuYWdpbmcgbXVsdGlwbGUgd29ya2Vyc1xyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFdvcmtlclBvb2wge1xyXG4gIHByaXZhdGUgd29ya2VyczogSVdvcmtlcltdID0gW107XHJcbiAgcHJpdmF0ZSBjdXJyZW50SW5kZXggPSAwO1xyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgYSB3b3JrZXIgcG9vbFxyXG4gICAqL1xyXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgc2l6ZTogbnVtYmVyID0gNCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzaXplOyBpKyspIHtcclxuICAgICAgdGhpcy53b3JrZXJzLnB1c2gobmV3IENvbmZpZ3VyYWJsZVdvcmtlcigpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBuZXh0IHdvcmtlciBpbiByb3VuZC1yb2JpbiBmYXNoaW9uXHJcbiAgICovXHJcbiAgZ2V0TmV4dCgpOiBJV29ya2VyIHtcclxuICAgIGNvbnN0IHdvcmtlciA9IHRoaXMud29ya2Vyc1t0aGlzLmN1cnJlbnRJbmRleF07XHJcbiAgICB0aGlzLmN1cnJlbnRJbmRleCA9ICh0aGlzLmN1cnJlbnRJbmRleCArIDEpICUgdGhpcy53b3JrZXJzLmxlbmd0aDtcclxuICAgIHJldHVybiB3b3JrZXI7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUZXJtaW5hdGUgYWxsIHdvcmtlcnNcclxuICAgKi9cclxuICB0ZXJtaW5hdGUoKTogdm9pZCB7XHJcbiAgICBmb3IgKGNvbnN0IHdvcmtlciBvZiB0aGlzLndvcmtlcnMpIHtcclxuICAgICAgd29ya2VyLnRlcm1pbmF0ZSgpO1xyXG4gICAgfVxyXG4gICAgdGhpcy53b3JrZXJzID0gW107XHJcbiAgfVxyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBOzs7QUNxR08sSUFBTSxhQUFOLE1BQU0sb0JBQW1CLE1BQU07QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY3BDLFlBQ2tCLFVBQ0EsTUFDaEIsU0FDZ0IsV0FBMEIscUJBQzFCLFdBQTBCLG1CQUMxQixTQUNoQjtBQUNBLFVBQU0sT0FBTztBQVBHO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFHaEIsU0FBSyxPQUFPO0FBQ1osU0FBSyxZQUFZLG9CQUFJLEtBQUs7QUFHMUIsUUFBSSxNQUFNLG1CQUFtQjtBQUMzQixZQUFNLGtCQUFrQixNQUFNLFdBQVU7QUFBQSxJQUMxQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFNBQWtDO0FBQ2hDLFdBQU87QUFBQSxNQUNMLE1BQU0sS0FBSztBQUFBLE1BQ1gsVUFBVSxLQUFLO0FBQUEsTUFDZixNQUFNLEtBQUs7QUFBQSxNQUNYLFNBQVMsS0FBSztBQUFBLE1BQ2QsVUFBVSxLQUFLO0FBQUEsTUFDZixVQUFVLEtBQUs7QUFBQSxNQUNmLFNBQVMsS0FBSztBQUFBLE1BQ2QsV0FBVyxLQUFLLFVBQVUsWUFBWTtBQUFBLElBQ3hDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsZ0JBQXlCO0FBQ3ZCLFdBQU8sS0FBSyxhQUFhO0FBQUEsRUFDM0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFNBQWlCO0FBQ2YsVUFBTSxPQUFPLElBQUksS0FBSyxRQUFRLEtBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxPQUFPO0FBQzdELFFBQUksS0FBSyxTQUFTO0FBQ2hCLFlBQU0sYUFBYSxLQUFLLFVBQVUsS0FB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
