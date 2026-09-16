/**
 * Script manual de un solo uso para el paso 8 del plan (prueba end-to-end):
 * crea una suscripción de Telegram para el evento vigilado y fuerza un
 * estado previo distinto en SQLite, así el primer tick real del scheduler
 * ve un "cambio" y dispara la notificación sin esperar a que Ticketmaster
 * cambie de estado por su cuenta.
 *
 * Uso: npx tsx scripts/seed-subscription.ts <chatId>
 */
import { buildContainer } from "../src/config/container";
import { env } from "../src/config/env";
import { NotificationChannel } from "../src/domain/value-objects/NotificationChannel";
import { CROWDER_ID_PREFIX } from "../src/infrastructure/event-providers/crowder/CrowderEventProvider";

async function main() {
  const chatId = process.argv[2];
  if (!chatId) {
    throw new Error("Uso: npx tsx scripts/seed-subscription.ts <chatId>");
  }

  const { subscribeUserToEvent, subscribeUserToEventCrowder, db } = buildContainer();

  function alreadySubscribed(eventId: string): boolean {
    const row = db
      .prepare(
        "SELECT 1 FROM subscriptions WHERE event_id = ? AND channel_target = ? AND active = 1"
      )
      .get(eventId, chatId);
    return row !== undefined;
  }

  for (const eventId of env.watchedEventIds) {
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

    db.prepare(
      `INSERT INTO event_state (event_id, status, updated_at)
       VALUES (?, 'OFFSALE', ?)
       ON CONFLICT(event_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    ).run(eventId, new Date().toISOString());
    console.log(`[seed] estado previo forzado a OFFSALE para ${eventId} (para provocar el cambio en el próximo tick)`);
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
