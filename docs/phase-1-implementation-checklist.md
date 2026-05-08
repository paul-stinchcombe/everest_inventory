# Phase 1 Implementation Checklist

Phase 1 goal: introduce durable event persistence and optimistic concurrency without changing business behavior.

## Scope

- Replace in-memory event storage with durable storage.
- Add stream versioning and `expectedVersion` conflict protection.
- Add command/event IDs for idempotency and traceability.
- Keep existing domain rules and use-case semantics intact.

## File-Level Implementation Plan

### 1) Event Store Port

- Update [`src/application/ports/event-store-port.ts`](../src/application/ports/event-store-port.ts):
  - Add append contract with expected version.
  - Return append result metadata (new version / conflict).

Suggested direction:

- `append(streamId, expectedVersion, events, commandId): AppendResult`
- `load(streamId): { events, version }`

### 2) Durable Event Store Adapter

- Add a production adapter under [`src/infrastructure`](../src/infrastructure):
  - Example: `postgres-event-store.ts`
- Persist:
  - `stream_id`
  - `stream_version`
  - `event_id`
  - `event_type`
  - `payload`
  - `occurred_at`
  - `command_id`
- Enforce uniqueness on:
  - `(stream_id, stream_version)`
  - `event_id`
  - `command_id` where appropriate

### 3) Use-Case Write Paths

- Update [`src/use-cases/reserve-item-use-case.ts`](../src/use-cases/reserve-item-use-case.ts):
  - Load stream/version before appending.
  - Append with `expectedVersion`.
  - Retry only on version conflict with bounded attempts.
- Update [`src/use-cases/confirm-reservation-use-case.ts`](../src/use-cases/confirm-reservation-use-case.ts) similarly.

### 4) Event Model Metadata

- Update [`src/domain/events.ts`](../src/domain/events.ts):
  - Include stable `eventId`.
  - Prefer injected time/clock for consistency with aggregate determinism.
  - Keep event payloads minimal and explicit.

### 5) Idempotency Record

- Introduce durable idempotency storage keyed by request/command ID.
- Store status and resulting reservation reference.
- Ensure lookup + append occur atomically in write transaction.

### 6) Projection Compatibility

- Keep [`src/projections/reservation-projection.ts`](../src/projections/reservation-projection.ts) behavior unchanged for Phase 1.
- Add capability to replay from durable event store during startup.

## Acceptance Criteria

- Reserve/confirm tests remain green.
- Conflicting writes on same stream no longer double-append.
- Duplicate command submissions return same outcome.
- Event history survives process restart.
- No domain invariants regress (`active + confirmed <= total`).

## Verification Commands

- `pnpm test`
- `pnpm run test:verbose`
- Add targeted tests:
  - append conflict retry behavior
  - duplicate command idempotency behavior
  - restart replay rebuild behavior

## Risks and Controls

- **Risk:** Conflict retry loops under high contention.
  - **Control:** max retries + jitter + conflict metrics.
- **Risk:** Dual-write inconsistency between event append and publish.
  - **Control:** transactional outbox pattern (or defer publish to later phase).
- **Risk:** Schema migration mistakes.
  - **Control:** forward-only migrations + rollback runbook.
