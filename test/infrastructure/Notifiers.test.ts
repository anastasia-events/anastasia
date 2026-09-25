import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsAppNotifier } from "../../src/infrastructure/notifiers/whatsapp/WhatsAppNotifier";
import { SendGridEmailNotifier } from "../../src/infrastructure/notifiers/sendgrid/SendGridEmailNotifier";
import { Subscription } from "../../src/domain/entities/Subscription";
import { Event } from "../../src/domain/entities/Event";
import { EventStatus } from "../../src/domain/value-objects/EventStatus";
import { NotificationChannel } from "../../src/domain/value-objects/NotificationChannel";
import { NotificationStatus } from "../../src/domain/value-objects/NotificationStatus";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WhatsAppNotifier", () => {
  const subscription = Subscription.create({
    userId: "user-1",
    eventId: "ticketmaster:1",
    channel: NotificationChannel.WHATSAPP,
    channelTarget: "573147224936",
  });

  it("manda un mensaje de plantilla y devuelve SENT si la API responde ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: vi.fn() });
    vi.stubGlobal("fetch", fetchMock);

    const notifier = new WhatsAppNotifier({
      phoneNumberId: "123",
      accessToken: "token",
      templateName: "evento_disponible",
      apiVersion: "v20.0",
    });

    const result = await notifier.send(subscription, fakeEvent);

    expect(result.status).toBe(NotificationStatus.SENT);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v20.0/123/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.name).toBe("evento_disponible");
    expect(body.to).toBe("573147224936");
  });

  it("devuelve FAILED si la API responde con error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: vi.fn().mockResolvedValue("bad request") })
    );

    const notifier = new WhatsAppNotifier({
      phoneNumberId: "123",
      accessToken: "token",
      templateName: "evento_disponible",
      apiVersion: "v20.0",
    });

    const result = await notifier.send(subscription, fakeEvent);

    expect(result.status).toBe(NotificationStatus.FAILED);
    expect(result.errorMessage).toContain("400");
  });
});

describe("SendGridEmailNotifier", () => {
  const subscription = Subscription.create({
    userId: "user-1",
    eventId: "ticketmaster:1",
    channel: NotificationChannel.EMAIL,
    channelTarget: "destino@ejemplo.com",
  });

  it("manda un mail y devuelve SENT si la API responde ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: vi.fn() });
    vi.stubGlobal("fetch", fetchMock);

    const notifier = new SendGridEmailNotifier({
      apiKey: "key",
      fromEmail: "remitente@ejemplo.com",
    });

    const result = await notifier.send(subscription, fakeEvent);

    expect(result.status).toBe(NotificationStatus.SENT);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.personalizations[0].to[0].email).toBe("destino@ejemplo.com");
    expect(body.from.email).toBe("remitente@ejemplo.com");
  });

  it("devuelve FAILED si la API responde con error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: vi.fn().mockResolvedValue("forbidden") })
    );

    const notifier = new SendGridEmailNotifier({ apiKey: "key", fromEmail: "remitente@ejemplo.com" });
    const result = await notifier.send(subscription, fakeEvent);

    expect(result.status).toBe(NotificationStatus.FAILED);
    expect(result.errorMessage).toContain("403");
  });
});
