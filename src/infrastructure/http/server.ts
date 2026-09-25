import cors from "cors";
import express, { Express } from "express";
import fs from "fs";
import { SubscribeUserToEventPort } from "../../application/ports/in/SubscribeUserToEventPort";
import { EventProviderPort } from "../../application/ports/out/EventProviderPort";
import { NotificationChannel } from "../../domain/value-objects/NotificationChannel";
import { PendingTelegramLinkStore } from "../telegram/PendingTelegramLinkStore";

export interface WatchedEventEntry {
  id: string;
  // Info de display, tal como viene de watched-events.json — el listado
  // de eventos no consulta al provider en vivo, así que esto es lo único
  // que la UI muestra.
  name: string;
  venue: string;
  provider: EventProviderPort;
  subscribe: SubscribeUserToEventPort;
}

export interface HttpServerDeps {
  watchedEvents: WatchedEventEntry[];
  pendingTelegramLinks: PendingTelegramLinkStore;
  telegramBotUsername: string;
  frontendOrigin: string;
  // Carpeta con el build de Vite (frontend/dist copiado ahí en producción).
  // En dev queda sin definir: el frontend corre aparte con `vite dev`.
  staticDir?: string;
}

export function buildHttpServer(deps: HttpServerDeps): Express {
  const app = express();
  app.use(cors({ origin: deps.frontendOrigin }));
  app.use(express.json());

  function findWatchedEvent(eventId: string): WatchedEventEntry | undefined {
    return deps.watchedEvents.find((entry) => entry.id === eventId);
  }

  app.get("/api/events", (_req, res) => {
    // Lista estática desde watched-events.json — sin llamar al provider, así
    // que navegar/recargar la web nunca le pega a Ticketmaster/Crowder.
    res.json(
      deps.watchedEvents.map((entry) => ({
        id: entry.id,
        name: entry.name,
        venue: entry.venue,
      }))
    );
  });

  app.post("/api/subscriptions/telegram", (req, res) => {
    const eventId = req.body?.eventId;
    if (typeof eventId !== "string" || !findWatchedEvent(eventId)) {
      res.status(400).json({ error: "eventId inválido o no vigilado" });
      return;
    }

    const token = deps.pendingTelegramLinks.create(eventId);
    res.json({
      token,
      deepLink: `https://t.me/${deps.telegramBotUsername}?start=${token}`,
    });
  });

  if (deps.staticDir && fs.existsSync(deps.staticDir)) {
    app.use(express.static(deps.staticDir));
  }

  return app;
}

export type TelegramConfirmResult =
  | { ok: true; subscriptionId: string }
  | { ok: false; reason: "expired_token" | "event_not_watched" };

/**
 * Confirma una suscripción pendiente cuando el bot recibe /start <token>.
 * Vive junto al server (comparte watchedEvents/pendingTelegramLinks) pero se
 * invoca como función directa desde el listener del bot, no por HTTP: ambos
 * corren en el mismo proceso y no hay motivo para dar una vuelta por red.
 */
export async function confirmTelegramSubscription(
  deps: Pick<HttpServerDeps, "watchedEvents" | "pendingTelegramLinks">,
  token: string,
  chatId: string
): Promise<TelegramConfirmResult> {
  const eventId = deps.pendingTelegramLinks.consume(token);
  if (!eventId) {
    return { ok: false, reason: "expired_token" };
  }

  const entry = deps.watchedEvents.find((e) => e.id === eventId);
  if (!entry) {
    return { ok: false, reason: "event_not_watched" };
  }

  const subscription = await entry.subscribe.execute(
    chatId,
    eventId,
    NotificationChannel.TELEGRAM,
    chatId
  );
  return { ok: true, subscriptionId: subscription.id };
}
