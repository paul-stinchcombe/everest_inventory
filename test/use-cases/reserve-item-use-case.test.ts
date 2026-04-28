/**
 * Integration-style tests for reservation creation flows.
 */
import { describe, expect, it } from "vitest";

import { Inventory, ReservationStatus } from "../../src/domain";
import { InMemoryEventStore } from "../../src/infrastructure";
import { ReservationProjection } from "../../src/projections";
import { LockManager } from "../../src/services";
import { ReserveItemUseCase } from "../../src/use-cases";

describe("ReserveItemUseCase", () => {
  it("creates a reservation and projects it as active", async () => {
    let now = 1_000_000;
    const clock = { now: () => now };
    const store = new InMemoryEventStore();
    const projection = new ReservationProjection();
    const lock = new LockManager();
    const inventory = new Inventory("item-1", 1);

    const reserveItem = new ReserveItemUseCase(
      store,
      projection,
      inventory,
      lock,
      clock
    );

    const reservation = await reserveItem.execute("item-1", "user-1");
    const projected = projection.getAll().find((r) => r.id === reservation.id);

    expect(projected?.status).toBe(ReservationStatus.ACTIVE);

    const eventTypes = store.getAll().map((event) => event.type);
    expect(eventTypes).toEqual(["ReservationCreated"]);
  });

  it("returns existing active reservation for same user (idempotent)", async () => {
    let now = 1_000_000;
    const clock = { now: () => now };
    const store = new InMemoryEventStore();
    const projection = new ReservationProjection();
    const lock = new LockManager();
    const inventory = new Inventory("item-1", 1);

    const reserveItem = new ReserveItemUseCase(
      store,
      projection,
      inventory,
      lock,
      clock
    );

    const first = await reserveItem.execute("item-1", "user-1");
    const second = await reserveItem.execute("item-1", "user-1");

    expect(second.id).toBe(first.id);
    expect(projection.getAll()).toHaveLength(1);

    const createdCount = store
      .getAll()
      .filter((event) => event.type === "ReservationCreated").length;
    expect(createdCount).toBe(1);
  });

  it("throws when no stock is available for a different user", async () => {
    let now = 1_000_000;
    const clock = { now: () => now };
    const store = new InMemoryEventStore();
    const projection = new ReservationProjection();
    const lock = new LockManager();
    const inventory = new Inventory("item-1", 1);

    const reserveItem = new ReserveItemUseCase(
      store,
      projection,
      inventory,
      lock,
      clock
    );

    await reserveItem.execute("item-1", "user-1");

    await expect(reserveItem.execute("item-1", "user-2")).rejects.toThrow(
      "Out of stock"
    );
  });

  it("expires old holds inline and allows a new reservation", async () => {
    let now = 1_000_000;
    const clock = { now: () => now };
    const store = new InMemoryEventStore();
    const projection = new ReservationProjection();
    const lock = new LockManager();
    const inventory = new Inventory("item-1", 1);

    const reserveItem = new ReserveItemUseCase(
      store,
      projection,
      inventory,
      lock,
      clock
    );

    const first = await reserveItem.execute("item-1", "user-1");
    now = 1_003_000;

    const second = await reserveItem.execute("item-1", "user-2");
    const firstProjected = projection.getAll().find((r) => r.id === first.id);

    expect(firstProjected?.status).toBe(ReservationStatus.EXPIRED);
    expect(second.id).not.toBe(first.id);

    const eventTypes = store.getAll().map((event) => event.type);
    expect(eventTypes).toContain("ReservationExpired");
    expect(
      eventTypes.filter((type) => type === "ReservationCreated").length
    ).toBe(2);
  });
});
