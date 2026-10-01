import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHttpServer, WatchedEventEntry } from "../../src/infrastructure/http/server";
import { FindOrCreateUserByPhone } from "../../src/application/use-cases/FindOrCreateUserByPhone";
import { ListUserSubscriptions } from "../../src/application/use-cases/ListUserSubscriptions";
import { UnsubscribeUser } from "../../src/application/use-cases/UnsubscribeUser";
import { openDatabase } from "../../src/infrastructure/persistence/sqlite/Database";
import { SqliteSubscriptionRepository } from "../../src/infrastructure/persistence/sqlite/SqliteSubscriptionRepository";
import { SqliteUserRepository } from "../../src/infrastructure/persistence/sqlite/SqliteUserRepository";
import { PendingTelegramLinkStore } from "../../src/infrastructure/telegram/PendingTelegramLinkStore";
import { Subscription } from "../../src/domain/entities/Subscription";
import { User } from "../../src/domain/entities/User";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";

let server: Server;
let baseUrl: string;
let subscribeExecute: ReturnType<typeof vi.fn>;
let userRepository: SqliteUserRepository;
let subscriptionRepository: SqliteSubscriptionRepository;

beforeEach(async () => {
  const db = openDatabase(":memory:");
  userRepository = new SqliteUserRepository(db);
  subscriptionRepository = new SqliteSubscriptionRepository(db);

  // Mock liviano que igual persiste (a diferencia de un vi.fn() plano) para
  // que los tests de email puedan verificar el channel_target real en la
  // base después de "editar" — imita la idempotencia/reactivación real de
  // SubscribeUserToEvent sin depender de un EventProviderPort de verdad.
  subscribeExecute = vi.fn().mockImplementation(async (userId, eventId, channel, channelTarget) => {
    const existing = await subscriptionRepository.findByEventChannelAndTarget(eventId, channel, channelTarget);
    const subscription =
      existing && existing.userId === userId
        ? existing.active
          ? existing
          : existing.reactivate()
        : Subscription.create({ userId, eventId, channel, channelTarget });
    await subscriptionRepository.save(subscription);
    return subscription;
  });
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
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  server.close();
});

describe("POST /api/subscriptions/telegram", () => {
  it("devuelve token + deepLink cuando el usuario nunca inició el bot", async () => {
    const res = await fetch(`${baseUrl}/api/subscriptions/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "crowder:x", phone: "3001234567" }),
    });
    const body = await res.json();

    expect(body.linked).toBe(false);
    expect(body.token).toBeTruthy();
    expect(body.deepLink).toContain("t.me/test_bot?start=");
    expect(subscribeExecute).not.toHaveBeenCalled();
  });

  it("suscribe directo (sin token) cuando el usuario ya tiene el chat linkeado", async () => {
    const linkedUser = User.create({ phone: "3001234567" }).withTelegramChatId("555");
    await userRepository.save(linkedUser);

    const res = await fetch(`${baseUrl}/api/subscriptions/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "crowder:x", phone: "3001234567" }),
    });
    const body = await res.json();

    expect(body.linked).toBe(true);
    expect(body.subscriptionId).toBeTruthy();
    expect(subscribeExecute).toHaveBeenCalledWith(
      linkedUser.id,
      "crowder:x",
      NotificationChannel.TELEGRAM,
      "555"
    );
  });
});

describe("POST /api/subscriptions/email + GET /api/users/me", () => {
  it("guarda el email de cuenta la primera vez y lo devuelve en /api/users/me", async () => {
    await fetch(`${baseUrl}/api/subscriptions/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "crowder:x", phone: "3001234567", email: "a@b.com" }),
    });

    const res = await fetch(`${baseUrl}/api/users/me?phone=3001234567`);
    const body = await res.json();

    expect(body.email).toBe("a@b.com");
  });

  it("editar el email propaga el cambio a las suscripciones EMAIL ya activas (un solo email por cuenta)", async () => {
    // Primer evento con el email original.
    await fetch(`${baseUrl}/api/subscriptions/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "crowder:x", phone: "3001234567", email: "viejo@ejemplo.com" }),
    });

    const user = await userRepository.findByPhone("3001234567");
    const activeBefore = await subscriptionRepository.findActiveByUserId(user!.id);
    expect(activeBefore[0].channelTarget).toBe("viejo@ejemplo.com");

    // Se "edita" el email al confirmar otra suscripción (o la misma) con uno nuevo.
    await fetch(`${baseUrl}/api/subscriptions/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "crowder:x", phone: "3001234567", email: "nuevo@ejemplo.com" }),
    });

    const activeAfter = await subscriptionRepository.findActiveByUserId(user!.id);
    expect(activeAfter).toHaveLength(1);
    expect(activeAfter[0].channelTarget).toBe("nuevo@ejemplo.com");

    const meRes = await fetch(`${baseUrl}/api/users/me?phone=3001234567`);
    expect((await meRes.json()).email).toBe("nuevo@ejemplo.com");
  });

  it("/api/users/me devuelve email null si no hay usuario para ese phone", async () => {
    const res = await fetch(`${baseUrl}/api/users/me?phone=000`);
    expect((await res.json()).email).toBeNull();
  });
});

describe("WhatsApp restringido a TEST_WAPP_NUMBERS", () => {
  let restrictedServer: Server;
  let restrictedUrl: string;

  beforeEach(async () => {
    const db = openDatabase(":memory:");
    const users = new SqliteUserRepository(db);
    const subscriptions = new SqliteSubscriptionRepository(db);
    const app = buildHttpServer({
      watchedEvents: [
        {
          id: "crowder:x",
          name: "Evento X",
          venue: "Venue X",
          provider: {} as WatchedEventEntry["provider"],
          subscribe: {
            execute: vi.fn().mockImplementation(async (userId, eventId, channel, channelTarget) =>
              Subscription.create({ userId, eventId, channel, channelTarget })
            ),
          },
        },
      ],
      pendingTelegramLinks: new PendingTelegramLinkStore(),
      findOrCreateUser: new FindOrCreateUserByPhone(users),
      userRepository: users,
      subscriptionRepository: subscriptions,
      listUserSubscriptions: new ListUserSubscriptions(subscriptions),
      unsubscribeUser: new UnsubscribeUser(subscriptions),
      telegramBotUsername: "test_bot",
      frontendOrigin: "http://localhost:5173",
      whatsappPhones: new Set(["3147229936"]),
    });
    restrictedServer = app.listen(0);
    await new Promise((resolve) => restrictedServer.once("listening", resolve));
    restrictedUrl = `http://127.0.0.1:${(restrictedServer.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    restrictedServer.close();
  });

  async function channelsFor(query: string): Promise<string[]> {
    return (await fetch(`${restrictedUrl}/api/channels${query}`)).json();
  }

  it("/api/channels ofrece WhatsApp solo a los números de la lista (con o sin +57)", async () => {
    expect(await channelsFor("?phone=3147229936")).toContain("WHATSAPP");
    expect(await channelsFor("?phone=%2B57%20314%20722%209936")).toContain("WHATSAPP");
    expect(await channelsFor("?phone=3001234567")).not.toContain("WHATSAPP");
    expect(await channelsFor("")).not.toContain("WHATSAPP");
    expect(await channelsFor("?phone=3001234567")).toEqual(["TELEGRAM", "EMAIL"]);
  });

  it("el alta por WhatsApp responde 403 whatsapp_not_allowed fuera de la lista", async () => {
    const subscribe = (phone: string) =>
      fetch(`${restrictedUrl}/api/subscriptions/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: "crowder:x", phone }),
      });

    const denied = await subscribe("3001234567");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "whatsapp_not_allowed" });

    const allowed = await subscribe("3147229936");
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).subscriptionId).toBeTruthy();
  });

  it("sin lista, WhatsApp queda para cualquiera (servidor por defecto)", async () => {
    const list = await (await fetch(`${baseUrl}/api/channels?phone=3001234567`)).json();
    expect(list).toContain("WHATSAPP");
  });
});
