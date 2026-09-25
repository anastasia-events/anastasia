import { describe, expect, it } from "vitest";
import { Subscription } from "../../src/domain/entities/Subscription";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";

describe("Subscription", () => {
  it("se crea activa y con id generado", () => {
    const subscription = Subscription.create({
      userId: "user-1",
      eventId: "ticketmaster:1",
      channel: NotificationChannel.TELEGRAM,
      channelTarget: "123456",
    });

    expect(subscription.id).toBeTruthy();
    expect(subscription.active).toBe(true);
    expect(subscription.channel).toBe(NotificationChannel.TELEGRAM);
  });

  it("deactivate() devuelve una copia inactiva conservando el resto de los datos", () => {
    const subscription = Subscription.create({
      userId: "user-1",
      eventId: "ticketmaster:1",
      channel: NotificationChannel.TELEGRAM,
      channelTarget: "123456",
    });

    const deactivated = subscription.deactivate();

    expect(deactivated.active).toBe(false);
    expect(deactivated.id).toBe(subscription.id);
    expect(deactivated.userId).toBe(subscription.userId);
    expect(subscription.active).toBe(true);
  });
});
