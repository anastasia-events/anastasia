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

/** Último segmento de la URL de la página, ej. ".../event/bts-world-tour-2026" → "bts-world-tour-2026". */
export function crowderPageSlug(pageUrl: string): string {
  const segments = new URL(pageUrl).pathname.split("/").filter(Boolean);
  const slug = segments[segments.length - 1];
  if (!slug) {
    throw new Error(`No se pudo sacar el slug de la página de Crowder: ${pageUrl}`);
  }
  return slug;
}

/**
 * ID global de un ítem de Crowder: `crowder:<slug-de-página>/<clave-del-ítem>`.
 * La clave del ítem sola (ej. "venta-general-02-10") se repite entre páginas
 * de eventos distintos, así que sin el slug dos eventos compartirían
 * suscripciones y estado en la base.
 */
export function crowderEventId(pageSlug: string, itemKey: string): string {
  return `${CROWDER_ID_PREFIX}${pageSlug}/${itemKey}`;
}

function itemKeyOf(providerEventId: string): string {
  const withoutPrefix = providerEventId.startsWith(CROWDER_ID_PREFIX)
    ? providerEventId.slice(CROWDER_ID_PREFIX.length)
    : providerEventId;
  return withoutPrefix.slice(withoutPrefix.lastIndexOf("/") + 1);
}

export interface CrowderDisplayInfo {
  name: string;
  venue: string;
}

/**
 * Adapter para eventos que Ticketmaster.co vende por Crowder (no están en la
 * Discovery API). Un provider por página. El "providerEventId" es la clave
 * del ítem dentro de la página (título + fecha slugificados), no un ID de
 * Ticketmaster real.
 *
 * `displayByItemKey` pisa nombre/recinto con los de watched-events.json: en
 * la página el título del ítem es genérico ("Venta General") y no dice de
 * qué evento es, lo cual no sirve en una notificación.
 */
export class CrowderEventProvider implements EventProviderPort {
  constructor(
    private readonly client: CrowderPageClient,
    private readonly displayByItemKey: Map<string, CrowderDisplayInfo> = new Map()
  ) {}

  async findEventById(providerEventId: string): Promise<Event> {
    const key = itemKeyOf(providerEventId);
    const items = await this.client.getItems();
    const item = items.find((i) => i.key === key);

    if (!item) {
      throw new EventNotFoundError(providerEventId);
    }

    const display = this.displayByItemKey.get(key);
    return new Event({
      id: providerEventId,
      providerId: key,
      name: display?.name ?? item.title,
      venue: display?.venue ?? item.description,
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
