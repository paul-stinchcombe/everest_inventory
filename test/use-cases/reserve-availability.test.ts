/**
 * Deterministic tests for availability = total - confirmed - activeHolds.
 */
import { describe, expect, it } from "vitest";

import { Inventory, OutOfStockError, ReservationStatus } from "../../src/domain";
import { InMemoryEventStore } from "../../src/infrastructure";
import { ReservationProjection } from "../../src/projections";
import { LockManager } from "../../src/services";
import { ConfirmReservationUseCase, ReserveItemUseCase } from "../../src/use-cases";

describe("ReserveItemUseCase availability", () => {
	const NOW = 1_000_000;

	it("should allow a new reservation when one unit is confirmed and one other hold is active", async () => {
		const clock = { now: () => NOW };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();
		const inventory = new Inventory("item-1", 3, 0);

		const reserveItem = new ReserveItemUseCase(
			store,
			projection,
			inventory,
			lock,
			clock
		);
		const confirmReservation = new ConfirmReservationUseCase(
			store,
			projection,
			inventory,
			lock,
			clock
		);

		const r1 = await reserveItem.execute("item-1", "user-1");
		await confirmReservation.execute(r1.id);
		expect(inventory.confirmed).toBe(1);

		await reserveItem.execute("item-1", "user-2");

		const third = await reserveItem.execute("item-1", "user-3");
		expect(third.status).toBe(ReservationStatus.ACTIVE);
		expect(projection.getAll()).toHaveLength(3);
	});

	it("should reject a third user when two active holds already consume all stock", async () => {
		const clock = { now: () => NOW };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();
		const inventory = new Inventory("item-1", 2, 0);

		const reserveItem = new ReserveItemUseCase(
			store,
			projection,
			inventory,
			lock,
			clock
		);

		await reserveItem.execute("item-1", "user-1");
		await reserveItem.execute("item-1", "user-2");

		await expect(reserveItem.execute("item-1", "user-3")).rejects.toBeInstanceOf(
			OutOfStockError
		);
		expect(projection.getAll()).toHaveLength(2);
	});
});
