/**
 * Script manual reusable: crea suscripciones de Telegram para los eventos
 * vigilados. Si un evento todavía no tiene fila en `event_state`, fuerza
 * su estado previo a OFFSALE para que el primer tick real dispare una
 * notificación de prueba; si ya tiene estado real (porque ya se venía
 * vigilando), lo deja intacto — así agregar un suscriptor nuevo a un
 * evento existente no le miente al sistema sobre su estado actual.
 *
 * Uso: npx tsx scripts/seed-subscription.ts <chatId> [idsTicketmaster]
 *   idsTicketmaster: opcional, coma-separado. Si no se pasa, usa
 *   WATCHED_EVENT_IDS del .env (útil cuando esa variable está
 *   deshabilitada a propósito pero igual quieres suscribir a alguien
 *   a un evento puntual).
 */
import { buildContainer } from "../src/config/container";
import { env } from "../src/config/env";
import { NotificationChannel } from "../src/domain/value-objects/NotificationChannel";
import { CROWDER_ID_PREFIX } from "../src/infrastructure/event-providers/crowder/CrowderEventProvider";

async function main() {
  const chatId = process.argv[2];
  if (!chatId) {
    throw new Error("Uso: npx tsx scripts/seed-subscription.ts <chatId> [idsTicketmaster]");
  }
  const ticketmasterIds = process.argv[3]
    ? process.argv[3].split(",").map((id) => id.trim()).filter((id) => id.length > 0)
    : env.watchedEventIds;

  const { subscribeUserToEvent, subscribeUserToEventCrowder, db } = buildContainer();

  function alreadySubscribed(eventId: string): boolean {
    const row = db
      .prepare(
        "SELECT 1 FROM subscriptions WHERE event_id = ? AND channel_target = ? AND active = 1"
      )
      .get(eventId, chatId);
    return row !== undefined;
  }

  function hasKnownState(eventId: string): boolean {
    const row = db.prepare("SELECT 1 FROM event_state WHERE event_id = ?").get(eventId);
    return row !== undefined;
  }

  for (const eventId of ticketmasterIds) {
    if (alreadySubscribed(eventId)) {
      console.log(`[seed] ya existía suscripción activa para ${eventId} -> chat ${chatId}, no se duplica`);
      continue;
    }

    const subscription = await subscribeUserToEvent.execute(
      "test-user",
      eventId,
      NotificationChannel.TELEGRAM,
      chatId
    );
    console.log(`[seed] suscripción creada: ${subscription.id} -> evento ${eventId} -> chat ${chatId}`);

    if (hasKnownState(eventId)) {
      console.log(`[seed] ${eventId} ya tenía estado real registrado, no se toca`);
    } else {
      db.prepare(
        `INSERT INTO event_state (event_id, status, updated_at)
         VALUES (?, 'OFFSALE', ?)
         ON CONFLICT(event_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
      ).run(eventId, new Date().toISOString());
      console.log(`[seed] estado previo forzado a OFFSALE para ${eventId} (para provocar el cambio en el próximo tick)`);
    }
  }

  if (env.crowder.watchedItemIds.length > 0) {
    if (!subscribeUserToEventCrowder) {
      throw new Error("CROWDER_WATCHED_ITEM_IDS está seteado pero el provider de Crowder no se levantó");
    }
    for (const itemId of env.crowder.watchedItemIds) {
      const eventId = `${CROWDER_ID_PREFIX}${itemId}`;

      if (alreadySubscribed(eventId)) {
        console.log(`[seed] ya existía suscripción activa para ${eventId} -> chat ${chatId}, no se duplica`);
        continue;
      }

      const subscription = await subscribeUserToEventCrowder.execute(
        "test-user",
        eventId,
        NotificationChannel.TELEGRAM,
        chatId
      );
      console.log(`[seed] suscripción Crowder creada: ${subscription.id} -> ${eventId} -> chat ${chatId}`);
      // Sin hack de estado acá: el estado real ya es "agotado" y la ventana
      // activa (CROWDER_WATCH_START_AT) todavía no abre, así que el primer
      // tick real establecerá la línea base sin disparar una notificación falsa.
    }
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
