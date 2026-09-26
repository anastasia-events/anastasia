import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHttpServer, WatchedEventEntry } from "../../src/infrastructure/http/server";
import { normalizePhone, parseAllowedPhones } from "../../src/infrastructure/http/phone";
import { FindOrCreateUserByPhone } from "../../src/application/use-cases/FindOrCreateUserByPhone";
import { ListUserSubscriptions } from "../../src/application/use-cases/ListUserSubscriptions";
import { UnsubscribeUser } from "../../src/application/use-cases/UnsubscribeUser";
import { openDatabase } from "../../src/infrastructure/persistence/sqlite/Database";
import { SqliteSubscriptionRepository } from "../../src/infrastructure/persistence/sqlite/SqliteSubscriptionRepository";
import { SqliteUserRepository } from "../../src/infrastructure/persistence/sqlite/SqliteUserRepository";
import { PendingTelegramLinkStore } from "../../src/infrastructure/telegram/PendingTelegramLinkStore";
import { Subscription } from "../../src/domain/entities/Subscription";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";

describe("normalizePhone / parseAllowedPhones", () => {
  it("trata igual el celular con o sin +57 y espacios", () => {
    expect(normalizePhone("+57 300 123 4567")).toBe("3001234567");
    expect(normalizePhone("573001234567")).toBe("3001234567");
    expect(normalizePhone("300-123-4567")).toBe("3001234567");
  });

  it("lista vacía = sin restricción", () => {
    expect(parseAllowedPhones(undefined)).toBeUndefined();
    expect(parseAllowedPhones(" , ")).toBeUndefined();
    expect(parseAllowedPhones("3001234567, +57 3009876543")).toEqual(new Set(["3001234567", "3009876543"]));
  });
});

describe("lista de celulares permitidos en la API", () => {
  let server: Server;
  let baseUrl: string;
  let subscribeExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const db = openDatabase(":memory:");
    const userRepository = new SqliteUserRepository(db);
    const subscriptionRepository = new SqliteSubscriptionRepository(db);
    subscribeExecute = vi.fn().mockImplementation(async (userId, eventId, channel, channelTarget) =>
      Subscription.create({ userId, eventId, channel, channelTarget })
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

    const app = buildHttpServer({
      watchedEvents,
      pendingTelegramLinks: new PendingTelegramLinkStore(),
      findOrCreateUser: new FindOrCreateUserByPhone(userRepository),
      userRepository,
      subscriptionRepository,
      listUserSubscriptions: new ListUserSubscriptions(subscriptionRepository),
      unsubscribeUser: new UnsubscribeUser(subscriptionRepository),
      telegramBotUsername: "test_bot",
      frontendOrigin: "http://localhost:5173",
      allowedPhones: new Set(["3001234567"]),
      // EMAIL sin notificador configurado, para probar el canal deshabilitado.
      enabledChannels: new Set([NotificationChannel.TELEGRAM, NotificationChannel.WHATSAPP]),
    });

    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    server.close();
  });

  async function post(path: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("/api/session acepta un número permitido y lo devuelve normalizado", async () => {
    const res = await post("/api/session", { phone: "+57 300 123 4567" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ phone: "3001234567" });
  });

  it("/api/session rechaza con 403 un número fuera de la lista", async () => {
    const res = await post("/api/session", { phone: "3009999999" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("phone_not_allowed");
  });

  it("no deja suscribirse a un número fuera de la lista", async () => {
    const res = await post("/api/subscriptions/whatsapp", { eventId: "crowder:x", phone: "3009999999" });
    expect(res.status).toBe(403);
    expect(subscribeExecute).not.toHaveBeenCalled();
  });

  it("guarda el target de WhatsApp normalizado aunque llegue con +57", async () => {
    const res = await post("/api/subscriptions/whatsapp", { eventId: "crowder:x", phone: "+57 300 123 4567" });
    expect(res.status).toBe(200);
    expect(subscribeExecute).toHaveBeenCalledWith(expect.any(String), "crowder:x", "WHATSAPP", "3001234567");
  });

  it("/api/channels solo lista los canales con notificador configurado", async () => {
    const res = await fetch(`${baseUrl}/api/channels`);
    expect(await res.json()).toEqual(["TELEGRAM", "WHATSAPP"]);
  });

  it("rechaza con 503 el alta en un canal deshabilitado", async () => {
    const res = await post("/api/subscriptions/email", { eventId: "crowder:x", phone: "3001234567", email: "a@b.com" });
    expect(res.status).toBe(503);
    expect(subscribeExecute).not.toHaveBeenCalled();
  });
});
