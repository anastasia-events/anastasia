export enum EventStatus {
  ONSALE = "ONSALE",
  OFFSALE = "OFFSALE",
  CANCELLED = "CANCELLED",
  RESCHEDULED = "RESCHEDULED",
}

export function isEventStatus(value: string): value is EventStatus {
  return Object.values(EventStatus).includes(value as EventStatus);
}
