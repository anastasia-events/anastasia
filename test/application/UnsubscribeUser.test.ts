import { describe, expect, it, vi } from "vitest";
import { UnsubscribeUser } from "../../src/application/use-cases/UnsubscribeUser";
import { SubscriptionRepositoryPort } from "../../src/application/ports/out/SubscriptionRepositoryPort";
import { Subscription } from "../../src/domain/entities/Subscription";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";

function fakeSubscription(userId: string): Subscription {
  return Subscription.create({
    userId,
    eventId: "ticketmaster:1",
    channel: NotificationChannel.TELEGRAM,
    channelTarget: "123456",
  });
}

describe("UnsubscribeUser", () => {
  it("desactiva y guarda la suscripción cuando pertenece al usuario", async () => {
    const subscription = fakeSubscription("user-1");
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findById: vi.fn().mockResolvedValue(subscription),
      findByEventChannelAndTarget: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new UnsubscribeUser(subscriptionRepository);
    const result = await useCase.execute(subscription.id, "user-1");

    expect(result).toEqual({ ok: true });
    expect(subscriptionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: subscription.id, active: false })
    );
  });

  it("rechaza cancelar la suscripción de otro usuario", async () => {
    const subscription = fakeSubscription("user-1");
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findById: vi.fn().mockResolvedValue(subscription),
      findByEventChannelAndTarget: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new UnsubscribeUser(subscriptionRepository);
    const result = await useCase.execute(subscription.id, "user-2");

    expect(result).toEqual({ ok: false, reason: "not_owner" });
    expect(subscriptionRepository.save).not.toHaveBeenCalled();
  });

  it("informa not_found si la suscripción no existe", async () => {
    const subscriptionRepository: SubscriptionRepositoryPort = {
      findActiveByEventId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      findByEventChannelAndTarget: vi.fn(),
      save: vi.fn(),
    };

    const useCase = new UnsubscribeUser(subscriptionRepository);
    const result = await useCase.execute("no-existe", "user-1");

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
