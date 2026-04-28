/**
 * Time source abstraction for deterministic business logic and tests.
 */
export interface ClockPort {
  now(): number;
}
