/**
 * Concurrency-focused integration tests for reservation use-cases.
 */
import { describe, expect, it } from "vitest";

import { Inventory, ReservationAggregate, ReservationCreated } from "../../src/domain";
import { InMemoryEventStore } from "../../src/infrastructure";
import { ReservationProjection } from "../../src/projections";
import { LockManager } from "../../src/services";
import { ConfirmReservationUseCase, ReserveItemUseCase } from "../../src/use-cases";

describe("Reservation use-case concurrency", () => {
  it("allows only one successful reservation under parallel stock contention", async () => {
    const now = 1_000_000;
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

    const [a, b] = await Promise.allSettled([
      reserveItem.execute("item-1", "user-1"),
      reserveItem.execute("item-1", "user-2"),
    ]);

    const fulfilled = [a, b].filter((result) => result.status === "fulfilled");
    const rejected = [a, b].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason instanceof Error
    ).toBeTruthy();
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      "Out of stock"
    );

    expect(projection.getAll()).toHaveLength(1);
    expect(
      store.getAll().filter((event) => event.type === "ReservationCreated")
    ).toHaveLength(1);
  });

  it("allows only one successful confirmation when confirms race", async () => {
    const now = 1_000_000;
    const clock = { now: () => now };
    const store = new InMemoryEventStore();
    const projection = new ReservationProjection();
    const lock = new LockManager();
    const inventory = new Inventory("item-1", 1);

    const reservation = ReservationAggregate.create("item-1", "user-1", 10_000, now);
    store.append(reservation.id, reservation.pullEvents());
    projection.apply(
      new ReservationCreated(
        reservation.id,
        "item-1",
        "user-1",
        reservation.expiresAt
      )
    );

    const confirmReservation = new ConfirmReservationUseCase(
      store,
      projection,
      inventory,
      lock,
      clock
    );

    const [a, b] = await Promise.allSettled([
      confirmReservation.execute(reservation.id),
      confirmReservation.execute(reservation.id),
    ]);

    const fulfilled = [a, b].filter((result) => result.status === "fulfilled");
    const rejected = [a, b].filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      "Cannot confirm"
    );
    expect(inventory.confirmed).toBe(1);
    expect(
      store.getAll().filter((event) => event.type === "ReservationConfirmed")
    ).toHaveLength(1);
  });
});
