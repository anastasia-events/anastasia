/**
 * Simula que un evento vigilado cambió de estado y dispara las notificaciones
 * REALES (Telegram / WhatsApp / Email) a quienes estén suscritos en la base
 * local — sin pegarle a Ticketmaster ni a Crowder.
 *
 * Corre el mismo CheckEventAvailability que producción, pero con un provider
 * de mentira que responde el estado pedido. Fuerza el estado previo a
 * OFFSALE para que cuente como cambio, y al terminar deja el estado previo
 * como estaba (o lo borra si no había), para no ensuciar la base.
 *
 * Uso:
 *   npx tsx scripts/simulate-notification.ts
 *     → lista los eventos vigilados con sus suscriptores activos
 *   npx tsx scripts/simulate-notification.ts <eventId> [ONSALE|CANCELLED|RESCHEDULED]
 *     → simula el cambio (por defecto ONSALE)
 *
 * No enciende el polling del bot de Telegram, así que puede correr al mismo
 * tiempo que `npm run dev` (o que producción) sin generar conflictos 409.
 */
import { buildContainer } from "../src/config/container";
import { CheckEventAvailability } from "../src/application/use-cases/CheckEventAvailability";
import { NotifySubscribers } from "../src/application/use-cases/NotifySubscribers";
import { EventProviderPort } from "../src/application/ports/out/EventProviderPort";
import { Event } from "../src/domain/entities/Event";
import { NotificationRecord } from "../src/domain/entities/NotificationRecord";
import { EventStatus } from "../src/domain/value-objects/EventStatus";

const NOTIFYING_STATUSES = [EventStatus.ONSALE, EventStatus.CANCELLED, EventStatus.RESCHEDULED];

async function main() {
  const [eventId, rawStatus = EventStatus.ONSALE] = process.argv.slice(2);
  const container = buildContainer({ telegramPolling: false });
  const { watchedEvents, db, eventStateRepository, notifySubscribers, subscriptionRepository } = container;

  try {
    if (!eventId) {
      console.log("Eventos vigilados (id → suscripciones activas):\n");
      for (const entry of watchedEvents) {
        const subs = await subscriptionRepository.findActiveByEventId(entry.id);
        const channels = subs.map((s) => s.channel).join(", ") || "ninguna";
        console.log(`  ${entry.id}\n    ${entry.name} — ${entry.venue}\n    suscripciones: ${channels}\n`);
      }
      console.log("Uso: npx tsx scripts/simulate-notification.ts <eventId> [ONSALE|CANCELLED|RESCHEDULED]");
      return;
    }

    const entry = watchedEvents.find((e) => e.id === eventId);
    if (!entry) {
      throw new Error(`"${eventId}" no está en watched-events.json. Corré el script sin argumentos para ver los ids.`);
    }
    const status = rawStatus.toUpperCase() as EventStatus;
    if (!NOTIFYING_STATUSES.includes(status)) {
      throw new Error(`Estado inválido "${rawStatus}". Solo ${NOTIFYING_STATUSES.join(" / ")} disparan notificaciones.`);
    }

    const subscriptions = await subscriptionRepository.findActiveByEventId(eventId);
    if (subscriptions.length === 0) {
      console.warn(`[simulate] ${eventId} no tiene suscripciones activas: no se va a mandar nada.`);
      return;
    }

    const fakeProvider: EventProviderPort = {
      async findEventById(id) {
        return new Event({
          id,
          providerId: id,
          name: entry.name,
          venue: entry.venue,
          status,
          onSaleDate: null,
          lastCheckedAt: new Date(),
          lastKnownStatus: EventStatus.OFFSALE,
        });
      },
      async checkStatus() {
        return status;
      },
    };

    const sent: NotificationRecord[] = [];
    // Envuelve al NotifySubscribers real solo para quedarse con los records
    // (CheckEventAvailability no los devuelve) y mostrarlos por canal.
    const capturingNotify = {
      async execute(id: string, event: Event) {
        const records = await notifySubscribers.execute(id, event);
        sent.push(...records);
        return records;
      },
    } as unknown as NotifySubscribers;

    const previousStatus = await eventStateRepository.getLastKnownStatus(eventId);
    await eventStateRepository.saveStatus(eventId, EventStatus.OFFSALE);

    try {
      console.log(`[simulate] ${entry.name}: OFFSALE → ${status}, ${subscriptions.length} suscripción(es)...`);
      await new CheckEventAvailability(fakeProvider, eventStateRepository, capturingNotify).execute(eventId);

      for (const record of sent) {
        const subscription = subscriptions.find((s) => s.id === record.subscriptionId);
        console.log(`  ${record.status.padEnd(6)} ${record.channel.padEnd(8)} → ${subscription?.channelTarget ?? "?"}`);
      }
    } finally {
      if (previousStatus) {
        await eventStateRepository.saveStatus(eventId, previousStatus);
      } else {
        db.prepare("DELETE FROM event_state WHERE event_id = ?").run(eventId);
      }
      console.log(`[simulate] estado de ${eventId} restaurado (${previousStatus ?? "sin estado previo"}).`);
    }
  } finally {
    db.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
