import { describe, it, expect, beforeEach } from "vitest";
import { HookManager } from "../src/hooks/manager.js";

describe("HookManager", () => {
  let hooks: HookManager;

  beforeEach(() => {
    hooks = new HookManager();
  });

  it("should register and emit hooks", async () => {
    let called = false;
    hooks.on("session-start", () => {
      called = true;
    });

    await hooks.emit("session-start");
    expect(called).toBe(true);
  });

  it("should pass event data to handlers", async () => {
    let receivedData: Record<string, unknown> = {};
    hooks.on("turn-complete", (_event, data) => {
      receivedData = data;
    });

    await hooks.emit("turn-complete", { turnNumber: 5, model: "gemini-3.1-pro" });
    expect(receivedData.turnNumber).toBe(5);
    expect(receivedData.model).toBe("gemini-3.1-pro");
  });

  it("should support multiple handlers for the same event", async () => {
    let count = 0;
    hooks.on("session-end", () => { count++; });
    hooks.on("session-end", () => { count++; });
    hooks.on("session-end", () => { count++; });

    await hooks.emit("session-end");
    expect(count).toBe(3);
  });

  it("should handle handler errors gracefully", async () => {
    let secondCalled = false;
    hooks.on("error", () => {
      throw new Error("Handler error");
    });
    hooks.on("error", () => {
      secondCalled = true;
    });

    await hooks.emit("error");
    expect(secondCalled).toBe(true);
  });

  it("should remove handlers with off()", async () => {
    let called = false;
    const handler = () => { called = true; };

    hooks.on("session-start", handler);
    hooks.off("session-start", handler);

    await hooks.emit("session-start");
    expect(called).toBe(false);
  });

  it("should track handler count", () => {
    hooks.on("session-start", () => {});
    hooks.on("session-start", () => {});
    hooks.on("session-end", () => {});

    expect(hooks.handlerCount("session-start")).toBe(2);
    expect(hooks.handlerCount("session-end")).toBe(1);
    expect(hooks.handlerCount("error")).toBe(0);
  });

  it("should clear all handlers", () => {
    hooks.on("session-start", () => {});
    hooks.on("session-end", () => {});
    hooks.clear();

    expect(hooks.handlerCount("session-start")).toBe(0);
    expect(hooks.handlerCount("session-end")).toBe(0);
  });
});
