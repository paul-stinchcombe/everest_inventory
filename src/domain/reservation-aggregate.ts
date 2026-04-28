/**
 * Event-sourced reservation aggregate that enforces domain invariants.
 *
 * Design decision:
 * Time is injected via method parameters (`now`) rather than read internally
 * from Date.now(). This keeps business rules deterministic and testable.
 */
import crypto from "crypto";

import {
  DomainEvent,
  ReservationConfirmed,
  ReservationCreated,
  ReservationExpired,
} from "./events";
import { ReservationStatus } from "./reservation-status";

export class ReservationAggregate {
  id!: string;
  itemId!: string;
  userId!: string;
  status!: ReservationStatus;
  expiresAt!: number;

  private changes: DomainEvent[] = [];

  static create(itemId: string, userId: string, ttlMs: number, now: number) {
    const agg = new ReservationAggregate();

    const event = new ReservationCreated(
      crypto.randomUUID(),
      itemId,
      userId,
      now + ttlMs
    );

    agg.apply(event);
    agg.changes.push(event);

    return agg;
  }

  confirm(now: number) {
    if (this.status !== ReservationStatus.ACTIVE || this.isExpired(now)) {
      throw new Error("Cannot confirm");
    }

    const event = new ReservationConfirmed(this.id);
    this.apply(event);
    this.changes.push(event);
  }

  expire() {
    if (this.status === ReservationStatus.ACTIVE) {
      const event = new ReservationExpired(this.id);
      this.apply(event);
      this.changes.push(event);
    }
  }

  isExpired(now: number) {
    return now > this.expiresAt;
  }

  apply(event: DomainEvent) {
    switch (event.type) {
      case "ReservationCreated": {
        const e1 = event as ReservationCreated;
        this.id = e1.reservationId;
        this.itemId = e1.itemId;
        this.userId = e1.userId;
        this.expiresAt = e1.expiresAt;
        this.status = ReservationStatus.ACTIVE;
        break;
      }

      case "ReservationConfirmed":
        this.status = ReservationStatus.CONFIRMED;
        break;

      case "ReservationExpired":
        this.status = ReservationStatus.EXPIRED;
        break;
    }
  }

  pullEvents(): DomainEvent[] {
    // Event-sourcing pattern: return uncommitted changes and clear the buffer.
    const out = [...this.changes];
    this.changes = [];
    return out;
  }
}
