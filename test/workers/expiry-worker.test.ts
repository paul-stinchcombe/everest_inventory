/**
 * Tests for background expiry sweeps and time-boundary behavior.
 */
import { describe, expect, it } from 'vitest';

import {
	ReservationAggregate,
	ReservationCreated,
	ReservationStatus,
} from '../../src/domain';
import { InMemoryEventStore } from '../../src/infrastructure';
import { ReservationProjection } from '../../src/projections';
import { LockManager } from '../../src/services';
import { ExpiryWorker } from '../../src/workers';

describe('ExpiryWorker', () => {
	it('should expire active reservations that are past their expiry time', async () => {
		const now = 1_000_000;
		const clock = { now: () => now };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();

		const expiredReservation = ReservationAggregate.create('item-1', 'user-1', -1, now);
		store.append(expiredReservation.id, expiredReservation.pullEvents());
		projection.apply(
			new ReservationCreated(
				expiredReservation.id,
				'item-1',
				'user-1',
				expiredReservation.expiresAt
			)
		);

		const worker = new ExpiryWorker(projection, store, lock, clock);
		await worker.run();

		const updated = projection
			.getAll()
			.find((reservation) => reservation.id === expiredReservation.id);

		expect(updated?.status).toBe(ReservationStatus.EXPIRED);

		const eventTypes = store.getAll().map((event) => event.type);
		expect(eventTypes).toContain('ReservationExpired');
	});

	it('should not expire reservations when current time has not passed expiresAt', async () => {
		const now = 1_000_000;
		const clock = { now: () => now };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();

		const activeReservation = ReservationAggregate.create('item-1', 'user-1', 5000, now);
		store.append(activeReservation.id, activeReservation.pullEvents());
		projection.apply(
			new ReservationCreated(
				activeReservation.id,
				'item-1',
				'user-1',
				activeReservation.expiresAt
			)
		);

		const worker = new ExpiryWorker(projection, store, lock, clock);
		await worker.run();

		const updated = projection
			.getAll()
			.find((reservation) => reservation.id === activeReservation.id);

		expect(updated?.status).toBe(ReservationStatus.ACTIVE);

		const eventTypes = store.getAll().map((event) => event.type);
		expect(eventTypes).not.toContain('ReservationExpired');
	});

	it('should not expire when clock equals expiresAt (exclusive expiry boundary)', async () => {
		const now = 1_000_000;
		const clock = { now: () => now };
		const store = new InMemoryEventStore();
		const projection = new ReservationProjection();
		const lock = new LockManager();

		const reservation = ReservationAggregate.create('item-1', 'user-1', 0, now);
		expect(reservation.expiresAt).toBe(now);

		store.append(reservation.id, reservation.pullEvents());
		projection.apply(
			new ReservationCreated(reservation.id, 'item-1', 'user-1', reservation.expiresAt)
		);

		const worker = new ExpiryWorker(projection, store, lock, clock);
		await worker.run();

		const updated = projection.getAll().find((r) => r.id === reservation.id);
		expect(updated?.status).toBe(ReservationStatus.ACTIVE);
		expect(store.getAll().map((e) => e.type)).not.toContain('ReservationExpired');
	});
});
