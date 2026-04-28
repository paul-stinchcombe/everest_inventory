/**
 * Use-case for confirming an existing reservation with expiry protection.
 *
 * Design decisions:
 * - Confirmation runs under the same per-item lock as reservation creation.
 * - Expired reservations are transitioned to EXPIRED before failing.
 * - Inventory counter increments only after successful domain confirmation.
 */
import { ClockPort, EventStorePort, ReservationReadModelPort } from "../application/ports";
import { Inventory } from "../domain";
import { LockManager } from "../services";

export class ConfirmReservationUseCase {
  constructor(
    private store: EventStorePort,
    private projection: ReservationReadModelPort,
    private inventory: Inventory,
    private lock: LockManager,
    private clock: ClockPort
  ) {}

  async execute(reservationId: string) {
    // Read-model lookup is sufficient for this demo; stream replay is not required here.
    const reservation = this.projection.getAll().find((r) => r.id === reservationId);
    if (!reservation) throw new Error("Not found");

    await this.lock.execute(reservation.itemId, async () => {
      const now = this.clock.now();

      if (reservation.isExpired(now)) {
        reservation.expire();
        this.store.append(reservation.id, reservation.pullEvents());
        throw new Error("Expired");
      }

      reservation.confirm(now);
      this.store.append(reservation.id, reservation.pullEvents());

      this.inventory.confirmed += 1;
    });
  }
}
