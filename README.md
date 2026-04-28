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
