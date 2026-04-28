/**
 * In-memory event store used by the demo for appending and reading domain events.
 */
import { EventStorePort } from "../application/ports";
import { DomainEvent } from "../domain";

export class InMemoryEventStore implements EventStorePort {
  private store = new Map<string, DomainEvent[]>();

  append(streamId: string, events: DomainEvent[]) {
    const existing = this.store.get(streamId) || [];
    this.store.set(streamId, [...existing, ...events]);
  }

  load(streamId: string): DomainEvent[] {
    return this.store.get(streamId) || [];
  }

  getAll(): DomainEvent[] {
    return Array.from(this.store.values()).flat();
  }
}
