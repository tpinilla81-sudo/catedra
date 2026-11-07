import { addWeeks as _fnsAddWeeks } from "date-fns";

export function addWeeks(d: Date, n: number): Date {
  return _fnsAddWeeks(d, n);
}
