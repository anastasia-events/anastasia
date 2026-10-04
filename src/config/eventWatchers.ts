import { EventProviderPort } from "../application/ports/out/EventProviderPort";
import { EventStateRepositoryPort } from "../application/ports/out/EventStateRepositoryPort";
import { SubscriptionRepositoryPort } from "../application/ports/out/SubscriptionRepositoryPort";
import { CheckEventAvailability } from "../application/use-cases/CheckEventAvailability";
import { NotifySubscribers } from "../application/use-cases/NotifySubscribers";
import { SubscribeUserToEvent } from "../application/use-cases/SubscribeUserToEvent";
import {
  CrowderEventProvider,
  crowderEventId,
  crowderPageSlug,
} from "../infrastructure/event-providers/crowder/CrowderEventProvider";
import { CrowderPageClient } from "../infrastructure/event-providers/crowder/CrowderPageClient";
import {
  TicketmasterApiClient,
  TicketmasterApiClientOptions,
} from "../infrastructure/event-providers/ticketmaster/TicketmasterApiClient";
import { TicketmasterEventProvider } from "../infrastructure/event-providers/ticketmaster/TicketmasterEventProvider";
import type { WatchedEventEntry } from "../infrastructure/http/server";
import { LogLine } from "../infrastructure/logging/FileLogger";
import { PollingScheduler } from "../infrastructure/scheduler/PollingScheduler";
import {
  parseOptionalDate,
  WatchedCrowderConfigEntry,
  WatchedTicketmasterConfigEntry,
} from "./watchedEventsConfig";

export interface EventWatchDeps {
  eventStateRepository: EventStateRepositoryPort;
  subscriptionRepository: SubscriptionRepositoryPort;
  notifySubscribers: NotifySubscribers;
  log: LogLine;
}

export interface EventWatches {
  schedulers: PollingScheduler[];
  watchedEvents: WatchedEventEntry[];
}

interface WatchItem {
  // Id global (el mismo que se guarda en la base y ve la web).
  id: string;
  name: string;
  venue: string;
  activeFrom?: string;
  activeUntil?: string;
}

interface WatchSpec {
  provider: EventProviderPort;
  items: WatchItem[];
  intervalSeconds: number;
  schedulerName: string;
}

/**
 * Arma todo lo que necesita un provider para ser vigilado: su scheduler y sus
 * entradas para la web. Común a todos los providers; agregar uno nuevo es
 * escribir su builder y llamar a esta función.
 */
export function buildWatch(spec: WatchSpec, deps: EventWatchDeps): EventWatches {
  const checkEventAvailability = new CheckEventAvailability(
    spec.provider,
    deps.eventStateRepository,
    deps.notifySubscribers
  );
  const subscribe = new SubscribeUserToEvent(spec.provider, deps.subscriptionRepository);

  const scheduler = new PollingScheduler(
    spec.items.map((item) => ({
      id: item.id,
      activeFrom: parseOptionalDate(item.activeFrom, `watched-events.json (${item.id})`),
      activeUntil: parseOptionalDate(item.activeUntil, `watched-events.json (${item.id})`),
    })),
    spec.intervalSeconds,
    checkEventAvailability,
    { name: spec.schedulerName, log: deps.log }
  );

  return {
    schedulers: [scheduler],
    watchedEvents: spec.items.map((item) => ({
      id: item.id,
      name: item.name,
      venue: item.venue,
      provider: spec.provider,
      subscribe,
    })),
  };
}

export interface TicketmasterWatchConfig {
  apiKey: string;
  client: TicketmasterApiClientOptions;
  pollingIntervalSeconds: number;
}

export function buildTicketmasterWatches(
  items: WatchedTicketmasterConfigEntry[],
  config: TicketmasterWatchConfig,
  deps: EventWatchDeps
): EventWatches {
  if (items.length === 0) return { schedulers: [], watchedEvents: [] };

  const provider = new TicketmasterEventProvider(new TicketmasterApiClient(config.apiKey, config.client));
  return buildWatch(
    { provider, items, intervalSeconds: config.pollingIntervalSeconds, schedulerName: "ticketmaster" },
    deps
  );
}

export interface CrowderWatchConfig {
  pollingIntervalSeconds: number;
  pageCacheTtlSeconds: number;
}

export function buildCrowderWatches(
  items: WatchedCrowderConfigEntry[],
  config: CrowderWatchConfig,
  deps: EventWatchDeps
): EventWatches {
  const result: EventWatches = { schedulers: [], watchedEvents: [] };

  for (const [pageUrl, pageItems] of groupByPage(items)) {
    const client = new CrowderPageClient({
      pageUrl,
      cacheTtlMs: config.pageCacheTtlSeconds * 1000,
      log: deps.log,
    });
    const provider = new CrowderEventProvider(
      client,
      new Map(pageItems.map((item) => [item.id, { name: item.name, venue: item.venue }]))
    );
    const pageSlug = crowderPageSlug(pageUrl);

    const watch = buildWatch(
      {
        provider,
        // En watched-events.json el id de Crowder es solo la clave del ítem;
        // acá pasa a ser el id global con el slug de la página.
        items: pageItems.map((item) => ({ ...item, id: crowderEventId(pageSlug, item.id) })),
        intervalSeconds: config.pollingIntervalSeconds,
        schedulerName: `crowder:${pageSlug}`,
      },
      deps
    );
    result.schedulers.push(...watch.schedulers);
    result.watchedEvents.push(...watch.watchedEvents);
  }

  return result;
}

// Varios ítems de Crowder pueden compartir la misma página de evento —
// agrupamos por pageUrl para reusar un solo CrowderPageClient (y su
// caché) por página en vez de golpearla una vez por ítem vigilado.
function groupByPage(items: WatchedCrowderConfigEntry[]): Map<string, WatchedCrowderConfigEntry[]> {
  const byPage = new Map<string, WatchedCrowderConfigEntry[]>();
  for (const item of items) {
    const list = byPage.get(item.pageUrl) ?? [];
    list.push(item);
    byPage.set(item.pageUrl, list);
  }
  return byPage;
}
