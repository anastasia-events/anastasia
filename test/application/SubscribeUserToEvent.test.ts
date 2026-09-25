import { describe, expect, it, vi } from "vitest";
import { SubscribeUserToEvent } from "../../src/application/use-cases/SubscribeUserToEvent";
import { EventProviderPort } from "../../src/application/ports/out/EventProviderPort";
import { SubscriptionRepositoryPort } from "../../src/application/ports/out/SubscriptionRepositoryPort";
import { Subscription } from "../../src/domain/entities/Subscription";
import { Event } from "../../src/domain/entities/Event";
import { EventStatus } from "../../src/domain/value-objects/EventStatus";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";

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

function fakeEventProvider(): EventProviderPort {
  return {
    findEventById: vi.fn().mockResolvedValue(fakeEvent),
    checkStatus: vi.fn(),
  };
}

describe("SubscribeUserToEvent", () => {
  it("crea una suscripción nueva cuando no existe ninguna para ese evento+canal+target", async () => {
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findById: vi.fn(),
      findByEventChannelAndTarget: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    };

    const useCase = new SubscribeUserToEvent(fakeEventProvider(), subscriptionRepository);
    const subscription = await useCase.execute(
      "user-1",
      "ticketmaster:1",
      NotificationChannel.EMAIL,
      "a@b.com"
    );

    expect(subscription.active).toBe(true);
    expect(subscriptionRepository.save).toHaveBeenCalledWith(subscription);
  });

  it("es idempotente: devuelve la existente sin volver a guardar si ya está activa", async () => {
    const existing = Subscription.create({
      userId: "user-1",
      eventId: "ticketmaster:1",
      channel: NotificationChannel.WHATSAPP,
      channelTarget: "555",
    });
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findById: vi.fn(),
      findByEventChannelAndTarget: vi.fn().mockResolvedValue(existing),
      save: vi.fn(),
    };

    const useCase = new SubscribeUserToEvent(fakeEventProvider(), subscriptionRepository);
    const result = await useCase.execute(
      "user-1",
      "ticketmaster:1",
      NotificationChannel.WHATSAPP,
      "555"
    );

    expect(result).toBe(existing);
    expect(subscriptionRepository.save).not.toHaveBeenCalled();
  });

  it("reactiva una suscripción inactiva en vez de crear una fila duplicada", async () => {
    const inactive = Subscription.create({
      userId: "user-1",
      eventId: "ticketmaster:1",
      channel: NotificationChannel.WHATSAPP,
      channelTarget: "555",
    }).deactivate();
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findById: vi.fn(),
      findByEventChannelAndTarget: vi.fn().mockResolvedValue(inactive),
      save: vi.fn(),
    };

    const useCase = new SubscribeUserToEvent(fakeEventProvider(), subscriptionRepository);
    const result = await useCase.execute(
      "user-1",
      "ticketmaster:1",
      NotificationChannel.WHATSAPP,
      "555"
    );

    expect(result.id).toBe(inactive.id);
    expect(result.active).toBe(true);
    expect(subscriptionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: inactive.id, active: true })
    );
  });

  it("no reusa una fila que pertenece a otro usuario, crea una propia", async () => {
    const othersSubscription = Subscription.create({
      userId: "otro-usuario",
      eventId: "ticketmaster:1",
      channel: NotificationChannel.EMAIL,
      channelTarget: "compartido@ejemplo.com",
    });
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findById: vi.fn(),
      findByEventChannelAndTarget: vi.fn().mockResolvedValue(othersSubscription),
      save: vi.fn(),
    };

    const useCase = new SubscribeUserToEvent(fakeEventProvider(), subscriptionRepository);
    const result = await useCase.execute(
      "user-1",
      "ticketmaster:1",
      NotificationChannel.EMAIL,
      "compartido@ejemplo.com"
    );

    expect(result.id).not.toBe(othersSubscription.id);
    expect(result.userId).toBe("user-1");
  });
});
