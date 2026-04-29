/**
 * Unit tests for aggregate expiry transitions and emitted events.
 */
import { describe, expect, it } from 'vitest';

import { ReservationAggregate, ReservationStatus } from '../../src/domain';

describe('ReservationAggregate expiry', () => {
	const NOW = 1_000_000;

	it('should expire an active reservation and emit ReservationExpired', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', 5000, NOW);
		reservation.pullEvents();

		reservation.expire();
		const events = reservation.pullEvents();

		expect(reservation.status).toBe(ReservationStatus.EXPIRED);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe('ReservationExpired');
	});

	it('should not emit events when expire is called on a confirmed reservation', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', 5000, NOW);
		reservation.pullEvents();

		reservation.confirm(NOW + 1000);
		reservation.pullEvents();

		reservation.expire();
		const events = reservation.pullEvents();

		expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
		expect(events).toHaveLength(0);
	});
});
