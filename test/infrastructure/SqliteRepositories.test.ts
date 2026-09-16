import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/infrastructure/persistence/sqlite/Database";
import { SqliteEventStateRepository } from "../../src/infrastructure/persistence/sqlite/SqliteEventStateRepository";
import { SqliteSubscriptionRepository } from "../../src/infrastructure/persistence/sqlite/SqliteSubscriptionRepository";
import { Subscription } from "../../src/domain/entities/Subscription";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";
import { EventStatus } from "../../src/domain/value-objects/EventStatus";

describe("SqliteEventStateRepository", () => {
  it("guarda y devuelve el último estado conocido", async () => {
    const db = openDatabase(":memory:");
    const repo = new SqliteEventStateRepository(db);

    expect(await repo.getLastKnownStatus("ticketmaster:1")).toBeNull();

    await repo.saveStatus("ticketmaster:1", EventStatus.ONSALE);
    expect(await repo.getLastKnownStatus("ticketmaster:1")).toBe(EventStatus.ONSALE);

    await repo.saveStatus("ticketmaster:1", EventStatus.OFFSALE);
    expect(await repo.getLastKnownStatus("ticketmaster:1")).toBe(EventStatus.OFFSALE);
  });
});

describe("SqliteSubscriptionRepository", () => {
  it("guarda y devuelve solo las suscripciones activas del evento", async () => {
    const db = openDatabase(":memory:");
    const repo = new SqliteSubscriptionRepository(db);

    const subscription = Subscription.create({
      userId: "user-1",
      eventId: "ticketmaster:1",
      channel: NotificationChannel.TELEGRAM,
      channelTarget: "123456",
    });
    await repo.save(subscription);

    const found = await repo.findActiveByEventId("ticketmaster:1");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(subscription.id);

    const notFound = await repo.findActiveByEventId("ticketmaster:otro");
    expect(notFound).toHaveLength(0);
  });
});
