import { describe, expect, it, vi } from "vitest";
import { NotifySubscribers } from "../../src/application/use-cases/NotifySubscribers";
import { SubscriptionRepositoryPort } from "../../src/application/ports/out/SubscriptionRepositoryPort";
import { NotificationPort } from "../../src/application/ports/out/NotificationPort";
import { Subscription } from "../../src/domain/entities/Subscription";
import { Event } from "../../src/domain/entities/Event";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";
import { NotificationStatus } from "../../src/domain/value-objects/NotificationStatus";
import { EventStatus } from "../../src/domain/value-objects/EventStatus";

function fakeSubscription(channel: NotificationChannel): Subscription {
  return Subscription.create({
    userId: "user-1",
    eventId: "ticketmaster:1",
    channel,
    channelTarget: "123456",
  });
}

const fakeEvent = new Event({
  id: "ticketmaster:1",
  providerId: "1",
  name: "Test Event",
  venue: "Test Venue",
  status: EventStatus.ONSALE,
  onSaleDate: null,
  lastCheckedAt: null,
  lastKnownStatus: null,
});

describe("NotifySubscribers", () => {
  it("envía por el canal correcto y registra el resultado", async () => {
    const subscription = fakeSubscription(NotificationChannel.TELEGRAM);
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn().mockResolvedValue([subscription]),
      save: vi.fn(),
    };
    const telegramNotifier: NotificationPort = {
      send: vi.fn().mockResolvedValue({ status: NotificationStatus.SENT }),
    };

    const useCase = new NotifySubscribers(
      subscriptionRepository,
      new Map([[NotificationChannel.TELEGRAM, telegramNotifier]])
    );

    const records = await useCase.execute("ticketmaster:1", fakeEvent);

    expect(telegramNotifier.send).toHaveBeenCalledWith(subscription, fakeEvent);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe(NotificationStatus.SENT);
  });

  it("marca FAILED si no hay adaptador para el canal (ej. CALL sin resolver)", async () => {
    const subscription = fakeSubscription(NotificationChannel.CALL);
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn().mockResolvedValue([subscription]),
      save: vi.fn(),
    };

    const useCase = new NotifySubscribers(subscriptionRepository, new Map());
    const records = await useCase.execute("ticketmaster:1", fakeEvent);

    expect(records[0].status).toBe(NotificationStatus.FAILED);
  });
});
