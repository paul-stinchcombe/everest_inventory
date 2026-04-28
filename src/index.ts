/**
 * Composition root for the reservation demo.
 * Wires infrastructure, use-cases, and worker, then runs a load simulation.
 *
 * Design decision:
 * Keep dependency wiring centralized so domain/use-case modules remain
 * framework-agnostic and easy to test with alternate adapters.
 */
import { Inventory } from './domain';
import { InMemoryEventStore } from './infrastructure';
import { ReservationProjection } from './projections';
import { LockManager, SystemClock } from './services';
import { ReserveItemUseCase } from './use-cases';
import { ExpiryWorker } from './workers';
import { exit } from 'node:process';

async function runLoadTest(reserve: ReserveItemUseCase) {
	return Promise.allSettled(Array.from({ length: 500 }).map((_, i) => reserve.execute('item-1', 'user-' + i)));
}

async function simulate() {
	const store = new InMemoryEventStore();
	const projection = new ReservationProjection();
	const lock = new LockManager();
	const clock = new SystemClock();

	// Initialize inventory with stock = 1 (high-contention scenario)
	const inventory = new Inventory('item-1', 1);

	const reserve = new ReserveItemUseCase(store, projection, inventory, lock, clock);

	const worker = new ExpiryWorker(projection, store, lock, clock);
	worker.start();

	const start = Date.now();

	try {
		const results = await runLoadTest(reserve);

		const duration = Date.now() - start;

		const success = results.filter((r) => r.status === 'fulfilled').length;
		const failure = results.length - success;

		console.log('Success:', success);
		console.log('Failure:', failure);
		console.log('Duration (ms):', duration);
		console.log('Total Events Stored:', store.getAll().length, '(expected ~1-3)');

		// invariant: only one reservation should succeed
		if (success !== 1) {
			throw new Error('Invariant violated: overselling occurred');
		}

		console.log('✅ Invariant satisfied: no overselling');
		console.log('Winning reservation count should be exactly 1');
	} finally {
		worker.stop();
	}
}

void simulate()
	.then(() => {
		console.log('\n\nDone\n\n');
	})
	.catch((err) => {
		console.error(err);
		exit(1);
	});
