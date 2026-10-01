/**
 * Validación manual del notifier de WhatsApp contra la Cloud API real de
 * Meta, antes de confiar en el adapter — manda un mensaje de plantilla a un
 * número fijo. Necesita WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN y
 * WHATSAPP_TEMPLATE_NAME en .env (la plantilla tiene que estar aprobada en
 * Meta Business Manager, con 3 parámetros de texto en el body — si la
 * plantilla real tiene otra forma, hay que ajustar WhatsAppNotifier).
 *
 * Uso: npx tsx scripts/validate-whatsapp-send.ts <numeroDestino>
 *   numeroDestino: con código de país, sin "+" (ej. 573001234567)
 */
import { WhatsAppNotifier } from "../src/infrastructure/notifiers/whatsapp/WhatsAppNotifier";
import { Subscription } from "../src/domain/entities/Subscription";
import { Event } from "../src/domain/entities/Event";
import { EventStatus } from "../src/domain/value-objects/EventStatus";
import { NotificationChannel } from "../src/domain/value-objects/NotificationChannel";
import { env } from "../src/config/env";

async function main() {
  const to = process.argv[2];
  if (!to) {
    throw new Error("Uso: npx tsx scripts/validate-whatsapp-send.ts <numeroDestino>");
  }
  if (!env.whatsapp.phoneNumberId || !env.whatsapp.accessToken || !env.whatsapp.templateName) {
    throw new Error(
      "Faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN / WHATSAPP_TEMPLATE_NAME en .env"
    );
  }

  const notifier = new WhatsAppNotifier({
    phoneNumberId: env.whatsapp.phoneNumberId,
    accessToken: env.whatsapp.accessToken,
    templateName: env.whatsapp.templateName,
    templateLanguage: env.whatsapp.templateLanguage,
    apiVersion: env.whatsapp.apiVersion,
    defaultCountryCode: env.whatsapp.defaultCountryCode,
  });

  const subscription = Subscription.create({
    userId: "test-user",
    eventId: "ticketmaster:test",
    channel: NotificationChannel.WHATSAPP,
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
