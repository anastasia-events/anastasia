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
});
