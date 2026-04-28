/**
 * Event-sourced reservation aggregate responsible for enforcing
 * reservation lifecycle rules and invariants.
 *
 * Key design decisions:
 * - State is derived exclusively from domain events (event sourcing)
 * - Time is injected (`now`) instead of using Date.now() to ensure determinism and testability
 *
 * Invariants enforced:
 * - Only ACTIVE reservations may transition to CONFIRMED
 * - Expired reservations cannot be confirmed
 * - A reservation can only transition once out of ACTIVE
 *
 * Reservation lifecycle:
 * ACTIVE → CONFIRMED | EXPIRED
 */
import crypto from 'crypto';

import { DomainEvent, ReservationConfirmed, ReservationCreated, ReservationExpired } from './events';
import { ReservationStatus } from './reservation-status';

export class ReservationAggregate {
	id!: string;
	itemId!: string;
	userId!: string;
	status!: ReservationStatus;
	expiresAt!: number;

	private changes: DomainEvent[] = [];

	static create(itemId: string, userId: string, ttlMs: number, now: number) {
		const agg = new ReservationAggregate();
		// Creation is expressed as an event to ensure all state transitions are replayable
		const event = new ReservationCreated(crypto.randomUUID(), itemId, userId, now + ttlMs);

		agg.apply(event);
		agg.changes.push(event);

		return agg;
	}

	confirm(now: number) {
		// Guard invariant: only ACTIVE and non-expired reservations can be confirmed
		if (this.status !== ReservationStatus.ACTIVE || this.isExpired(now)) {
			throw new Error('Cannot confirm');
		}

		const event = new ReservationConfirmed(this.id);
		this.apply(event);
		this.changes.push(event);
	}

	expire() {
		// Expiration is idempotent: only ACTIVE reservations can transition to EXPIRED
		if (this.status === ReservationStatus.ACTIVE) {
			const event = new ReservationExpired(this.id);
			this.apply(event);
			this.changes.push(event);
		}
	}

	isExpired(now: number) {
		// Expiration is time-based and evaluated externally to keep logic deterministic
		return now > this.expiresAt;
	}

	apply(event: DomainEvent) {
		// Apply mutates state based on event type (single source of truth for state transitions)
		switch (event.type) {
			case 'ReservationCreated': {
				const e1 = event as ReservationCreated;
				this.id = e1.reservationId;
				this.itemId = e1.itemId;
				this.userId = e1.userId;
				this.expiresAt = e1.expiresAt;
				this.status = ReservationStatus.ACTIVE;
				break;
			}

			case 'ReservationConfirmed':
				// Transition to CONFIRMED is terminal and cannot be reversed
				this.status = ReservationStatus.CONFIRMED;
				break;

			case 'ReservationExpired':
				// Transition to EXPIRED is terminal and prevents further actions
				this.status = ReservationStatus.EXPIRED;
				break;
		}
	}

	pullEvents(): DomainEvent[] {
		// Event sourcing pattern: expose uncommitted changes for persistence,
		// then clear the internal buffer to avoid duplicate writes
		const out = [...this.changes];
		this.changes = [];
		return out;
	}
}
