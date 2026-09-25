import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { confirmTelegramSubscription, WatchedEventEntry } from "../../src/infrastructure/http/server";
import { openDatabase } from "../../src/infrastructure/persistence/sqlite/Database";
import { SqliteUserRepository } from "../../src/infrastructure/persistence/sqlite/SqliteUserRepository";
import { PendingTelegramLinkStore } from "../../src/infrastructure/telegram/PendingTelegramLinkStore";
import { Subscription } from "../../src/domain/entities/Subscription";
import { User } from "../../src/domain/entities/User";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";

describe("confirmTelegramSubscription", () => {
  it("fusiona el teléfono en el usuario legacy dueño del chat en vez de dejarlo huérfano", async () => {
    const db = openDatabase(":memory:");
    const userRepository = new SqliteUserRepository(db);
    const chatId = "5023707731";

    // Usuario legacy migrado desde antes de que existiera `phone` (igual que
    // los usuarios reales que vienen de la migración 2): tiene el chat, no
    // tiene teléfono.
    const legacyUser = new User({
      id: randomUUID(),
      phone: null,
      telegramChatId: chatId,
      createdAt: new Date(),
    });
    await userRepository.save(legacyUser);

    // Usuario nuevo creado por la web al identificarse con el celular, antes
    // de tocar Start en el bot.
    const phoneUser = User.create({ phone: "3147224936" });
    await userRepository.save(phoneUser);

    const pendingTelegramLinks = new PendingTelegramLinkStore();
    const token = pendingTelegramLinks.create("crowder:x", phoneUser.id);

    const subscribeExecute = vi.fn().mockResolvedValue(
      Subscription.create({
        userId: legacyUser.id,
        eventId: "crowder:x",
        channel: NotificationChannel.TELEGRAM,
        channelTarget: chatId,
      })
    );
    const watchedEvents: WatchedEventEntry[] = [
      {
        id: "crowder:x",
        name: "Evento X",
        venue: "Venue X",
        provider: {} as WatchedEventEntry["provider"],
        subscribe: { execute: subscribeExecute },
      },
    ];

    const result = await confirmTelegramSubscription(
      { watchedEvents, pendingTelegramLinks, userRepository },
      token,
      chatId
    );

    expect(result.ok).toBe(true);
    // La suscripción se crea bajo el usuario LEGACY (dueño real del chat),
    // no bajo el usuario nuevo creado por la web.
    expect(subscribeExecute).toHaveBeenCalledWith(
      legacyUser.id,
      "crowder:x",
      NotificationChannel.TELEGRAM,
      chatId
    );

    // Y ese usuario legacy queda fusionado: ahora tiene el teléfono también,
    // así que buscarlo por phone lo encuentra — antes del fix quedaba
    // invisible para "Suscrito a".
    const mergedByPhone = await userRepository.findByPhone("3147224936");
    expect(mergedByPhone?.id).toBe(legacyUser.id);
    expect(mergedByPhone?.telegramChatId).toBe(chatId);
  });
});
