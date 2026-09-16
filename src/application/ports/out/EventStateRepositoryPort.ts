import { EventStatus } from "../../../domain/value-objects/EventStatus";

export interface EventStateRepositoryPort {
  getLastKnownStatus(eventId: string): Promise<EventStatus | null>;
  saveStatus(eventId: string, status: EventStatus): Promise<void>;
}
