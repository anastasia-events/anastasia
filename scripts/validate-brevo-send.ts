/**
 * Validación manual del notifier de email contra la API real de Brevo,
 * antes de confiar en el adapter — manda un mail de prueba a una dirección
 * dada. Necesita BREVO_API_KEY y BREVO_SENDER_EMAIL (remitente
 * verificado en Brevo → Senders & IPs) en .env.
 *
 * Uso: npx tsx scripts/validate-brevo-send.ts <email-destino>
 */
import { BrevoEmailNotifier } from "../src/infrastructure/notifiers/brevo/BrevoEmailNotifier";
import { Subscription } from "../src/domain/entities/Subscription";
import { Event } from "../src/domain/entities/Event";
import { EventStatus } from "../src/domain/value-objects/EventStatus";
import { NotificationChannel } from "../src/domain/value-objects/NotificationChannel";
import { env } from "../src/config/env";

async function main() {
  const to = process.argv[2];
  if (!to) {
    throw new Error("Uso: npx tsx scripts/validate-brevo-send.ts <email-destino>");
  }
  if (!env.brevo.apiKey || !env.brevo.senderEmail) {
    throw new Error("Faltan BREVO_API_KEY / BREVO_SENDER_EMAIL en .env");
  }

  const notifier = new BrevoEmailNotifier({
    apiKey: env.brevo.apiKey,
    senderEmail: env.brevo.senderEmail,
    senderName: env.brevo.senderName,
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
