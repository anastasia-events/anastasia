import { EventStatus } from "../../../domain/value-objects/EventStatus";

export interface CheckEventAvailabilityResult {
  changed: boolean;
  newStatus: EventStatus;
}

export interface CheckEventAvailabilityPort {
  execute(eventId: string): Promise<CheckEventAvailabilityResult>;
}
