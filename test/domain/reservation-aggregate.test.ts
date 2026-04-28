/**
 * Unit tests for aggregate creation and confirmation behavior.
 */
import { describe, expect, it } from 'vitest';

import { ReservationAggregate, ReservationStatus } from '../../src/domain';

describe('ReservationAggregate', () => {
	const NOW = 1_000_000;

	it('creates an active reservation and emits ReservationCreated', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', 5000, NOW);
		const events = reservation.pullEvents();

		expect(reservation.status).toBe(ReservationStatus.ACTIVE);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe('ReservationCreated');
	});

	it('confirms an active reservation and emits ReservationConfirmed', () => {
		const reservation = ReservationAggregate.create('item-1', 'user-1', 5000, NOW);
		reservation.pullEvents();

		reservation.confirm(NOW + 1000);
		const events = reservation.pullEvents();

		expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe('ReservationConfirmed');
	});
});
