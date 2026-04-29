/**
 * Typed domain errors for reservation flows. Prefer instanceof checks in tests
 * and API layers instead of string-matching on message.
 */

export class OutOfStockError extends Error {
	constructor(message = 'Out of stock') {
		super(message);
		this.name = 'OutOfStockError';
	}
}

export class ReservationNotFoundError extends Error {
	constructor(message = 'Not found') {
		super(message);
		this.name = 'ReservationNotFoundError';
	}
}

export class ReservationExpiredError extends Error {
	constructor(message = 'Reservation expired') {
		super(message);
		this.name = 'ReservationExpiredError';
	}
}

export class ReservationNotConfirmableError extends Error {
	constructor(message = 'Reservation not confirmable') {
		super(message);
		this.name = 'ReservationNotConfirmableError';
	}
}

export class OversellInvariantError extends Error {
	constructor(message = 'Invariant violated: overselling occurred') {
		super(message);
		this.name = 'OversellInvariantError';
	}
}
