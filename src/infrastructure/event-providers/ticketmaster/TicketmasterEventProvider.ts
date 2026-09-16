import { Event } from "../../../domain/entities/Event";
import { EventNotFoundError } from "../../../domain/errors/DomainErrors";
import { EventStatus } from "../../../domain/value-objects/EventStatus";
import { EventProviderPort } from "../../../application/ports/out/EventProviderPort";
import { TicketmasterApiClient, TicketmasterEventDto } from "./TicketmasterApiClient";

const STATUS_MAP: Record<string, EventStatus> = {
  onsale: EventStatus.ONSALE,
  offsale: EventStatus.OFFSALE,
  cancelled: EventStatus.CANCELLED,
  rescheduled: EventStatus.RESCHEDULED,
};

function mapStatus(code: string): EventStatus {
  return STATUS_MAP[code.toLowerCase()] ?? EventStatus.OFFSALE;
}

function toEvent(dto: TicketmasterEventDto): Event {
  return new Event({
    id: `ticketmaster:${dto.id}`,
    providerId: dto.id,
    name: dto.name,
    venue: dto._embedded?.venues?.[0]?.name ?? "Desconocido",
    status: mapStatus(dto.dates.status.code),
    onSaleDate: dto.dates.start?.dateTime ? new Date(dto.dates.start.dateTime) : null,
    lastCheckedAt: new Date(),
    lastKnownStatus: null,
  });
}

export class TicketmasterEventProvider implements EventProviderPort {
  constructor(private readonly client: TicketmasterApiClient) {}

  async findEventById(providerEventId: string): Promise<Event> {
    try {
      const dto = await this.client.getEvent(providerEventId);
      return toEvent(dto);
    } catch (error) {
      throw new EventNotFoundError(providerEventId);
    }
  }

  async checkStatus(providerEventId: string): Promise<EventStatus> {
    const event = await this.findEventById(providerEventId);
    return event.status;
  }
}
