import { Event } from "../../../domain/entities/Event";
import { EventNotFoundError } from "../../../domain/errors/DomainErrors";
import { EventStatus } from "../../../domain/value-objects/EventStatus";
import { EventProviderPort } from "../../../application/ports/out/EventProviderPort";
import { CrowderPageClient, CrowderStatusCode } from "./CrowderPageClient";

export const CROWDER_ID_PREFIX = "crowder:";

const STATUS_MAP: Record<CrowderStatusCode, EventStatus> = {
  AVAILABLE: EventStatus.ONSALE,
  SOON: EventStatus.OFFSALE,
  SOLDOUT: EventStatus.OFFSALE,
  CANCELED: EventStatus.CANCELLED,
  UNKNOWN: EventStatus.OFFSALE,
};

function stripPrefix(providerEventId: string): string {
  return providerEventId.startsWith(CROWDER_ID_PREFIX)
    ? providerEventId.slice(CROWDER_ID_PREFIX.length)
    : providerEventId;
}

/**
 * Adapter para eventos que Ticketmaster.co vende por Crowder (no están en la
 * Discovery API). El "providerEventId" es la clave del ítem dentro de la
 * página (título + fecha slugificados), no un ID de Ticketmaster real.
 */
export class CrowderEventProvider implements EventProviderPort {
  constructor(private readonly client: CrowderPageClient) {}

  async findEventById(providerEventId: string): Promise<Event> {
    const key = stripPrefix(providerEventId);
    const items = await this.client.getItems();
    const item = items.find((i) => i.key === key);

    if (!item) {
      throw new EventNotFoundError(providerEventId);
    }

    return new Event({
      id: providerEventId,
      providerId: key,
      name: item.title,
      venue: item.description,
      status: STATUS_MAP[item.statusCode],
      onSaleDate: null,
      lastCheckedAt: new Date(),
      lastKnownStatus: null,
    });
  }

  async checkStatus(providerEventId: string): Promise<EventStatus> {
    const event = await this.findEventById(providerEventId);
    return event.status;
  }
}
