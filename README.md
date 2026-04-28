# Inventory Reservation Demo

TypeScript event-sourced reservation demo for high-contention inventory booking.

## Overview

This project focuses on safe concurrent behavior for reserve and confirm operations.

Core ideas:

- Reservations are modeled as aggregates driven by domain events.
- Current query state is served by an in-memory projection.
- Writes are serialized per item using a keyed lock manager.
- Expiry is handled by inline checks and a periodic worker.
- Time access is abstracted with `ClockPort` for deterministic logic and tests.

## Project Structure

```text
src/
  index.ts                               Composition root and simulation runner

  application/
    ports/
      clock-port.ts                      Time abstraction boundary
      event-store-port.ts                Event persistence boundary
      reservation-read-model-port.ts     Read-model boundary
      index.ts                           Exports

  domain/
    events.ts                            Domain event types (Created, Confirmed, Expired)
    reservation-status.ts                Reservation state enum
    reservation-aggregate.ts             Aggregate behavior + event application
    inventory.ts                         Inventory model
    index.ts                             Exports

  infrastructure/
    in-memory-event-store.ts             Append/load domain events in memory
    index.ts                             Exports

  projections/
    reservation-projection.ts            Read model for reservations by item/user
    index.ts                             Exports

  services/
    lock-manager.ts                      Per-key async serialization primitive
    system-clock.ts                      Production clock implementation
    index.ts                             Exports

  use-cases/
    reserve-item-use-case.ts             Reserve flow with idempotency + availability checks
    confirm-reservation-use-case.ts      Confirm flow with expiration guard
    index.ts                             Exports

  workers/
    expiry-worker.ts                     Background sweep for expired reservations
    index.ts                             Exports

test/
  domain/
  services/
  use-cases/
  workers/
  README.md                              Test conventions
```

## Architecture Flow

### 1) Reserve Request (`ReserveItemUseCase.execute`)

- Acquires lock for `itemId`.
- Reads current reservations for that item from projection.
- Expires stale `ACTIVE` reservations inline.
- Applies idempotency check for same (`itemId`, `userId`).
- Computes availability: `total - confirmed - active`.
- Creates reservation aggregate and emits `ReservationCreated`.
- Appends events to event store and applies created event to projection.

### 2) Confirm Request (`ConfirmReservationUseCase.execute`)

- Finds reservation in projection.
- Acquires lock for `reservation.itemId`.
- Re-checks expiration; if expired, emits `ReservationExpired` and aborts.
- Emits `ReservationConfirmed` and increments confirmed inventory counter.

### 3) Expiry Background Process (`ExpiryWorker`)

- Runs on interval.
- Groups reservations by `itemId`.
- For each item group, uses the same item lock.
- Expires `ACTIVE` reservations whose TTL elapsed.
- Appends expiration events.

## Locking Strategy

Goal: prevent race conditions without globally serializing all traffic.

Mechanism:

- `LockManager.execute(key, fn)` keeps a promise chain per key.
- Each key (here: `itemId`) has its own queue.
- Calls with the same key run strictly one at a time.
- Calls with different keys run concurrently.
- Lock release occurs in `finally`, so failures cannot deadlock the key.

Safety features:

- Availability checks and mutations happen in the same per-item critical section.
- Two concurrent reserves for the same item cannot both pass availability checks.
- Confirm and expire operations for the same item cannot interleave inconsistently.
- Worker and use-case paths share the same lock key, so background expiration does not race.

## Running the Project

Install dependencies:

```bash
pnpm install
```

Run simulation in dev mode:

```bash
pnpm run dev
```

Build:

```bash
pnpm run build
```

Run tests:

```bash
pnpm test
```

# Inventory Reservation System (Event-Sourced, Concurrency-Safe)

A TypeScript implementation of a high-contention inventory reservation system designed to **prevent overselling under extreme concurrency**.

---

## Executive Summary

This system guarantees correctness under concurrent access by enforcing **per-item serialized execution** using a keyed mutex.

All state transitions for a given inventory item are executed within this boundary, ensuring:

- No race conditions
- No overselling
- Deterministic outcomes under concurrent load

Reservations are implemented using **event-sourced aggregates**, with an in-memory event store and projection for efficient reads.

---

## Why This Design?

Flash-sale systems fail not because of logic, but because of **concurrency violations**.

This design prioritizes:

- **Correctness over throughput** (within a single item boundary)
- **Explicit consistency guarantees**
- **Deterministic state transitions**

Instead of relying on eventual consistency or retries, we enforce:

> "All operations on a single item behave as if executed sequentially"

---

## System Invariants

The system guarantees the following at all times:

1. `active reservations + confirmed sales ≤ total inventory`
2. Only one reservation succeeds when stock = 1
3. Confirmed reservations are immutable
4. A user may only have one active reservation per item (idempotency)
5. Expired reservations do not count toward availability

These invariants are enforced within a per-item critical section.

---

## Consistency Model

The system provides **linearizable consistency per inventory item**.

### Key Idea

All operations for a given `itemId` are serialized:

- Same item → sequential execution
- Different items → parallel execution

### Mental Model

Each item behaves like a **single-threaded system**.

This eliminates:

- race conditions
- stale reads
- double allocation

---

## Event Sourcing Model

Reservations are implemented as **event-sourced aggregates**.

### Domain Events

- `ReservationCreated`
- `ReservationConfirmed`
- `ReservationExpired`

### Principles

- State is derived from events (not stored directly)
- Event store is the source of truth
- Projection provides fast read access

### Replay Capability

The system can rebuild state by replaying events:

```ts
function rebuildProjection(events: DomainEvent[]) {
	events.forEach((event) => projection.apply(event));
}
```

This enables:

- deterministic recovery
- auditability
- debugging via event history

> Note: Inventory is partially modeled as state for simplicity but can be fully event-sourced.

---

## Architecture Overview

```text
               ┌───────────────────────┐
               │   Incoming Requests   │
               └──────────┬────────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │   Use Cases      │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  Lock Manager    │  (per itemId)
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │   Aggregates     │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │   Event Store    │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │   Projection     │
                 └──────────────────┘
```

---

## Request Flows

### Reserve Flow

1. Acquire lock for `itemId`
2. Load reservations from projection
3. Expire stale reservations inline
4. Check idempotency (same user)
5. Compute availability
6. Create reservation aggregate
7. Emit and persist `ReservationCreated`
8. Update projection

---

### Confirm Flow

1. Locate reservation
2. Acquire lock for `itemId`
3. Re-check expiration
4. If expired → emit `ReservationExpired`
5. Else → emit `ReservationConfirmed`
6. Increment confirmed inventory

---

### Expiry Worker

1. Runs periodically
2. Groups reservations by `itemId`
3. Acquires lock per item
4. Expires stale reservations
5. Emits `ReservationExpired`

**Important:** Uses same lock boundary as write operations.

---

## Locking Strategy

### Mechanism

- Promise chain per key (`itemId`)
- FIFO execution
- Automatic release via `finally`

### Guarantees

- Atomic availability checks
- No double allocation
- Safe interaction between reserve, confirm, and expiry

---

## Concurrency Proof (Simulation)

The system simulates **500 concurrent reservation attempts** against:

- Stock = 1

### Expected Outcome

- 1 success
- 499 failures

### Invariant Assertion

```ts
if (success !== 1) {
	throw new Error('Overselling detected');
}
```

This demonstrates correctness under extreme contention.

---

## Project Structure

```text
src/
  application/        Application boundaries (ports)
  domain/             Aggregates + events
  infrastructure/     Event store implementation
  projections/        Read models
  services/           Locking + clock
  use-cases/          Business logic
  workers/            Background processes
```

---

## Tradeoffs & Limitations

- In-memory locking prevents horizontal scaling
- Event store is not persistent
- Projection rebuild cost grows over time
- Inventory not fully event-sourced

---

## Future Improvements

- Redis distributed locks
- Persistent event store (Postgres / Kafka)
- Snapshotting for projection rebuilds
- Fully event-sourced inventory
- Multi-instance simulation

---

## Running the Project

```bash
pnpm install
pnpm run dev
pnpm test
```

---

## Final Thought

This system is intentionally designed around one principle:

> Correctness under concurrency is enforced, not assumed.

Every critical operation flows through a single consistency boundary,
ensuring that even under extreme load, the system behaves predictably.
