/**
 * Unit tests for aggregate creation and confirmation behavior.
 */
import { describe, expect, it } from 'vitest';

import {
	ReservationAggregate,
	ReservationExpiredError,
	ReservationNotConfirmableError,
	ReservationStatus,
} from '../../src/domain';

describe('ReservationAggregate', () => {
	const NOW = 1_000_000;

	it('should create an active reservation and emit ReservationCreated', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', 5000, NOW);
		const events = reservation.pullEvents();

		expect(reservation.status).toBe(ReservationStatus.ACTIVE);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe('ReservationCreated');
	});

	it('should confirm an active reservation and emit ReservationConfirmed', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', 5000, NOW);
		reservation.pullEvents();

		reservation.confirm(NOW + 1000);
		const events = reservation.pullEvents();

		expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe('ReservationConfirmed');
	});

	it('should throw ReservationExpiredError when confirming after expiresAt', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', -1, NOW);
		reservation.pullEvents();

		expect(() => reservation.confirm(NOW)).toThrow(ReservationExpiredError);
	});

	it('should throw ReservationNotConfirmableError when confirming twice', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', 5000, NOW);
		reservation.pullEvents();

		reservation.confirm(NOW + 100);
		reservation.pullEvents();

		expect(() => reservation.confirm(NOW + 200)).toThrow(ReservationNotConfirmableError);
	});
});
