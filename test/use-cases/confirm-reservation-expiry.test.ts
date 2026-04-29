/**
 * Integration-style tests for confirmation success and failure paths.
 */
import { describe, expect, it } from 'vitest';

import {
	Inventory,
	ReservationAggregate,
	ReservationCreated,
	ReservationExpiredError,
	ReservationNotConfirmableError,
	ReservationNotFoundError,
	ReservationStatus,
} from '../../src/domain';
import { InMemoryEventStore } from '../../src/infrastructure';
import { ReservationProjection } from '../../src/projections';
import { LockManager } from '../../src/services';
import { ConfirmReservationUseCase } from '../../src/use-cases';

describe('ConfirmReservationUseCase', () => {
	it('should confirm an active reservation and increment confirmed inventory', async () => {
		const now = 1_000_000;
		const clock = { now: () => now };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();
		const inventory = new Inventory('item-1', 1);

		const reservation = ReservationAggregate.create('item-1', 'user-1', 10_000, now);
		store.append(reservation.id, reservation.pullEvents());
		projection.apply(
			new ReservationCreated(
				reservation.id,
				'item-1',
				'user-1',
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

		await expect(confirmReservation.execute(reservation.id)).resolves.toBeUndefined();
		expect(inventory.confirmed).toBe(1);

		const updated = projection.getAll().find((r) => r.id === reservation.id);
		expect(updated?.status).toBe(ReservationStatus.CONFIRMED);

		const eventTypes = store.getAll().map((event) => event.type);
		expect(eventTypes).toContain('ReservationConfirmed');
	});

	it('should throw ReservationNotFoundError when the reservation id does not exist', async () => {
		const now = 1_000_000;
		const clock = { now: () => now };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();
		const inventory = new Inventory('item-1', 1);

		const confirmReservation = new ConfirmReservationUseCase(
			store,
			projection,
			inventory,
			lock,
			clock
		);

		await expect(confirmReservation.execute('missing-id')).rejects.toBeInstanceOf(
			ReservationNotFoundError
		);
	});

	it('should not increment inventory or append events on a second confirmation of the same reservation', async () => {
		const now = 1_000_000;
		const clock = { now: () => now };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();
		const inventory = new Inventory('item-1', 1);

		const reservation = ReservationAggregate.create('item-1', 'user-1', 10_000, now);
		store.append(reservation.id, reservation.pullEvents());
		projection.apply(
			new ReservationCreated(
				reservation.id,
				'item-1',
				'user-1',
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

		await confirmReservation.execute(reservation.id);
		const eventCountAfterFirstConfirm = store.getAll().length;

		await expect(confirmReservation.execute(reservation.id)).rejects.toBeInstanceOf(
			ReservationNotConfirmableError
		);
		expect(inventory.confirmed).toBe(1);
		expect(store.getAll()).toHaveLength(eventCountAfterFirstConfirm);
	});

	it('should reject confirmation when the reservation has expired and persist ReservationExpired', async () => {
		const now = 1_000_000;
		const clock = { now: () => now };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();
		const inventory = new Inventory('item-1', 1);

		const reservation = ReservationAggregate.create('item-1', 'user-1', -1, now);
		store.append(reservation.id, reservation.pullEvents());
		projection.apply(
			new ReservationCreated(
				reservation.id,
				'item-1',
				'user-1',
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

		await expect(confirmReservation.execute(reservation.id)).rejects.toBeInstanceOf(
			ReservationExpiredError
		);
		expect(inventory.confirmed).toBe(0);

		const eventTypes = store.getAll().map((event) => event.type);
		expect(eventTypes).toContain('ReservationExpired');
	});
});
