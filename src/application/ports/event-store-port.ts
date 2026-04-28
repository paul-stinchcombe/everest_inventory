/**
 * Persistence boundary for appending and reading domain event streams.
 *
 * Design decision:
 * Keep this port event-store shaped (not repository shaped) because the write
 * model is event sourced. This avoids duplicating concepts and keeps adapters
 * minimal.
 */
import { DomainEvent } from "../../domain";

export interface EventStorePort {
  append(streamId: string, events: DomainEvent[]): void;
  load(streamId: string): DomainEvent[];
  getAll(): DomainEvent[];
}
