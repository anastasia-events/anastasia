import TelegramBot from "node-telegram-bot-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListUserSubscriptions } from "../../src/application/use-cases/ListUserSubscriptions";
import { UnsubscribeUser } from "../../src/application/use-cases/UnsubscribeUser";
import { Subscription } from "../../src/domain/entities/Subscription";
import { User } from "../../src/domain/entities/User";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";
import { WatchedEventEntry } from "../../src/infrastructure/http/server";
import { openDatabase } from "../../src/infrastructure/persistence/sqlite/Database";
import { SqliteSubscriptionRepository } from "../../src/infrastructure/persistence/sqlite/SqliteSubscriptionRepository";
import { SqliteUserRepository } from "../../src/infrastructure/persistence/sqlite/SqliteUserRepository";
import { TelegramBotApi, TelegramBotCommands } from "../../src/infrastructure/telegram/TelegramBotCommands";

const CHAT_ID = "5023707731";

// Bot falso: guarda los handlers registrados para dispararlos a mano y graba
// lo que se le manda a Telegram.
function createFakeBot() {
  const textHandlers: Array<[RegExp, (msg: TelegramBot.Message, match: RegExpExecArray | null) => unknown]> = [];
  let callbackHandler: ((query: TelegramBot.CallbackQuery) => unknown) | undefined;

  const bot = {
    onText: vi.fn((regexp: RegExp, handler) => textHandlers.push([regexp, handler])),
    on: vi.fn((event: string, handler) => {
      if (event === "callback_query") callbackHandler = handler;
    }),
    sendMessage: vi.fn().mockResolvedValue({}),
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
  };

  return {
    bot,
    async sendText(text: string) {
      const msg = { chat: { id: Number(CHAT_ID) }, text } as TelegramBot.Message;
      for (const [regexp, handler] of textHandlers) {
        const match = regexp.exec(text);
        if (match) await handler(msg, match);
      }
    },
    async sendCallback(data: string) {
      await callbackHandler?.({
        id: "q1",
        data,
        message: { chat: { id: Number(CHAT_ID) }, message_id: 7 },
      } as TelegramBot.CallbackQuery);
    },
  };
}

describe("TelegramBotCommands", () => {
  let fake: ReturnType<typeof createFakeBot>;
  let userRepository: SqliteUserRepository;
  let subscriptionRepository: SqliteSubscriptionRepository;
  let confirmSubscription: ReturnType<typeof vi.fn>;
  const watchedEvents: WatchedEventEntry[] = [
    {
      id: "evt-1",
      name: "Evento 1",
      venue: "Estadio",
      provider: {} as WatchedEventEntry["provider"],
      subscribe: { execute: vi.fn() },
    },
  ];

  beforeEach(() => {
    const db = openDatabase(":memory:");
    userRepository = new SqliteUserRepository(db);
    subscriptionRepository = new SqliteSubscriptionRepository(db);
    fake = createFakeBot();
    confirmSubscription = vi.fn();

    new TelegramBotCommands({
      bot: fake.bot as unknown as TelegramBotApi,
      userRepository,
      listUserSubscriptions: new ListUserSubscriptions(subscriptionRepository),
      unsubscribeUser: new UnsubscribeUser(subscriptionRepository),
      watchedEvents,
      confirmSubscription,
    }).register();
  });

  async function seedUserWithSubscriptions() {
    const user = User.create({ phone: "3001234567" });
    await userRepository.save(user);
    await userRepository.linkTelegramChatId(user.id, CHAT_ID);
    const telegram = Subscription.create({
      userId: user.id,
      eventId: "evt-1",
      channel: NotificationChannel.TELEGRAM,
      channelTarget: CHAT_ID,
    });
    const email = Subscription.create({
      userId: user.id,
      eventId: "evt-1",
      channel: NotificationChannel.EMAIL,
      channelTarget: "a@b.co",
    });
    await subscriptionRepository.save(telegram);
    await subscriptionRepository.save(email);
    return { user, telegram, email };
  }

  it("/start sin token solo saluda, sin disparar la confirmación", async () => {
    await fake.sendText("/start");

    expect(confirmSubscription).not.toHaveBeenCalled();
    expect(fake.bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(fake.bot.sendMessage.mock.calls[0][1]).toContain("¡Hola!");
  });

  it("/start <token> confirma y avisa según el resultado", async () => {
    confirmSubscription.mockResolvedValueOnce({ ok: false, reason: "expired_token" });
    await fake.sendText("/start abc");

    expect(confirmSubscription).toHaveBeenCalledWith("abc", CHAT_ID);
    expect(fake.bot.sendMessage).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining("ya venció"));
  });

  it("/misuscripciones lista solo las de Telegram con su botón de cancelar", async () => {
    const { telegram } = await seedUserWithSubscriptions();

    await fake.sendText("/misuscripciones");

    const [, , options] = fake.bot.sendMessage.mock.calls[0];
    expect(options.reply_markup.inline_keyboard).toEqual([
      [{ text: "❌ Cancelar: Evento 1 (Estadio)", callback_data: `unsub:${telegram.id}` }],
    ]);
  });

  it("/unsuscribe cancela solo Telegram y desvincula el chat", async () => {
    const { user, email } = await seedUserWithSubscriptions();

    await fake.sendText("/unsuscribe");

    const remaining = await subscriptionRepository.findActiveByUserId(user.id);
    expect(remaining.map((s) => s.id)).toEqual([email.id]);
    expect(await userRepository.findByTelegramChatId(CHAT_ID)).toBeNull();
    expect(fake.bot.sendMessage).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining("Cancelamos 1 suscripción"));
  });

  it("el botón unsub: cancela la suscripción y quita el teclado", async () => {
    const { telegram } = await seedUserWithSubscriptions();

    await fake.sendCallback(`unsub:${telegram.id}`);

    expect(fake.bot.answerCallbackQuery).toHaveBeenCalledWith("q1", { text: "Cancelada ✅" });
    expect(fake.bot.editMessageReplyMarkup).toHaveBeenCalledWith(
      { inline_keyboard: [] },
      { chat_id: CHAT_ID, message_id: 7 }
    );
    expect(await subscriptionRepository.findById(telegram.id)).toMatchObject({ active: false });
  });
});
