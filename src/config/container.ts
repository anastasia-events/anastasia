import TelegramBot from "node-telegram-bot-api";
import { FindOrCreateUserByPhone } from "../application/use-cases/FindOrCreateUserByPhone";
import { ListUserSubscriptions } from "../application/use-cases/ListUserSubscriptions";
import { NotifySubscribers } from "../application/use-cases/NotifySubscribers";
import { UnsubscribeUser } from "../application/use-cases/UnsubscribeUser";
import { FileLogger } from "../infrastructure/logging/FileLogger";
import { openDatabase } from "../infrastructure/persistence/sqlite/Database";
import { SqliteEventStateRepository } from "../infrastructure/persistence/sqlite/SqliteEventStateRepository";
import { SqliteSubscriptionRepository } from "../infrastructure/persistence/sqlite/SqliteSubscriptionRepository";
import { SqliteUserRepository } from "../infrastructure/persistence/sqlite/SqliteUserRepository";
import { PendingTelegramLinkStore } from "../infrastructure/telegram/PendingTelegramLinkStore";
import { TelegramBotCommands } from "../infrastructure/telegram/TelegramBotCommands";
import { buildHttpServer, confirmTelegramSubscription } from "../infrastructure/http/server";
import { parseAllowedPhones } from "../infrastructure/http/phone";
import { buildCrowderWatches, buildTicketmasterWatches, EventWatchDeps } from "./eventWatchers";
import { buildNotifiers } from "./notifiers";
import { loadWatchedEventsConfig } from "./watchedEventsConfig";
import { env } from "./env";

export interface ContainerOptions {
  // Los scripts (scripts/) solo necesitan ENVIAR por Telegram: con polling
  // apagado no le disputan los updates del bot al servidor que esté corriendo
  // (Telegram permite un solo consumidor de getUpdates por token).
  telegramPolling?: boolean;
}

export function buildContainer(options: ContainerOptions = {}) {
  const db = openDatabase(env.databasePath);
  const watchedEventsConfig = loadWatchedEventsConfig(env.watchedEventsFile);
  const schedulerLog = new FileLogger(env.schedulerLogFile).log;

  // polling: true porque además de enviar notificaciones, el bot escucha
  // /start <token> para confirmar las suscripciones iniciadas desde la web.
  const telegramBot = new TelegramBot(env.telegramBotToken, { polling: options.telegramPolling ?? true });
  const notifiersByChannel = buildNotifiers(env, telegramBot);

  const eventStateRepository = new SqliteEventStateRepository(db);
  const subscriptionRepository = new SqliteSubscriptionRepository(db);
  const userRepository = new SqliteUserRepository(db);
  const notifySubscribers = new NotifySubscribers(subscriptionRepository, notifiersByChannel);
  const findOrCreateUser = new FindOrCreateUserByPhone(userRepository);
  const listUserSubscriptions = new ListUserSubscriptions(subscriptionRepository);
  const unsubscribeUser = new UnsubscribeUser(subscriptionRepository);

  const watchDeps: EventWatchDeps = {
    eventStateRepository,
    subscriptionRepository,
    notifySubscribers,
    log: schedulerLog,
  };
  const watches = [
    buildTicketmasterWatches(
      watchedEventsConfig.ticketmaster,
      {
        apiKey: env.ticketmasterApiKey,
        client: env.ticketmaster,
        pollingIntervalSeconds: env.pollingIntervalSeconds,
      },
      watchDeps
    ),
    buildCrowderWatches(watchedEventsConfig.crowder, env.crowder, watchDeps),
  ];
  const schedulers = watches.flatMap((watch) => watch.schedulers);
  const watchedEvents = watches.flatMap((watch) => watch.watchedEvents);

  const pendingTelegramLinks = new PendingTelegramLinkStore();

  new TelegramBotCommands({
    bot: telegramBot,
    userRepository,
    listUserSubscriptions,
    unsubscribeUser,
    watchedEvents,
    confirmSubscription: (token, chatId) =>
      confirmTelegramSubscription({ watchedEvents, pendingTelegramLinks, userRepository }, token, chatId),
  }).register();

  const httpServer = buildHttpServer({
    watchedEvents,
    pendingTelegramLinks,
    findOrCreateUser,
    userRepository,
    subscriptionRepository,
    listUserSubscriptions,
    unsubscribeUser,
    telegramBotUsername: env.telegramBotUsername,
    frontendOrigin: env.frontendOrigin,
    staticDir: env.staticDir,
    allowedPhones: parseAllowedPhones(env.allowedPhones),
    whatsappPhones: parseAllowedPhones(env.whatsapp.testNumbers),
    enabledChannels: new Set(notifiersByChannel.keys()),
    whatsappWebhook:
      env.whatsapp.webhookVerifyToken && env.whatsapp.appSecret
        ? { verifyToken: env.whatsapp.webhookVerifyToken, appSecret: env.whatsapp.appSecret }
        : undefined,
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
    findOrCreateUser,
    userRepository,
    subscriptionRepository,
  };
}
