/**
 * Inventory counters for a single item.
 * Keeps total stock and number of confirmed reservations.
 */
export class Inventory {
  constructor(
    public itemId: string,
    public total: number,
    public confirmed: number = 0
  ) {}
}
