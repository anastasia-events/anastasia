import TelegramBot from "node-telegram-bot-api";
import { ListUserSubscriptionsPort } from "../../application/ports/in/ListUserSubscriptionsPort";
import { UnsubscribeUserPort } from "../../application/ports/in/UnsubscribeUserPort";
import { UserRepositoryPort } from "../../application/ports/out/UserRepositoryPort";
import { Subscription } from "../../domain/entities/Subscription";
import { User } from "../../domain/entities/User";
import { NotificationChannel } from "../../domain/value-objects/NotificationChannel";
import type { TelegramConfirmResult, WatchedEventEntry } from "../http/server";

// Solo lo que los comandos usan del bot: permite testearlos con un bot falso
// sin levantar polling contra Telegram.
export type TelegramBotApi = Pick<
  TelegramBot,
  "onText" | "on" | "sendMessage" | "answerCallbackQuery" | "editMessageReplyMarkup"
>;

export interface TelegramBotCommandsDeps {
  bot: TelegramBotApi;
  userRepository: UserRepositoryPort;
  listUserSubscriptions: ListUserSubscriptionsPort;
  unsubscribeUser: UnsubscribeUserPort;
  watchedEvents: WatchedEventEntry[];
  // Inyectado (en vez de importar confirmTelegramSubscription) para que los
  // comandos no dependan del servidor HTTP.
  confirmSubscription: (token: string, chatId: string) => Promise<TelegramConfirmResult>;
}

const UNSUB_CALLBACK_PREFIX = "unsub:";

const MIS_SUSCRIPCIONES_HINT =
  "Usá /misuscripciones cuando quieras ver o cancelar tus suscripciones por acá, o /unsuscribe para cancelarlas todas.";

export class TelegramBotCommands {
  constructor(private readonly deps: TelegramBotCommandsDeps) {}

  register(): void {
    const { bot } = this.deps;
    bot.onText(/^\/start$/, (msg) => this.handleStart(String(msg.chat.id)));
    bot.onText(/^\/start (.+)$/, (msg, match) => this.handleStartWithToken(String(msg.chat.id), match?.[1]));
    bot.onText(/^\/misuscripciones$/, (msg) => this.handleMySubscriptions(String(msg.chat.id)));
    bot.onText(/^\/(unsuscribe|unsubscribe)$/, (msg) => this.handleUnsubscribeAll(String(msg.chat.id)));
    bot.on("callback_query", (query) => this.handleCallback(query));
  }

  // /start sin token (alguien abre el bot directo, sin venir de un deep link
  // de la web) — explica para qué sirve el bot y el comando de gestión.
  private async handleStart(chatId: string): Promise<void> {
    await this.deps.bot.sendMessage(
      chatId,
      `👋 ¡Hola! Este bot avisa cuando cambia la disponibilidad de los eventos que elegiste en la web.\n\n${MIS_SUSCRIPCIONES_HINT}`
    );
  }

  private async handleStartWithToken(chatId: string, token: string | undefined): Promise<void> {
    if (!token) return;

    const result = await this.deps.confirmSubscription(token, chatId);

    if (result.ok) {
      await this.deps.bot.sendMessage(
        chatId,
        `✅ ¡Listo! Te vamos a avisar por acá apenas cambie la disponibilidad de ese evento.\n\n${MIS_SUSCRIPCIONES_HINT}`
      );
    } else {
      const reason =
        result.reason === "expired_token"
          ? "Ese link ya venció o ya se usó. Volvé a la web y generá uno nuevo."
          : "Ese evento ya no está vigilado.";
      await this.deps.bot.sendMessage(chatId, `⚠️ ${reason}`);
    }
  }

  // /misuscripciones + botones inline "Cancelar" — el chatId de Telegram ya
  // autentica al usuario, así que no hace falta ningún login para que cada
  // quien vea y cancele solo sus propias suscripciones. Solo busca (no crea):
  // un chat sin usuario linkeado todavía simplemente no tiene nada que listar.
  private async handleMySubscriptions(chatId: string): Promise<void> {
    const user = await this.deps.userRepository.findByTelegramChatId(chatId);
    const subscriptions = user ? await this.findTelegramSubscriptions(user) : [];

    if (subscriptions.length === 0) {
      await this.deps.bot.sendMessage(chatId, "No tenés suscripciones activas por Telegram todavía.");
      return;
    }

    const rows = subscriptions.map((subscription) => [
      {
        text: `❌ Cancelar: ${this.labelFor(subscription)}`,
        callback_data: `${UNSUB_CALLBACK_PREFIX}${subscription.id}`,
      },
    ]);

    await this.deps.bot.sendMessage(chatId, "Tus suscripciones activas por Telegram:", {
      reply_markup: { inline_keyboard: rows },
    });
  }

  // /unsuscribe cancela TODAS las suscripciones de Telegram del chat (mismo
  // filtro por canal que /misuscripciones: WhatsApp/Email no se tocan) y
  // desvincula el chatId del usuario, para que volver a suscribirse por
  // Telegram exija pasar otra vez por el deep link /start <token>.
  private async handleUnsubscribeAll(chatId: string): Promise<void> {
    const user = await this.deps.userRepository.findByTelegramChatId(chatId);
    if (!user) {
      await this.deps.bot.sendMessage(chatId, "No tenés suscripciones activas por Telegram.");
      return;
    }

    const subscriptions = await this.findTelegramSubscriptions(user);
    for (const subscription of subscriptions) {
      await this.deps.unsubscribeUser.execute(subscription.id, user.id);
    }
    await this.deps.userRepository.unlinkTelegramChatId(user.id);

    const summary =
      subscriptions.length === 0
        ? "No tenías suscripciones activas por Telegram, pero desvinculamos este chat."
        : `Cancelamos ${subscriptions.length} ${subscriptions.length === 1 ? "suscripción" : "suscripciones"} por Telegram y desvinculamos este chat.`;
    await this.deps.bot.sendMessage(
      chatId,
      `✅ ${summary} Ya no vas a recibir avisos por acá. Para volver a suscribirte, hacelo desde la web.`
    );
  }

  private async handleCallback(query: TelegramBot.CallbackQuery): Promise<void> {
    const data = query.data;
    const chatId = query.message ? String(query.message.chat.id) : undefined;
    if (!data?.startsWith(UNSUB_CALLBACK_PREFIX) || !chatId) return;

    const subscriptionId = data.slice(UNSUB_CALLBACK_PREFIX.length);
    const user = await this.deps.userRepository.findByTelegramChatId(chatId);
    const result = user
      ? await this.deps.unsubscribeUser.execute(subscriptionId, user.id)
      : ({ ok: false, reason: "not_found" } as const);

    if (result.ok) {
      await this.deps.bot.answerCallbackQuery(query.id, { text: "Cancelada ✅" });
      if (query.message) {
        await this.deps.bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id }
        );
      }
    } else {
      await this.deps.bot.answerCallbackQuery(query.id, {
        text: "No se pudo cancelar esa suscripción.",
      });
    }
  }

  // Solo el canal TELEGRAM: un mismo usuario puede tener suscripciones
  // activas en WhatsApp/Email también (multi-select del modal), pero esas se
  // gestionan desde "Suscrito a" en la web — listarlas acá también generaba
  // filas que parecían duplicadas cuando en realidad eran canales distintos
  // del mismo evento.
  private async findTelegramSubscriptions(user: User): Promise<Subscription[]> {
    const all = await this.deps.listUserSubscriptions.execute(user.id);
    return all.filter((subscription) => subscription.channel === NotificationChannel.TELEGRAM);
  }

  private labelFor(subscription: Subscription): string {
    const entry = this.deps.watchedEvents.find((e) => e.id === subscription.eventId);
    return entry ? `${entry.name} (${entry.venue})` : subscription.eventId;
  }
}
