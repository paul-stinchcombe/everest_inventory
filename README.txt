Inventory Reservation Demo - Architecture and Locking Strategy

Overview
--------
This project is a TypeScript event-sourced reservation demo that models high-contention inventory booking.
It focuses on safe concurrent behavior for "reserve" and "confirm" operations.

Core ideas:
- Reservations are represented as aggregates driven by domain events.
- Current state is read from an in-memory projection.
- Writes are serialized per item using a keyed lock manager.
- Expiry is handled by both inline checks and a periodic worker.


Project structure
-----------------
src/
  index.ts                         Composition root and simulation runner

  domain/
    events.ts                      Domain event types (Created, Confirmed, Expired)
    reservation-status.ts          Reservation state enum
    reservation-aggregate.ts       Aggregate behavior + event application
    inventory.ts                   Inventory model
    index.ts                       Exports

  infrastructure/
    in-memory-event-store.ts       Append/load domain events in memory
    index.ts                       Exports

  projections/
    reservation-projection.ts      Read model for reservations by item/user
    index.ts                       Exports

  services/
    lock-manager.ts                Per-key async serialization primitive
    index.ts                       Exports

  use-cases/
    reserve-item-use-case.ts       Reserve flow with idempotency + availability checks
    confirm-reservation-use-case.ts Confirm flow with expiration guard
    index.ts                       Exports

  workers/
    expiry-worker.ts               Background sweep for expired reservations
    index.ts                       Exports

test/
  domain/
  services/
  README.md                        Test conventions


Architecture flow
-----------------
1) Reserve request (`ReserveItemUseCase.execute`)
   - Acquires lock for itemId.
   - Reads current reservations for that item from projection.
   - Expires stale ACTIVE reservations inline.
   - Applies idempotency check for same (itemId, userId).
   - Computes availability: total - confirmed - active.
   - Creates Reservation aggregate and emits ReservationCreated.
   - Appends events to event store and applies Created event to projection.

2) Confirm request (`ConfirmReservationUseCase.execute`)
   - Finds reservation in projection.
   - Acquires lock for reservation.itemId.
   - Re-checks expiration; if expired, emits ReservationExpired and aborts.
   - Emits ReservationConfirmed and increments confirmed inventory counter.

3) Expiry background process (`ExpiryWorker`)
   - Runs on interval.
   - Groups reservations by itemId.
   - For each item group, uses the same item lock.
   - Expires ACTIVE reservations whose TTL elapsed.
   - Appends expiration events.


Clear locking strategy
----------------------
Goal:
Prevent race conditions without globally serializing all traffic.

Mechanism:
- `LockManager.execute(key, fn)` keeps a promise chain per key.
- Each key (here: `itemId`) has its own queue.
- Calls with the same key run strictly one at a time.
- Calls with different keys run concurrently.
- Lock release occurs in `finally`, so failures cannot deadlock the key.

Safety features:
- Availability and mutation happen in the same per-item critical section.
- Two concurrent reserves for the same item cannot both pass availability check first.
- Confirm and expire operations for the same item cannot interleave inconsistently.
- Worker and API paths use the same lock key, so background expiration does not race.

Locking: An in-process, keyed async mutex/queue lock.
- Lock key is always `itemId`.
- Any operation that can change reservation state or stock counters must run under that lock.
- Pure reads may run without lock, but any read-modify-write flow must be inside lock scope.


Running the project
-------------------
Install dependencies:
  pnpm install

Run simulation in dev mode:
  pnpm run dev

Build:
  pnpm run build

Run tests:
  pnpm test
