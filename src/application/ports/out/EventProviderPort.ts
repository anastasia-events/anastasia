import { Event } from "../../../domain/entities/Event";
import { EventStatus } from "../../../domain/value-objects/EventStatus";

export interface EventProviderPort {
  findEventById(providerEventId: string): Promise<Event>;
  checkStatus(providerEventId: string): Promise<EventStatus>;
}
