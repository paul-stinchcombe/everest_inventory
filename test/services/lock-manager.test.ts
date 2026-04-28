/**
 * Unit tests for keyed lock serialization and lock release on errors.
 */
import { describe, expect, it } from "vitest";

import { LockManager } from "../../src/services";

describe("LockManager", () => {
  it("runs same-key operations sequentially", async () => {
    const lock = new LockManager();
    const order: string[] = [];

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = lock.execute("item-1", async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
      return "first";
    });

    const second = lock.execute("item-1", async () => {
      order.push("second:start");
      order.push("second:end");
      return "second";
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("releases the lock even when a task errors", async () => {
    const lock = new LockManager();

    await expect(
      lock.execute("item-1", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    await expect(
      lock.execute("item-1", async () => "recovered")
    ).resolves.toBe("recovered");
  });
});
