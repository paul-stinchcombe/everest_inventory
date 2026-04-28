/**
 * Domain event contracts and concrete reservation lifecycle events.
 */
export interface DomainEvent {
  type: string;
  timestamp: number;
}

export class ReservationCreated implements DomainEvent {
  type = "ReservationCreated";
  timestamp = Date.now();

  constructor(
    public reservationId: string,
    public itemId: string,
    public userId: string,
    public expiresAt: number
  ) {}
}

export class ReservationConfirmed implements DomainEvent {
  type = "ReservationConfirmed";
  timestamp = Date.now();

  constructor(public reservationId: string) {}
}

export class ReservationExpired implements DomainEvent {
  type = "ReservationExpired";
  timestamp = Date.now();

  constructor(public reservationId: string) {}
}
