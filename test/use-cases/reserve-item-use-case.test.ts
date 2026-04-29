/**
 * Integration-style tests for reservation creation flows.
 */
import { describe, expect, it } from "vitest";

import {
	Inventory,
	OutOfStockError,
	ReservationStatus,
} from "../../src/domain";
import { InMemoryEventStore } from "../../src/infrastructure";
import { ReservationProjection } from "../../src/projections";
import { LockManager } from "../../src/services";
import { ReserveItemUseCase } from "../../src/use-cases";

describe("ReserveItemUseCase", () => {
	it("should create an active reservation and persist ReservationCreated", async () => {
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

	it("should return the same reservation when the same user reserves twice (idempotency)", async () => {
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

	it("should return the same reservation id when the same user reserves concurrently (idempotency under lock)", async () => {
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

		const [a, b] = await Promise.all([
			reserveItem.execute("item-1", "user-1"),
			reserveItem.execute("item-1", "user-1"),
		]);

		expect(a.id).toBe(b.id);
		expect(projection.getAll()).toHaveLength(1);
		expect(
			store.getAll().filter((e) => e.type === "ReservationCreated")
		).toHaveLength(1);
	});

	it("should reject a second user when no units remain after the first reservation", async () => {
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

		await expect(reserveItem.execute("item-1", "user-2")).rejects.toBeInstanceOf(
			OutOfStockError
		);
	});

	it("should expire stale holds inline and allow the next user to reserve the freed unit", async () => {
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
