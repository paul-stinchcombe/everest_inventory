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
	constructor(
		private projection: ReservationReadModelPort,
		private store: EventStorePort,
		private lock: LockManager,
		private clock: ClockPort,
	) {}

	start() {
		// Intentionally fire-and-forget for demo simplicity.
		setInterval(() => this.run(), 500);
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
				this.lock.execute(itemId, async () => {
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
