import { describe, expect, test, jest } from "@jest/globals";
import { PluginEventBus } from "@app/eventbus/PluginEventBus";

describe("PluginEventBus", () => {
  test("on registers a listener for an event", () => {
    const bus = new PluginEventBus();
    const listener = jest.fn();
    bus.on(1, listener);
    bus.emit(1, "hello");
    expect(listener).toHaveBeenCalledWith("hello");
  });

  test("on registers multiple listeners for the same event", () => {
    const bus = new PluginEventBus();
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    bus.on(1, listener1);
    bus.on(1, listener2);
    bus.emit(1, "test");
    expect(listener1).toHaveBeenCalledWith("test");
    expect(listener2).toHaveBeenCalledWith("test");
  });

  test("emit with no listeners does nothing", () => {
    const bus = new PluginEventBus();
    expect(() => bus.emit(99, "data")).not.toThrow();
  });

  test("emit passes multiple arguments to listeners", () => {
    const bus = new PluginEventBus();
    const listener = jest.fn();
    bus.on(1, listener);
    bus.emit(1, "a", "b", "c");
    expect(listener).toHaveBeenCalledWith("a", "b", "c");
  });

  test("removeListener removes a specific listener", () => {
    const bus = new PluginEventBus();
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    bus.on(1, listener1);
    bus.on(1, listener2);
    bus.removeListener(1, listener1);
    bus.emit(1, "data");
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledWith("data");
  });

  test("removeListener on non-existent event does nothing", () => {
    const bus = new PluginEventBus();
    const listener = jest.fn();
    expect(() => bus.removeListener(99, listener)).not.toThrow();
  });

  test("removeListener with non-registered listener does nothing", () => {
    const bus = new PluginEventBus();
    bus.on(1, jest.fn());
    expect(() => bus.removeListener(1, jest.fn())).not.toThrow();
  });

  test("removeAllListeners clears all events", () => {
    const bus = new PluginEventBus();
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    bus.on(1, listener1);
    bus.on(2, listener2);
    bus.removeAllListeners();
    bus.emit(1, "data");
    bus.emit(2, "data");
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  test("listeners receive different events independently", () => {
    const bus = new PluginEventBus();
    const listenerA = jest.fn();
    const listenerB = jest.fn();
    bus.on(10, listenerA);
    bus.on(20, listenerB);
    bus.emit(10, "event10");
    bus.emit(20, "event20");
    expect(listenerA).toHaveBeenCalledWith("event10");
    expect(listenerB).toHaveBeenCalledWith("event20");
    expect(listenerA).not.toHaveBeenCalledWith("event20");
  });

  test("same listener can be registered on multiple events", () => {
    const bus = new PluginEventBus();
    const listener = jest.fn();
    bus.on(1, listener);
    bus.on(2, listener);
    bus.emit(1, "first");
    bus.emit(2, "second");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("removeAllListeners works on an already-clean bus", () => {
    const bus = new PluginEventBus();
    expect(() => bus.removeAllListeners()).not.toThrow();
  });

  test("can re-register after removeListener", () => {
    const bus = new PluginEventBus();
    const listener = jest.fn();
    bus.on(1, listener);
    bus.removeListener(1, listener);
    bus.on(1, listener);
    bus.emit(1, "re-registered");
    expect(listener).toHaveBeenCalledWith("re-registered");
  });
});
