import cors from "cors";
import express, { Express, Response } from "express";
import fs from "fs";
import { FindOrCreateUserByPhonePort } from "../../application/ports/in/FindOrCreateUserByPhonePort";
import { ListUserSubscriptionsPort } from "../../application/ports/in/ListUserSubscriptionsPort";
import { SubscribeUserToEventPort } from "../../application/ports/in/SubscribeUserToEventPort";
import { UnsubscribeUserPort } from "../../application/ports/in/UnsubscribeUserPort";
import { EventProviderPort } from "../../application/ports/out/EventProviderPort";
import { SubscriptionRepositoryPort } from "../../application/ports/out/SubscriptionRepositoryPort";
import { UserRepositoryPort } from "../../application/ports/out/UserRepositoryPort";
import { NotificationChannel } from "../../domain/value-objects/NotificationChannel";
import { PendingTelegramLinkStore } from "../telegram/PendingTelegramLinkStore";
import { normalizePhone } from "./phone";
import { registerWhatsAppWebhook, WhatsAppWebhookConfig } from "./whatsappWebhook";

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
  findOrCreateUser: FindOrCreateUserByPhonePort;
  userRepository: UserRepositoryPort;
  subscriptionRepository: SubscriptionRepositoryPort;
  listUserSubscriptions: ListUserSubscriptionsPort;
  unsubscribeUser: UnsubscribeUserPort;
  telegramBotUsername: string;
  frontendOrigin: string;
  // Carpeta con el build de Vite (frontend/dist copiado ahí en producción).
  // En dev queda sin definir: el frontend corre aparte con `vite dev`.
  staticDir?: string;
  // Sin definir = webhook de WhatsApp deshabilitado (la ruta responde 404).
  whatsappWebhook?: WhatsAppWebhookConfig;
  // Celulares habilitados (ya normalizados). Sin definir = sin restricción.
  allowedPhones?: Set<string>;
  // Canales que se pueden activar desde la web. Sin definir = todos.
  enabledChannels?: Set<NotificationChannel>;
}

export function buildHttpServer(deps: HttpServerDeps): Express {
  const app = express();
  app.use(cors({ origin: deps.frontendOrigin }));
  // Antes de express.json(): el webhook necesita el body crudo para validar la firma.
  registerWhatsAppWebhook(app, deps.whatsappWebhook);
  app.use(express.json());

  function findWatchedEvent(eventId: string): WatchedEventEntry | undefined {
    return deps.watchedEvents.find((entry) => entry.id === eventId);
  }

  // Punto único de entrada del celular: lo normaliza (misma identidad sin
  // importar espacios o "+57") y aplica la lista de permitidos. Si responde
  // con error devuelve null y la ruta corta ahí.
  function readPhone(raw: unknown, res: Response): string | null {
    const phone = typeof raw === "string" ? normalizePhone(raw) : "";
    if (!phone) {
      res.status(400).json({ error: "phone requerido" });
      return null;
    }
    if (deps.allowedPhones && !deps.allowedPhones.has(phone)) {
      res.status(403).json({ error: "phone_not_allowed" });
      return null;
    }
    return phone;
  }

  // Permite al frontend validar el número antes de guardarlo como sesión.
  app.post("/api/session", (req, res) => {
    const phone = readPhone(req.body?.phone, res);
    if (!phone) return;
    res.json({ phone });
  });

  // Canales con notificador configurado — el frontend solo ofrece estos, así
  // un canal sin credenciales (ej. WhatsApp esperando la plantilla aprobada)
  // no aparece en la web en vez de aceptar altas que después fallan.
  function isChannelEnabled(channel: NotificationChannel, res: Response): boolean {
    if (deps.enabledChannels && !deps.enabledChannels.has(channel)) {
      res.status(503).json({ error: "channel_disabled" });
      return false;
    }
    return true;
  }

  app.get("/api/channels", (_req, res) => {
    const all = [NotificationChannel.TELEGRAM, NotificationChannel.WHATSAPP, NotificationChannel.EMAIL];
    res.json(all.filter((channel) => !deps.enabledChannels || deps.enabledChannels.has(channel)));
  });

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

  app.post("/api/subscriptions/telegram", async (req, res) => {
    const eventId = req.body?.eventId;
    const rawPhone = req.body?.phone;
    const entry = typeof eventId === "string" ? findWatchedEvent(eventId) : undefined;
    if (!entry) {
      res.status(400).json({ error: "eventId inválido o no vigilado" });
      return;
    }
    const phone = readPhone(rawPhone, res);
    if (!phone) return;

    const user = await deps.findOrCreateUser.execute(phone);

    // Si este usuario ya confirmó el bot alguna vez, ya tenemos su chatId —
    // alta instantánea, igual que WhatsApp/Email, sin pasar por Telegram de nuevo.
    if (user.telegramChatId) {
      const subscription = await entry.subscribe.execute(
        user.id,
        eventId,
        NotificationChannel.TELEGRAM,
        user.telegramChatId
      );
      res.json({ linked: true, subscriptionId: subscription.id });
      return;
    }

    const token = deps.pendingTelegramLinks.create(eventId, user.id);
    res.json({
      linked: false,
      token,
      deepLink: `https://t.me/${deps.telegramBotUsername}?start=${token}`,
    });
  });

  app.post("/api/subscriptions/whatsapp", async (req, res) => {
    if (!isChannelEnabled(NotificationChannel.WHATSAPP, res)) return;
    const eventId = req.body?.eventId;
    const rawPhone = req.body?.phone;
    const entry = typeof eventId === "string" ? findWatchedEvent(eventId) : undefined;
    if (!entry) {
      res.status(400).json({ error: "eventId inválido o no vigilado" });
      return;
    }
    const phone = readPhone(rawPhone, res);
    if (!phone) return;

    const user = await deps.findOrCreateUser.execute(phone);
    // El target de WhatsApp es el mismo celular usado como identidad — no
    // hay un paso de confirmación aparte como con Telegram.
    const subscription = await entry.subscribe.execute(
      user.id,
      eventId,
      NotificationChannel.WHATSAPP,
      phone
    );
    res.json({ subscriptionId: subscription.id });
  });

  app.get("/api/users/me", async (req, res) => {
    const phone = readPhone(req.query.phone, res);
    if (!phone) return;

    const user = await deps.userRepository.findByPhone(phone);
    res.json({ email: user?.email ?? null });
  });

  app.post("/api/subscriptions/email", async (req, res) => {
    if (!isChannelEnabled(NotificationChannel.EMAIL, res)) return;
    const eventId = req.body?.eventId;
    const rawPhone = req.body?.phone;
    const email = req.body?.email;
    const entry = typeof eventId === "string" ? findWatchedEvent(eventId) : undefined;
    if (!entry) {
      res.status(400).json({ error: "eventId inválido o no vigilado" });
      return;
    }
    const phone = readPhone(rawPhone, res);
    if (!phone) return;
    if (typeof email !== "string" || !email) {
      res.status(400).json({ error: "email requerido" });
      return;
    }

    const user = await deps.findOrCreateUser.execute(phone);

    // El email es un dato de CUENTA, no de la suscripción — un solo email
    // por usuario. Si es la primera vez o lo está editando, se actualiza acá
    // y se propaga a las suscripciones EMAIL ya activas, para que ninguna
    // quede apuntando a una dirección vieja.
    if (user.email !== email) {
      await deps.userRepository.linkEmail(user.id, email);
      await deps.subscriptionRepository.updateChannelTargetForUser(
        user.id,
        NotificationChannel.EMAIL,
        email
      );
    }

    const subscription = await entry.subscribe.execute(
      user.id,
      eventId,
      NotificationChannel.EMAIL,
      email
    );
    res.json({ subscriptionId: subscription.id, email });
  });

  app.get("/api/subscriptions", async (req, res) => {
    const phone = readPhone(req.query.phone, res);
    if (!phone) return;

    const user = await deps.userRepository.findByPhone(phone);
    if (!user) {
      res.json([]);
      return;
    }

    const subscriptions = await deps.listUserSubscriptions.execute(user.id);

    // Agrupa por evento para armar la matriz evento×canal que pinta "Suscrito
    // a" — solo aparecen acá eventos con al menos una suscripción activa.
    const byEvent = new Map<
      string,
      { id: string; name: string; venue: string; channels: Record<string, string> }
    >();
    for (const subscription of subscriptions) {
      const entry = findWatchedEvent(subscription.eventId);
      const existing = byEvent.get(subscription.eventId) ?? {
        id: subscription.eventId,
        name: entry?.name ?? subscription.eventId,
        venue: entry?.venue ?? "",
        channels: {},
      };
      existing.channels[subscription.channel] = subscription.id;
      byEvent.set(subscription.eventId, existing);
    }

    res.json(Array.from(byEvent.values()));
  });

  app.delete("/api/subscriptions/:id", async (req, res) => {
    const phone = readPhone(req.query.phone, res);
    if (!phone) return;

    const user = await deps.userRepository.findByPhone(phone);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const result = await deps.unsubscribeUser.execute(req.params.id, user.id);
    if (result.ok) {
      res.status(204).end();
    } else {
      res.status(result.reason === "not_found" ? 404 : 403).json({ error: result.reason });
    }
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
  deps: Pick<HttpServerDeps, "watchedEvents" | "pendingTelegramLinks" | "userRepository">,
  token: string,
  chatId: string
): Promise<TelegramConfirmResult> {
  const consumed = deps.pendingTelegramLinks.consume(token);
  if (!consumed) {
    return { ok: false, reason: "expired_token" };
  }

  const entry = deps.watchedEvents.find((e) => e.id === consumed.eventId);
  if (!entry) {
    return { ok: false, reason: "event_not_watched" };
  }

  // Caso borde: ese chatId ya estaba linkeado a OTRO usuario (violación del
  // índice único) — típicamente un usuario legacy migrado desde antes de que
  // existiera `phone` (ver migración 2), que ya tiene ese chat pero no
  // teléfono. Mismo Telegram = misma persona, así que se usa el dueño
  // existente del chat en vez de intentar "robárselo" al usuario del token —
  // pero además hay que FUSIONAR: si ese dueño no tiene teléfono todavía, se
  // le asigna el del usuario del token, para que las dos rutas de identidad
  // (chatId y phone) terminen apuntando a la misma fila. Sin este paso, la
  // suscripción quedaba bajo la cuenta legacy sin teléfono — visible para el
  // bot (busca por chatId) pero invisible en "Suscrito a" (busca por phone).
  let userId = consumed.userId;
  try {
    await deps.userRepository.linkTelegramChatId(userId, chatId);
  } catch (error) {
    const owner = await deps.userRepository.findByTelegramChatId(chatId);
    if (!owner) throw error;

    if (!owner.phone) {
      await deps.userRepository.reassignPhone(consumed.userId, owner.id);
    }

    userId = owner.id;
  }

  const subscription = await entry.subscribe.execute(
    userId,
    consumed.eventId,
    NotificationChannel.TELEGRAM,
    chatId
  );
  return { ok: true, subscriptionId: subscription.id };
}
