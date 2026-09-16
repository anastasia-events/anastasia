import TelegramBot from "node-telegram-bot-api";
import { CheckEventAvailability } from "../application/use-cases/CheckEventAvailability";
import { NotifySubscribers } from "../application/use-cases/NotifySubscribers";
import { SubscribeUserToEvent } from "../application/use-cases/SubscribeUserToEvent";
import { NotificationChannel } from "../domain/value-objects/NotificationChannel";
import { NotificationPort } from "../application/ports/out/NotificationPort";
import { CrowderEventProvider, CROWDER_ID_PREFIX } from "../infrastructure/event-providers/crowder/CrowderEventProvider";
import { CrowderPageClient } from "../infrastructure/event-providers/crowder/CrowderPageClient";
import { TicketmasterApiClient } from "../infrastructure/event-providers/ticketmaster/TicketmasterApiClient";
import { TicketmasterEventProvider } from "../infrastructure/event-providers/ticketmaster/TicketmasterEventProvider";
import { TelegramNotifier } from "../infrastructure/notifiers/telegram/TelegramNotifier";
import { TwilioCallNotifier } from "../infrastructure/notifiers/twilio/TwilioCallNotifier";
import { openDatabase } from "../infrastructure/persistence/sqlite/Database";
import { SqliteEventStateRepository } from "../infrastructure/persistence/sqlite/SqliteEventStateRepository";
import { SqliteSubscriptionRepository } from "../infrastructure/persistence/sqlite/SqliteSubscriptionRepository";
import { PollingScheduler, WatchedEvent } from "../infrastructure/scheduler/PollingScheduler";
import { env } from "./env";

export function buildContainer() {
  const db = openDatabase(env.databasePath);

  const ticketmasterClient = new TicketmasterApiClient(env.ticketmasterApiKey, env.ticketmaster);
  const eventProvider = new TicketmasterEventProvider(ticketmasterClient);

  const telegramBot = new TelegramBot(env.telegramBotToken, { polling: false });
  const notifiersByChannel = new Map<NotificationChannel, NotificationPort>([
    [NotificationChannel.TELEGRAM, new TelegramNotifier(telegramBot)],
    [NotificationChannel.CALL, new TwilioCallNotifier()],
  ]);

  const eventStateRepository = new SqliteEventStateRepository(db);
  const subscriptionRepository = new SqliteSubscriptionRepository(db);

  const notifySubscribers = new NotifySubscribers(subscriptionRepository, notifiersByChannel);
  const checkEventAvailability = new CheckEventAvailability(
    eventProvider,
    eventStateRepository,
    notifySubscribers
  );
  const subscribeUserToEvent = new SubscribeUserToEvent(eventProvider, subscriptionRepository);
  let subscribeUserToEventCrowder: SubscribeUserToEvent | null = null;

  const ticketmasterWatchedEvents: WatchedEvent[] = env.watchedEventIds.map((id) => ({ id }));
  const schedulers = [
    new PollingScheduler(ticketmasterWatchedEvents, env.pollingIntervalSeconds, checkEventAvailability),
  ];

  // Proveedor secundario (Crowder) — solo se levanta si hay ítems configurados,
  // ya que requiere CROWDER_EVENT_PAGE_URL y no es parte del MVP original.
  if (env.crowder.watchedItemIds.length > 0) {
    if (!env.crowder.pageUrl) {
      throw new Error("CROWDER_WATCHED_ITEM_IDS está seteado pero falta CROWDER_EVENT_PAGE_URL");
    }

    const crowderClient = new CrowderPageClient({
      pageUrl: env.crowder.pageUrl,
      cacheTtlMs: env.crowder.pageCacheTtlSeconds * 1000,
    });
    const crowderProvider = new CrowderEventProvider(crowderClient);
    const checkCrowderAvailability = new CheckEventAvailability(
      crowderProvider,
      eventStateRepository,
      notifySubscribers
    );
    subscribeUserToEventCrowder = new SubscribeUserToEvent(crowderProvider, subscriptionRepository);

    const crowderWatchedEvents: WatchedEvent[] = env.crowder.watchedItemIds.map((id) => ({
      id: `${CROWDER_ID_PREFIX}${id}`,
      activeFrom: env.crowder.watchStartAt,
      activeUntil: env.crowder.watchEndAt,
    }));

    schedulers.push(
      new PollingScheduler(crowderWatchedEvents, env.crowder.pollingIntervalSeconds, checkCrowderAvailability)
    );
  }

  return { checkEventAvailability, subscribeUserToEvent, subscribeUserToEventCrowder, schedulers, db };
}
