/**
 * Use-case for creating reservations with idempotency, expiry cleanup,
 * availability checks, and per-item locking.
 *
 * Design decisions:
 * - Idempotency is user+item scoped for active holds.
 * - Expiry is checked inline before availability checks to reclaim stock early.
 * - Projection is updated immediately after append to keep this in-memory demo
 *   coherent without introducing an async projection pipeline.
 */
import { ClockPort, EventStorePort, ReservationReadModelPort } from '../application/ports';
import {
	Inventory,
	OutOfStockError,
	ReservationAggregate,
	ReservationCreated,
	ReservationStatus,
} from '../domain';
import { LockManager } from '../services';

const HOLD_MS = 2000; // shorten for demo

export class ReserveItemUseCase {
	constructor(
		private store: EventStorePort,
		private projection: ReservationReadModelPort,
		private inventory: Inventory,
		private lock: LockManager,
		private clock: ClockPort,
	) {}

	async execute(itemId: string, userId: string) {
		// All operations for this item are serialized to guarantee
		// linearizable consistency and prevent overselling
		return this.lock.execute(itemId, async () => {
			const now = this.clock.now();
			const reservations = this.projection.getByItem(itemId);

			// expire inline
			reservations.forEach((r) => {
				if (r.isExpired(now)) {
					r.expire();
					this.store.append(r.id, r.pullEvents());
				}
			});

			// Idempotency: a user keeps their existing active hold for this item.
			const existing = this.projection.getByUser(itemId, userId);
			if (existing) return existing;

			const active = reservations.filter((r) => r.status === ReservationStatus.ACTIVE);

			// Availability counts confirmed purchases and currently active holds.
			// Availability must account for active reservations to prevent
			// temporary over-allocation under concurrent requests
			const available = this.inventory.total - this.inventory.confirmed - active.length;

			if (available <= 0) throw new OutOfStockError();

			const agg = ReservationAggregate.create(itemId, userId, HOLD_MS, now);

			this.store.append(agg.id, agg.pullEvents());
			this.projection.apply(new ReservationCreated(agg.id, itemId, userId, agg.expiresAt));

			return agg;
		});
	}
}
