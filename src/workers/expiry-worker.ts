/**
 * Background worker that expires overdue active reservations.
 *
 * Design decisions:
 * - Polling sweep (interval) keeps the demo simple without external schedulers.
 * - Work is grouped by item and guarded by per-item locks to align with
 *   use-case locking and avoid conflicting state transitions.
 */
import { ClockPort, EventStorePort, ReservationReadModelPort } from '../application/ports';
import { ReservationAggregate, ReservationStatus } from '../domain';
import { LockManager } from '../services';

export class ExpiryWorker {
	// Uses same lock boundary as reservation flow to prevent race conditions
	// between expiration and confirmation

	private timer: NodeJS.Timeout | null = null;

	constructor(
		private projection: ReservationReadModelPort,
		private store: EventStorePort,
		private lock: LockManager,
		private clock: ClockPort,
	) {}

	start() {
		// Polling sweep (interval) keeps the demo simple without external schedulers.
		// Intentionally fire-and-forget for demo simplicity.
		this.timer = setInterval(() => this.run(), 500);
	}

	stop() {
		// Clear the interval to stop the worker.
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	async run() {
		const all = this.projection.getAll();

		const grouped = new Map<string, ReservationAggregate[]>();

		for (const r of all) {
			if (!grouped.has(r.itemId)) grouped.set(r.itemId, []);
			grouped.get(r.itemId)!.push(r);
		}

		await Promise.all(
			Array.from(grouped.entries()).map(([itemId, list]) =>
				// All operations for this item are serialized to guarantee
				// linearizable consistency and prevent overselling
				this.lock.execute(itemId, async () => {
					// Check for expired reservations and expire them inline.
					const now = this.clock.now();
					for (const r of list) {
						if (r.status === ReservationStatus.ACTIVE && r.isExpired(now)) {
							r.expire();
							this.store.append(r.id, r.pullEvents());
						}
					}
				}),
			),
		);
	}
}
