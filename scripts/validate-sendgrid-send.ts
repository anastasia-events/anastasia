/**
 * Validación manual del notifier de email contra la API real de SendGrid,
 * antes de confiar en el adapter — manda un mail de prueba a una dirección
 * dada. Necesita SENDGRID_API_KEY y SENDGRID_FROM_EMAIL (remitente
 * verificado en SendGrid) en .env.
 *
 * Uso: npx tsx scripts/validate-sendgrid-send.ts <email-destino>
 */
import { SendGridEmailNotifier } from "../src/infrastructure/notifiers/sendgrid/SendGridEmailNotifier";
import { Subscription } from "../src/domain/entities/Subscription";
import { Event } from "../src/domain/entities/Event";
import { EventStatus } from "../src/domain/value-objects/EventStatus";
import { NotificationChannel } from "../src/domain/value-objects/NotificationChannel";
import { env } from "../src/config/env";

async function main() {
  const to = process.argv[2];
  if (!to) {
    throw new Error("Uso: npx tsx scripts/validate-sendgrid-send.ts <email-destino>");
  }
  if (!env.sendgrid.apiKey || !env.sendgrid.fromEmail) {
    throw new Error("Faltan SENDGRID_API_KEY / SENDGRID_FROM_EMAIL en .env");
  }

  const notifier = new SendGridEmailNotifier({
    apiKey: env.sendgrid.apiKey,
    fromEmail: env.sendgrid.fromEmail,
  });

  const subscription = Subscription.create({
    userId: "test-user",
    eventId: "ticketmaster:test",
    channel: NotificationChannel.EMAIL,
    channelTarget: to,
  });
  const event = new Event({
    id: "ticketmaster:test",
    providerId: "test",
    name: "Evento de prueba",
    venue: "Recinto de prueba",
    status: EventStatus.ONSALE,
    onSaleDate: null,
    lastCheckedAt: null,
    lastKnownStatus: null,
  });

  const result = await notifier.send(subscription, event);
  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
