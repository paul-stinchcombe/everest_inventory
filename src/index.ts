/**
 * Composition root for the reservation demo.
 * Wires infrastructure, use-cases, and worker, then runs a load simulation.
 *
 * Design decision:
 * Keep dependency wiring centralized so domain/use-case modules remain
 * framework-agnostic and easy to test with alternate adapters.
 */
import { Inventory, OversellInvariantError } from './domain';
import { InMemoryEventStore } from './infrastructure';
import { ReservationProjection } from './projections';
import { LockManager, SystemClock } from './services';
import { ReserveItemUseCase } from './use-cases';
import { ExpiryWorker } from './workers';
import { exit } from 'node:process';

type LoadTestConfig = {
	itemId: string;
	users: number;
};

type SimulationResult = {
	success: number;
	failure: number;
	duration: number;
	eventCount: number;
};

async function runLoadTest(reserve: ReserveItemUseCase, config: LoadTestConfig) {
	return Promise.allSettled(Array.from({ length: config.users }).map((_, i) => reserve.execute(config.itemId, 'user-' + i)));
}

async function simulate(): Promise<SimulationResult> {
	const store = new InMemoryEventStore();
	const projection = new ReservationProjection();
	const lock = new LockManager();
	const clock = new SystemClock();

	const config: LoadTestConfig = {
		itemId: 'item-1',
		users: Number(process.env.USERS ?? 500),
	};

	// Initialize inventory with stock = 1 (high-contention scenario)
	const inventory = new Inventory(config.itemId, 1);

	const reserve = new ReserveItemUseCase(store, projection, inventory, lock, clock);

	const worker = new ExpiryWorker(projection, store, lock, clock);
	worker.start();

	const start = Date.now();

	try {
		const results = await runLoadTest(reserve, config);

		const duration = Date.now() - start;

		const success = results.filter((r) => r.status === 'fulfilled').length;
		const failure = results.length - success;

		const result: SimulationResult = {
			success,
			failure,
			duration,
			eventCount: store.getAll().length,
		};

		// invariant: only one reservation should succeed
		if (success !== 1) {
			throw new OversellInvariantError(`Expected 1 success, got ${success}`);
		}

		console.log('✅ Invariant satisfied: no overselling');

		return result;
	} finally {
		worker.stop();
	}
}

function printResult(result: SimulationResult) {
	console.log('Success:', result.success);
	console.log('Failure:', result.failure);
	console.log('Duration (ms):', result.duration);
	console.log('Total Events:', result.eventCount);
	console.log('Winning reservation count should be exactly 1');
}

void simulate()
	.then((result) => {
		printResult(result);
		console.log('\n\nDone\n\n');
	})
	.catch((err) => {
		console.error(err instanceof Error ? `Error: ${err.message}` : err);
		exit(1);
	});
