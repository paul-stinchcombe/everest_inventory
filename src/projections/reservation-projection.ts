/**
 * Projection/read model that derives reservation state from domain events.
 *
 * Design decision:
 * This in-memory projection stores aggregate-shaped objects for convenience.
 * In production, this would typically be a denormalized read model.
 */
import { ReservationReadModelPort } from "../application/ports";
import {
  DomainEvent,
  ReservationAggregate,
  ReservationConfirmed,
  ReservationCreated,
  ReservationExpired,
  ReservationStatus,
} from "../domain";

export class ReservationProjection implements ReservationReadModelPort {
  private reservations = new Map<string, ReservationAggregate>();

  apply(event: DomainEvent) {
    switch (event.type) {
      case "ReservationCreated": {
        const e = event as ReservationCreated;
        const agg = new ReservationAggregate();
        agg.apply(event);
        this.reservations.set(e.reservationId, agg);
        break;
      }

      case "ReservationConfirmed":
      case "ReservationExpired": {
        const id = (event as ReservationConfirmed | ReservationExpired).reservationId;
        const agg = this.reservations.get(id);
        if (agg) agg.apply(event);
        break;
      }
    }
  }

  getByItem(itemId: string) {
    return Array.from(this.reservations.values()).filter(
      (r) => r.itemId === itemId
    );
  }

  getByUser(itemId: string, userId: string) {
    return this.getByItem(itemId).find(
      (r) => r.userId === userId && r.status === ReservationStatus.ACTIVE
    );
  }

  getAll() {
    return Array.from(this.reservations.values());
  }
}
