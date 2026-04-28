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

async function simulate() {
	const store = new InMemoryEventStore();
	const projection = new ReservationProjection();
	const lock = new LockManager();
	const clock = new SystemClock();

	const inventory = new Inventory('item-1', 1);

	const reserve = new ReserveItemUseCase(store, projection, inventory, lock, clock);

	const worker = new ExpiryWorker(projection, store, lock, clock);
	worker.start();

	const results = await Promise.allSettled(Array.from({ length: 500 }).map((_, i) => reserve.execute('item-1', 'user-' + i)));

	const success = results.filter((r) => r.status === 'fulfilled').length;
	const failure = results.length - success;

	console.log('Success:', success);
	console.log('Failure:', failure);
	console.log('Total Events Stored:', store.getAll().length);
}

void simulate().then(() => {
	console.log('\n\nDone\n\n');
	exit(0);
});
