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
import { PendingTelegramLinkStore } from "../infrastructure/telegram/PendingTelegramLinkStore";
import { buildHttpServer, confirmTelegramSubscription, WatchedEventEntry } from "../infrastructure/http/server";
import { loadWatchedEventsConfig, parseOptionalDate } from "./watchedEventsConfig";
import { env } from "./env";

export function buildContainer() {
  const db = openDatabase(env.databasePath);
  const watchedEventsConfig = loadWatchedEventsConfig(env.watchedEventsFile);

  const ticketmasterClient = new TicketmasterApiClient(env.ticketmasterApiKey, env.ticketmaster);
  const eventProvider = new TicketmasterEventProvider(ticketmasterClient);

  // polling: true porque además de enviar notificaciones, el bot escucha
  // /start <token> para confirmar las suscripciones iniciadas desde la web.
  const telegramBot = new TelegramBot(env.telegramBotToken, { polling: true });
  const notifiersByChannel = new Map<NotificationChannel, NotificationPort>([
    [NotificationChannel.TELEGRAM, new TelegramNotifier(telegramBot)],
    [NotificationChannel.CALL, new TwilioCallNotifier()],
  ]);

  const eventStateRepository = new SqliteEventStateRepository(db);
  const subscriptionRepository = new SqliteSubscriptionRepository(db);
  const notifySubscribers = new NotifySubscribers(subscriptionRepository, notifiersByChannel);

  const schedulers: PollingScheduler[] = [];
  const watchedEvents: WatchedEventEntry[] = [];

  if (watchedEventsConfig.ticketmaster.length > 0) {
    const subscribeUserToEvent = new SubscribeUserToEvent(eventProvider, subscriptionRepository);
    const checkEventAvailability = new CheckEventAvailability(
      eventProvider,
      eventStateRepository,
      notifySubscribers
    );

    const ticketmasterWatched: WatchedEvent[] = watchedEventsConfig.ticketmaster.map((item) => ({
      id: item.id,
      activeFrom: parseOptionalDate(item.activeFrom, `watched-events.json (ticketmaster:${item.id})`),
      activeUntil: parseOptionalDate(item.activeUntil, `watched-events.json (ticketmaster:${item.id})`),
    }));
    schedulers.push(new PollingScheduler(ticketmasterWatched, env.pollingIntervalSeconds, checkEventAvailability));

    for (const item of watchedEventsConfig.ticketmaster) {
      watchedEvents.push({
        id: item.id,
        name: item.name,
        venue: item.venue,
        provider: eventProvider,
        subscribe: subscribeUserToEvent,
      });
    }
  }

  // Varios ítems de Crowder pueden compartir la misma página de evento —
  // agrupamos por pageUrl para reusar un solo CrowderPageClient (y su
  // caché) por página en vez de golpearla una vez por ítem vigilado.
  const crowderItemsByPage = new Map<string, typeof watchedEventsConfig.crowder>();
  for (const item of watchedEventsConfig.crowder) {
    const list = crowderItemsByPage.get(item.pageUrl) ?? [];
    list.push(item);
    crowderItemsByPage.set(item.pageUrl, list);
  }

  for (const [pageUrl, items] of crowderItemsByPage) {
    const crowderClient = new CrowderPageClient({
      pageUrl,
      cacheTtlMs: env.crowder.pageCacheTtlSeconds * 1000,
    });
    const crowderProvider = new CrowderEventProvider(crowderClient);
    const checkCrowderAvailability = new CheckEventAvailability(
      crowderProvider,
      eventStateRepository,
      notifySubscribers
    );
    const subscribeUserToEventCrowder = new SubscribeUserToEvent(crowderProvider, subscriptionRepository);

    const crowderWatched: WatchedEvent[] = items.map((item) => ({
      id: `${CROWDER_ID_PREFIX}${item.id}`,
      activeFrom: parseOptionalDate(item.activeFrom, `watched-events.json (crowder:${item.id})`),
      activeUntil: parseOptionalDate(item.activeUntil, `watched-events.json (crowder:${item.id})`),
    }));
    schedulers.push(
      new PollingScheduler(crowderWatched, env.crowder.pollingIntervalSeconds, checkCrowderAvailability)
    );

    for (const item of items) {
      watchedEvents.push({
        id: `${CROWDER_ID_PREFIX}${item.id}`,
        name: item.name,
        venue: item.venue,
        provider: crowderProvider,
        subscribe: subscribeUserToEventCrowder,
      });
    }
  }

  const pendingTelegramLinks = new PendingTelegramLinkStore();

  telegramBot.onText(/^\/start (.+)$/, async (msg, match) => {
    const token = match?.[1];
    const chatId = String(msg.chat.id);
    if (!token) return;

    const result = await confirmTelegramSubscription(
      { watchedEvents, pendingTelegramLinks },
      token,
      chatId
    );

    if (result.ok) {
      await telegramBot.sendMessage(
        chatId,
        "✅ ¡Listo! Te vamos a avisar por acá apenas cambie la disponibilidad de ese evento."
      );
    } else {
      const reason =
        result.reason === "expired_token"
          ? "Ese link ya venció o ya se usó. Volvé a la web y generá uno nuevo."
          : "Ese evento ya no está vigilado.";
      await telegramBot.sendMessage(chatId, `⚠️ ${reason}`);
    }
  });

  const httpServer = buildHttpServer({
    watchedEvents,
    pendingTelegramLinks,
    telegramBotUsername: env.telegramBotUsername,
    frontendOrigin: env.frontendOrigin,
    staticDir: env.staticDir,
  });

  return {
    watchedEvents,
    schedulers,
    httpServer,
    db,
    // Expuestos para scripts de prueba manual (ver scripts/), que arman su
    // propio CheckEventAvailability con un provider de prueba pero quieren
    // reusar la persistencia y los notificadores reales.
    eventStateRepository,
    notifySubscribers,
  };
}
