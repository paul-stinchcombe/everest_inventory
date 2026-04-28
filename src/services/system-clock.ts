/**
 * Production clock implementation backed by Date.now().
 */
import { ClockPort } from "../application/ports";

export class SystemClock implements ClockPort {
  now() {
    return Date.now();
  }
}
