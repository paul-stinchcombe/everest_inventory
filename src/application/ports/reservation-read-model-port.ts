/**
 * Read-model boundary for querying and projecting reservation state.
 *
 * Design decision:
 * Keep a dedicated read-model port separate from the event store to preserve
 * CQRS-style separation between write-side events and read-side queries.
 */
import { DomainEvent, ReservationAggregate } from "../../domain";

export interface ReservationReadModelPort {
  apply(event: DomainEvent): void;
  getByItem(itemId: string): ReservationAggregate[];
  getByUser(itemId: string, userId: string): ReservationAggregate | undefined;
  getAll(): ReservationAggregate[];
}
