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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
        var _a, _b;
        if (response.type === "FETCH_RESPONSE" && ((_a = response.payload) == null ? void 0 : _a.id) === request.id) {
          this.worker.onMessage(() => {
          });
          resolve(response.payload);
        } else if (response.type === "FETCH_ERROR" && ((_b = response.payload) == null ? void 0 : _b.id) === request.id) {
          this.worker.onMessage(() => {
          });
          resolve({
            id: request.id,
            dataSourceId: request.dataSourceId,
            queryKey: request.queryKey,
            error: response.payload.error,
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3NvbHZlLWpzL3NyYy93b3JrZXJzL0RhdGFRdWVyeVdvcmtlci50cyIsICIuLi9zcmMvc29sdmUtanMvc3JjL3dvcmtlcnMvRGF0YVNvdXJjZVN0cmF0ZWd5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIFByb2R1Y3Rpb24tZ3JhZGUgc2NhbGFibGUgZGF0YSBxdWVyeSB3b3JrZXJcbiAqIFJlZmFjdG9yZWQgdG8gYWN0IGFzIGEgcHVyZSBmZXRjaCBleGVjdXRvciBmb3IgdGhlIG1haW4gdGhyZWFkIFZpcnR1YWwgUXVlcnkgQ2xpZW50XG4gKiBcbiAqIEBtb2R1bGUgV29ya2Vyc1xuICovXG5cbmltcG9ydCB7IENvbmZpZ3VyYWJsZVdvcmtlciwgRGF0YVNvdXJjZUNvbmZpZywgRmV0Y2hSZXF1ZXN0LCBGZXRjaFJlc3BvbnNlIH0gZnJvbSAnLi9EYXRhU291cmNlU3RyYXRlZ3knO1xuaW1wb3J0IHsgSVdvcmtlciwgV29ya2VyTWVzc2FnZSwgV29ya2VyUmVzcG9uc2UgfSBmcm9tICcuL1dvcmtlckludGVyZmFjZSc7XG5cbi8qKlxuICogRGF0YSBxdWVyeSB3b3JrZXIgaW1wbGVtZW50YXRpb25cbiAqIFxuICogQHJlbWFya3NcbiAqIFRoaXMgd29ya2VyIGlzIHJlc3BvbnNpYmxlIGZvciBleGVjdXRpbmcgZGF0YSBmZXRjaCBvcGVyYXRpb25zIGluIGEgYmFja2dyb3VuZCB0aHJlYWQuXG4gKiBJdCB1c2VzIGEgc3RyYXRlZ3kgcGF0dGVybiB0byBzdXBwb3J0IG11bHRpcGxlIGRhdGEgc291cmNlIHR5cGVzLlxuICogXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3Qgd29ya2VyID0gbmV3IERhdGFRdWVyeVdvcmtlcigpO1xuICogd29ya2VyLnJlZ2lzdGVyRGF0YVNvdXJjZSh7XG4gKiAgIGlkOiAnY3VycmVuY3knLFxuICogICB0eXBlOiAnY3VycmVuY3knLFxuICogICBlbmRwb2ludDogJ2h0dHBzOi8vYXBpLmZyYW5rZnVydGVyLmRldi92Mi9yYXRlcydcbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBEYXRhUXVlcnlXb3JrZXIge1xuICBwcml2YXRlIHdvcmtlcjogSVdvcmtlcjtcbiAgcHJpdmF0ZSBtZXNzYWdlSGFuZGxlcnM6IE1hcDxzdHJpbmcsIChyZXNwb25zZTogV29ya2VyUmVzcG9uc2UpID0+IHZvaWQ+ID0gbmV3IE1hcCgpO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMud29ya2VyID0gbmV3IENvbmZpZ3VyYWJsZVdvcmtlcigpO1xuICAgIHRoaXMuc2V0dXBNZXNzYWdlSGFuZGxlcnMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdpc3RlciBhIGRhdGEgc291cmNlIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIHJlZ2lzdGVyRGF0YVNvdXJjZShjb25maWc6IERhdGFTb3VyY2VDb25maWcpOiB2b2lkIHtcbiAgICB0aGlzLndvcmtlci5wb3N0TWVzc2FnZSh7XG4gICAgICB0eXBlOiAnUkVHSVNURVJfREFUQV9TT1VSQ0UnLFxuICAgICAgcGF5bG9hZDogY29uZmlnXG4gICAgfSBhcyBXb3JrZXJNZXNzYWdlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGEgZmV0Y2ggcmVxdWVzdFxuICAgKi9cbiAgYXN5bmMgZXhlY3V0ZUZldGNoKHJlcXVlc3Q6IEZldGNoUmVxdWVzdCk6IFByb21pc2U8RmV0Y2hSZXNwb25zZT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgaGFuZGxlciA9IChyZXNwb25zZTogV29ya2VyUmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKHJlc3BvbnNlLnR5cGUgPT09ICdGRVRDSF9SRVNQT05TRScgJiYgcmVzcG9uc2UucGF5bG9hZD8uaWQgPT09IHJlcXVlc3QuaWQpIHtcbiAgICAgICAgICB0aGlzLndvcmtlci5vbk1lc3NhZ2UoKCkgPT4ge30pOyAvLyBDbGVhciBoYW5kbGVyXG4gICAgICAgICAgcmVzb2x2ZShyZXNwb25zZS5wYXlsb2FkIGFzIEZldGNoUmVzcG9uc2UpO1xuICAgICAgICB9IGVsc2UgaWYgKHJlc3BvbnNlLnR5cGUgPT09ICdGRVRDSF9FUlJPUicgJiYgcmVzcG9uc2UucGF5bG9hZD8uaWQgPT09IHJlcXVlc3QuaWQpIHtcbiAgICAgICAgICB0aGlzLndvcmtlci5vbk1lc3NhZ2UoKCkgPT4ge30pO1xuICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgaWQ6IHJlcXVlc3QuaWQsXG4gICAgICAgICAgICBkYXRhU291cmNlSWQ6IHJlcXVlc3QuZGF0YVNvdXJjZUlkLFxuICAgICAgICAgICAgcXVlcnlLZXk6IHJlcXVlc3QucXVlcnlLZXksXG4gICAgICAgICAgICBlcnJvcjogcmVzcG9uc2UucGF5bG9hZC5lcnJvcixcbiAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICB0aGlzLndvcmtlci5vbk1lc3NhZ2UoaGFuZGxlcik7XG4gICAgdGhpcy53b3JrZXIucG9zdE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogJ0ZFVENIX1JFUVVFU1QnLFxuICAgICAgcGF5bG9hZDogcmVxdWVzdFxuICAgIH0gYXMgV29ya2VyTWVzc2FnZSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogVGVybWluYXRlIHRoZSB3b3JrZXJcbiAgICovXG4gIHRlcm1pbmF0ZSgpOiB2b2lkIHtcbiAgICB0aGlzLndvcmtlci50ZXJtaW5hdGUoKTtcbiAgICB0aGlzLm1lc3NhZ2VIYW5kbGVycy5jbGVhcigpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cE1lc3NhZ2VIYW5kbGVycygpOiB2b2lkIHtcbiAgICAvLyBTZXR1cCBhbnkgbmVjZXNzYXJ5IG1lc3NhZ2UgaGFuZGxlcnNcbiAgfVxufVxuXG4vKipcbiAqIFJlLWV4cG9ydCB0eXBlcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICovXG5leHBvcnQgdHlwZSB7IERhdGFTb3VyY2VUeXBlIH0gZnJvbSAnLi9EYXRhU291cmNlU3RyYXRlZ3knO1xuZXhwb3J0IHR5cGUgeyBEYXRhU291cmNlQ29uZmlnLCBGZXRjaFJlcXVlc3QsIEZldGNoUmVzcG9uc2UgfSBmcm9tICcuL0RhdGFTb3VyY2VTdHJhdGVneSc7XG4iLCAiLyoqXG4gKiBXb3JrZXIgU3RyYXRlZ3kgUGF0dGVybiBJbXBsZW1lbnRhdGlvblxuICogXG4gKiBUaGlzIG1vZHVsZSBwcm92aWRlcyBwbHVnZ2FibGUgZGF0YSBzb3VyY2Ugc3RyYXRlZ2llcyBmb3Igd29ya2Vycy5cbiAqIFxuICogQG1vZHVsZSBXb3JrZXJzXG4gKi9cblxuaW1wb3J0IHsgV29ya2VyTWVzc2FnZSwgV29ya2VyUmVzcG9uc2UsIElXb3JrZXIgfSBmcm9tICdAc29sdmUtanMvd29ya2Vycy9Xb3JrZXJJbnRlcmZhY2UnO1xuXG4vKipcbiAqIERhdGEgc291cmNlIHR5cGVzXG4gKi9cbmV4cG9ydCB0eXBlIERhdGFTb3VyY2VUeXBlID0gXCJjdXJyZW5jeVwiIHwgXCJhc3NldFwiIHwgXCJjb25maWdcIiB8IFwiY3VzdG9tXCIgfCBcImh0dHBcIjtcblxuLyoqXG4gKiBEYXRhIHNvdXJjZSBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YVNvdXJjZUNvbmZpZyB7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6IERhdGFTb3VyY2VUeXBlO1xuICBlbmRwb2ludD86IHN0cmluZztcbiAgcmVmcmVzaEludGVydmFsPzogbnVtYmVyO1xuICB0aW1lb3V0PzogbnVtYmVyO1xuICByZXRyeVBvbGljeT86IFJldHJ5UG9saWN5O1xufVxuXG4vKipcbiAqIFJldHJ5IHBvbGljeSBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUmV0cnlQb2xpY3kge1xuICBtYXhSZXRyaWVzOiBudW1iZXI7XG4gIGJhY2tvZmZNczogbnVtYmVyO1xuICBiYWNrb2ZmTXVsdGlwbGllcjogbnVtYmVyO1xufVxuXG4vKipcbiAqIEZldGNoIHJlcXVlc3QgZm9yIGRhdGEgc291cmNlc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEZldGNoUmVxdWVzdCB7XG4gIGlkOiBzdHJpbmc7XG4gIGRhdGFTb3VyY2VJZDogc3RyaW5nO1xuICBxdWVyeUtleTogc3RyaW5nW107XG4gIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBGZXRjaCByZXNwb25zZSBmcm9tIGRhdGEgc291cmNlc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEZldGNoUmVzcG9uc2Uge1xuICBpZDogc3RyaW5nO1xuICBkYXRhU291cmNlSWQ6IHN0cmluZztcbiAgcXVlcnlLZXk6IHN0cmluZ1tdO1xuICBkYXRhPzogdW5rbm93bjtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG4vKipcbiAqIERhdGEgc291cmNlIHN0cmF0ZWd5IGludGVyZmFjZVxuICovXG5leHBvcnQgaW50ZXJmYWNlIERhdGFTb3VyY2VTdHJhdGVneSB7XG4gIGV4ZWN1dGUocmVxdWVzdDogRmV0Y2hSZXF1ZXN0KTogUHJvbWlzZTxGZXRjaFJlc3BvbnNlPjtcbn1cblxuLyoqXG4gKiBDdXJyZW5jeSBkYXRhIHNvdXJjZSBzdHJhdGVneVxuICovXG5leHBvcnQgY2xhc3MgQ3VycmVuY3lEYXRhU291cmNlIGltcGxlbWVudHMgRGF0YVNvdXJjZVN0cmF0ZWd5IHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBlbmRwb2ludDogc3RyaW5nKSB7fVxuXG4gIGFzeW5jIGV4ZWN1dGUocmVxdWVzdDogRmV0Y2hSZXF1ZXN0KTogUHJvbWlzZTxGZXRjaFJlc3BvbnNlPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IFssIGZyb20sIHRvXSA9IHJlcXVlc3QucXVlcnlLZXk7XG4gICAgICBcbiAgICAgIGlmICghZnJvbSB8fCAhdG8pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpZDogcmVxdWVzdC5pZCxcbiAgICAgICAgICBkYXRhU291cmNlSWQ6IHJlcXVlc3QuZGF0YVNvdXJjZUlkLFxuICAgICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxuICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBjdXJyZW5jeSBxdWVyeSBrZXknLFxuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBpZiAoZnJvbS50b1VwcGVyQ2FzZSgpID09PSB0by50b1VwcGVyQ2FzZSgpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaWQ6IHJlcXVlc3QuaWQsXG4gICAgICAgICAgZGF0YVNvdXJjZUlkOiByZXF1ZXN0LmRhdGFTb3VyY2VJZCxcbiAgICAgICAgICBxdWVyeUtleTogcmVxdWVzdC5xdWVyeUtleSxcbiAgICAgICAgICBkYXRhOiAxLFxuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuZW5kcG9pbnR9P2Jhc2U9JHtmcm9tfWApO1xuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9OiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICBjb25zdCByYXRlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHsgVVNEOiAxLjAgfTtcbiAgICAgIFxuICAgICAgaWYgKGRhdGEucmF0ZXMpIHtcbiAgICAgICAgT2JqZWN0LmVudHJpZXMoZGF0YS5yYXRlcykuZm9yRWFjaCgoW2N1cnJlbmN5LCByYXRlXSkgPT4ge1xuICAgICAgICAgIHJhdGVzW2N1cnJlbmN5XSA9IHJhdGUgYXMgbnVtYmVyO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZnJvbVVwcGVyID0gZnJvbS50b1VwcGVyQ2FzZSgpO1xuICAgICAgY29uc3QgdG9VcHBlciA9IHRvLnRvVXBwZXJDYXNlKCk7XG5cbiAgICAgIGlmICghcmF0ZXNbZnJvbVVwcGVyXSB8fCAhcmF0ZXNbdG9VcHBlcl0pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpZDogcmVxdWVzdC5pZCxcbiAgICAgICAgICBkYXRhU291cmNlSWQ6IHJlcXVlc3QuZGF0YVNvdXJjZUlkLFxuICAgICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxuICAgICAgICAgIGRhdGE6IDEsXG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiByZXF1ZXN0LmlkLFxuICAgICAgICBkYXRhU291cmNlSWQ6IHJlcXVlc3QuZGF0YVNvdXJjZUlkLFxuICAgICAgICBxdWVyeUtleTogcmVxdWVzdC5xdWVyeUtleSxcbiAgICAgICAgZGF0YTogcmF0ZXNbdG9VcHBlcl0gLyByYXRlc1tmcm9tVXBwZXJdLFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiByZXF1ZXN0LmlkLFxuICAgICAgICBkYXRhU291cmNlSWQ6IHJlcXVlc3QuZGF0YVNvdXJjZUlkLFxuICAgICAgICBxdWVyeUtleTogcmVxdWVzdC5xdWVyeUtleSxcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcbiAgICAgIH07XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogR2VuZXJpYyBIVFRQIGRhdGEgc291cmNlIHN0cmF0ZWd5XG4gKi9cbmV4cG9ydCBjbGFzcyBIdHRwRGF0YVNvdXJjZSBpbXBsZW1lbnRzIERhdGFTb3VyY2VTdHJhdGVneSB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBEYXRhU291cmNlQ29uZmlnKSB7fVxuXG4gIGFzeW5jIGV4ZWN1dGUocmVxdWVzdDogRmV0Y2hSZXF1ZXN0KTogUHJvbWlzZTxGZXRjaFJlc3BvbnNlPiB7XG4gICAgaWYgKCF0aGlzLmNvbmZpZy5lbmRwb2ludCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHJlcXVlc3QuaWQsXG4gICAgICAgIGRhdGFTb3VyY2VJZDogcmVxdWVzdC5kYXRhU291cmNlSWQsXG4gICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxuICAgICAgICBlcnJvcjogJ05vIGVuZHBvaW50IGNvbmZpZ3VyZWQnLFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodGhpcy5jb25maWcuZW5kcG9pbnQpO1xuICAgICAgXG4gICAgICByZXF1ZXN0LnF1ZXJ5S2V5LmZvckVhY2goKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGluZGV4ID4gMCkge1xuICAgICAgICAgIHVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKGBwYXJhbSR7aW5kZXh9YCwgU3RyaW5nKGtleSkpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwudG9TdHJpbmcoKSwge1xuICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQodGhpcy5jb25maWcudGltZW91dCB8fCA1MDAwKVxuICAgICAgfSk7XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZDogcmVxdWVzdC5pZCxcbiAgICAgICAgZGF0YVNvdXJjZUlkOiByZXF1ZXN0LmRhdGFTb3VyY2VJZCxcbiAgICAgICAgcXVlcnlLZXk6IHJlcXVlc3QucXVlcnlLZXksXG4gICAgICAgIGRhdGEsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHJlcXVlc3QuaWQsXG4gICAgICAgIGRhdGFTb3VyY2VJZDogcmVxdWVzdC5kYXRhU291cmNlSWQsXG4gICAgICAgIHF1ZXJ5S2V5OiByZXF1ZXN0LnF1ZXJ5S2V5LFxuICAgICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBDb25maWd1cmFibGUgd29ya2VyIHdpdGggc3RyYXRlZ3kgcGF0dGVyblxuICovXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhYmxlV29ya2VyIGltcGxlbWVudHMgSVdvcmtlciB7XG4gIHByaXZhdGUgc3RyYXRlZ2llcyA9IG5ldyBNYXA8c3RyaW5nLCBEYXRhU291cmNlU3RyYXRlZ3k+KCk7XG4gIHByaXZhdGUgbWVzc2FnZUhhbmRsZXI/OiAocmVzcG9uc2U6IFdvcmtlclJlc3BvbnNlKSA9PiB2b2lkO1xuICBwcml2YXRlIGVycm9ySGFuZGxlcj86IChlcnJvcjogRXJyb3IpID0+IHZvaWQ7XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVyIGEgZGF0YSBzb3VyY2Ugc3RyYXRlZ3lcbiAgICovXG4gIHJlZ2lzdGVyU3RyYXRlZ3kodHlwZTogc3RyaW5nLCBzdHJhdGVneTogRGF0YVNvdXJjZVN0cmF0ZWd5KTogdm9pZCB7XG4gICAgdGhpcy5zdHJhdGVnaWVzLnNldCh0eXBlLCBzdHJhdGVneSk7XG4gIH1cblxuICAvKipcbiAgICogUG9zdCBhIG1lc3NhZ2UgdG8gdGhlIHdvcmtlclxuICAgKi9cbiAgcG9zdE1lc3NhZ2UobWVzc2FnZTogV29ya2VyTWVzc2FnZSk6IHZvaWQge1xuICAgIGNvbnN0IHsgdHlwZSwgcGF5bG9hZCB9ID0gbWVzc2FnZTtcbiAgICBcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ0ZFVENIX1JFUVVFU1QnOlxuICAgICAgICB0aGlzLmhhbmRsZUZldGNoUmVxdWVzdChwYXlsb2FkIGFzIEZldGNoUmVxdWVzdCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUkVHSVNURVJfREFUQV9TT1VSQ0UnOlxuICAgICAgICB0aGlzLmhhbmRsZVJlZ2lzdGVyRGF0YVNvdXJjZShwYXlsb2FkIGFzIERhdGFTb3VyY2VDb25maWcpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnNvbGUud2FybihgVW5rbm93biBtZXNzYWdlIHR5cGU6ICR7dHlwZX1gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGluY29taW5nIG1lc3NhZ2VzIGZyb20gdGhlIHdvcmtlclxuICAgKi9cbiAgb25NZXNzYWdlKGhhbmRsZXI6IChyZXNwb25zZTogV29ya2VyUmVzcG9uc2UpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLm1lc3NhZ2VIYW5kbGVyID0gaGFuZGxlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgd29ya2VyIGVycm9yc1xuICAgKi9cbiAgb25FcnJvcihoYW5kbGVyOiAoZXJyb3I6IEVycm9yKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5lcnJvckhhbmRsZXIgPSBoYW5kbGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlcm1pbmF0ZSB0aGUgd29ya2VyXG4gICAqL1xuICB0ZXJtaW5hdGUoKTogdm9pZCB7XG4gICAgdGhpcy5zdHJhdGVnaWVzLmNsZWFyKCk7XG4gICAgdGhpcy5tZXNzYWdlSGFuZGxlciA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLmVycm9ySGFuZGxlciA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlRmV0Y2hSZXF1ZXN0KHJlcXVlc3Q6IEZldGNoUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHN0cmF0ZWd5ID0gdGhpcy5zdHJhdGVnaWVzLmdldChyZXF1ZXN0LmRhdGFTb3VyY2VJZCk7XG4gICAgaWYgKCFzdHJhdGVneSkge1xuICAgICAgdGhpcy5wb3N0UmVzcG9uc2Uoe1xuICAgICAgICB0eXBlOiAnRkVUQ0hfRVJST1InLFxuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgaWQ6IHJlcXVlc3QuaWQsXG4gICAgICAgICAgZXJyb3I6IGBObyBzdHJhdGVneSBmb3IgZGF0YSBzb3VyY2U6ICR7cmVxdWVzdC5kYXRhU291cmNlSWR9YFxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKHJlcXVlc3QpO1xuICAgICAgdGhpcy5wb3N0UmVzcG9uc2Uoe1xuICAgICAgICB0eXBlOiAnRkVUQ0hfUkVTUE9OU0UnLFxuICAgICAgICBwYXlsb2FkOiByZXNwb25zZVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMucG9zdFJlc3BvbnNlKHtcbiAgICAgICAgdHlwZTogJ0ZFVENIX0VSUk9SJyxcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIGlkOiByZXF1ZXN0LmlkLFxuICAgICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVJlZ2lzdGVyRGF0YVNvdXJjZShjb25maWc6IERhdGFTb3VyY2VDb25maWcpOiB2b2lkIHtcbiAgICBsZXQgc3RyYXRlZ3k6IERhdGFTb3VyY2VTdHJhdGVneTtcbiAgICBcbiAgICBzd2l0Y2ggKGNvbmZpZy50eXBlKSB7XG4gICAgICBjYXNlICdjdXJyZW5jeSc6XG4gICAgICAgIHN0cmF0ZWd5ID0gbmV3IEN1cnJlbmN5RGF0YVNvdXJjZShjb25maWcuZW5kcG9pbnQgfHwgJycpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2h0dHAnOlxuICAgICAgICBzdHJhdGVneSA9IG5ldyBIdHRwRGF0YVNvdXJjZShjb25maWcpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnNvbGUud2FybihgVW5rbm93biBkYXRhIHNvdXJjZSB0eXBlOiAke2NvbmZpZy50eXBlfWApO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdHJhdGVnaWVzLnNldChjb25maWcuaWQsIHN0cmF0ZWd5KTtcbiAgICB0aGlzLnBvc3RSZXNwb25zZSh7XG4gICAgICB0eXBlOiAnREFUQV9TT1VSQ0VfUkVHSVNURVJFRCcsXG4gICAgICBwYXlsb2FkOiB7IGNvbmZpZyB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHBvc3RSZXNwb25zZShyZXNwb25zZTogV29ya2VyUmVzcG9uc2UpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5tZXNzYWdlSGFuZGxlcikge1xuICAgICAgdGhpcy5tZXNzYWdlSGFuZGxlcihyZXNwb25zZSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogV29ya2VyIHBvb2wgZm9yIG1hbmFnaW5nIG11bHRpcGxlIHdvcmtlcnNcbiAqL1xuZXhwb3J0IGNsYXNzIFdvcmtlclBvb2wge1xuICBwcml2YXRlIHdvcmtlcnM6IElXb3JrZXJbXSA9IFtdO1xuICBwcml2YXRlIGN1cnJlbnRJbmRleCA9IDA7XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIHdvcmtlciBwb29sXG4gICAqL1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHNpemU6IG51bWJlciA9IDQpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNpemU7IGkrKykge1xuICAgICAgdGhpcy53b3JrZXJzLnB1c2gobmV3IENvbmZpZ3VyYWJsZVdvcmtlcigpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IG5leHQgd29ya2VyIGluIHJvdW5kLXJvYmluIGZhc2hpb25cbiAgICovXG4gIGdldE5leHQoKTogSVdvcmtlciB7XG4gICAgY29uc3Qgd29ya2VyID0gdGhpcy53b3JrZXJzW3RoaXMuY3VycmVudEluZGV4XTtcbiAgICB0aGlzLmN1cnJlbnRJbmRleCA9ICh0aGlzLmN1cnJlbnRJbmRleCArIDEpICUgdGhpcy53b3JrZXJzLmxlbmd0aDtcbiAgICByZXR1cm4gd29ya2VyO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlcm1pbmF0ZSBhbGwgd29ya2Vyc1xuICAgKi9cbiAgdGVybWluYXRlKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3Qgd29ya2VyIG9mIHRoaXMud29ya2Vycykge1xuICAgICAgd29ya2VyLnRlcm1pbmF0ZSgpO1xuICAgIH1cbiAgICB0aGlzLndvcmtlcnMgPSBbXTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7OztBQ3FFTyxJQUFNLHFCQUFOLE1BQXVEO0FBQUEsRUFDNUQsWUFBb0IsVUFBa0I7QUFBbEI7QUFBQSxFQUFtQjtBQUFBLEVBRXZDLE1BQU0sUUFBUSxTQUErQztBQUMzRCxRQUFJO0FBQ0YsWUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksUUFBUTtBQUU3QixVQUFJLENBQUMsUUFBUSxDQUFDLElBQUk7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TTtBQUFBLE1BQ04sU0FBUyxFQUFFLE9BQU87QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsYUFBYSxVQUFnQztBQUNuRCxRQUFJLEtBQUssZ0JBQWdCO0FBQ3ZCLFdBQUssZUFBZSxRQUFRO0FBQUEsSUFDOUI7QUFBQSxFQUNGO0FBQ0Y7OztBRDNSTyxJQUFNLGtCQUFOLE1BQXNCO0FBQUEsRUFJM0IsY0FBYztBQUZkLFNBQVEsa0JBQW1FLG9CQUFJLElBQUk7QUFHakYsU0FBSyxTQUFTLElBQUksbUJBQW1CO0FBQ3JDLFNBQUsscUJBQXFCO0FBQUEsRUFDNUI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLG1CQUFtQixRQUFnQztBQUNqRCxTQUFLLE9BQU8sWUFBWTtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNYLENBQWtCO0FBQUEsRUFDcEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sYUFBYSxTQUErQztBQUNoRSxXQUFPLElBQUksUUFBUSxDQUFDLFlBQVk7QUFDOUIsWUFBTSxVQUFVLENBQUMsYUFBNkI7QUFuRHBEO0FBb0RRLFlBQUksU0FBUyxTQUFTLHNCQUFvQixjQUFTLFlBQVQsbUJBQWtCLFFBQU8sUUFBUSxJQUFJO0FBQzdFLGVBQUssT0FBTyxVQUFVLE1BQU07QUFBQSxVQUFDLENBQUM7QUFDOUIsa0JBQVEsU0FBUyxPQUF3QjtBQUFBLFFBQzNDLFdBQVcsU0FBUyxTQUFTLG1CQUFpQixjQUFTLFlBQVQsbUJBQWtCLFFBQU8sUUFBUSxJQUFJO0FBQ2pGLGVBQUssT0FBTyxVQUFVLE1BQU07QUFBQSxVQUFDLENBQUM7QUFDOUIsa0JBQVE7QUFBQSxZQUNOLElBQUksUUFBUTtBQUFBLFlBQ1osY0FBYyxRQUFRO0FBQUEsWUFDdEIsVUFBVSxRQUFRO0FBQUEsWUFDbEIsT0FBTyxTQUFTLFFBQVE7QUFBQSxZQUN4QixXQUFXLEtBQUssSUFBSTtBQUFBLFVBQ3RCLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRjtBQUVBLFdBQUssT0FBTyxVQUFVLE9BQU87QUFDL0IsV0FBSyxPQUFPLFlBQVk7QUFBQSxRQUN0QixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDWCxDQUFrQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxZQUFrQjtBQUNoQixTQUFLLE9BQU8sVUFBVTtBQUN0QixTQUFLLGdCQUFnQixNQUFNO0FBQUEsRUFDN0I7QUFBQSxFQUVRLHVCQUE2QjtBQUFBLEVBRXJDO0FBQ0Y7IiwKICAibmFtZXMiOiBbXQp9Cg==
