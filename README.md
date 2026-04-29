# Inventory Reservation System

A TypeScript implementation of a high-contention inventory reservation system designed to **guarantee no overselling under concurrent load**.

---

## Overview

This system ensures correctness under concurrency by serializing all operations per inventory item using a keyed lock.

Key characteristics:

- Prevents overselling under high contention
- Enforces deterministic state transitions
- Uses event-sourced aggregates with an in-memory projection
- Supports idempotent reservation requests
- Handles expiration via inline checks and a background worker

Designed as a production-style solution with emphasis on correctness under concurrency.

---

## Core Design

### Concurrency Model

All operations for a given `itemId` are executed within a per-item lock:

- Same item → sequential execution
- Different items → parallel execution

This guarantees **linearizable consistency per item** and eliminates race conditions.

---

### System Invariants

1. `active + confirmed ≤ total inventory`
2. Only one reservation succeeds when stock = 1
3. Confirmed reservations are immutable
4. One active reservation per user per item (idempotency)
5. Expired reservations do not count toward availability

---

### Event Model

Reservations are event-sourced using:

- `ReservationCreated`
- `ReservationConfirmed`
- `ReservationExpired`

State is derived from events, while a projection provides fast read access.

---

### Domain Errors

Reservation flows throw typed domain errors (see `src/domain/errors.ts`), for example:

- `OutOfStockError`
- `ReservationExpiredError`
- `ReservationNotConfirmableError`

Consumers (tests, API layers) should rely on `instanceof` checks rather than error message matching.

---

## Flow Summary

### Reserve

- Lock item
- Expire stale reservations
- Check idempotency
- Calculate availability
- Create reservation event

### Confirm

- Lock item
- Re-check expiration
- Confirm reservation or expire

### Expiry Worker

- Periodically expires stale reservations
- Uses same locking boundary as requests

---

## Concurrency Test

Simulates 500 concurrent requests on stock = 1:

- Expected: 1 success, 499 failures
- Enforced via invariant assertion in code (`success === 1`)

---

## Tradeoffs

- In-memory locking (not distributed)
- Non-persistent event store
- No snapshotting for projections
- Inventory not fully event-sourced

---

## Future Improvements

- Distributed locking (e.g. Redis)
- Persistent event store
- Snapshotting
- Fully event-sourced inventory

---

## Running

```bash
pnpm install
pnpm run dev
pnpm test
```

---

## Notes on Approach

This solution prioritizes **correctness and clarity over completeness**. The design focuses on demonstrating safe concurrency handling, clean separation of concerns, and maintainable architecture aligned with SOLID principles.

---

## AI Usage

AI tools were used to assist with scaffolding and refinement.

All generated code was reviewed, validated, and iterated upon to ensure:

- Correctness under concurrency
- Alignment with SOLID principles
- Consistency with the overall design

Final implementation decisions and architecture were authored and verified manually.

---

## Summary

This implementation demonstrates a concurrency-safe design with explicit guarantees, clear invariants, and maintainable architecture suitable for production evolution.
