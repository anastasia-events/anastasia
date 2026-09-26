/**
 * Script manual reusable: crea suscripciones de Telegram para los eventos
 * vigilados en watched-events.json. Si un evento todavía no tiene fila en
 * `event_state`, fuerza su estado previo a OFFSALE para que el primer tick
 * real dispare una notificación de prueba; si ya tiene estado real (porque
 * ya se venía vigilando), lo deja intacto — así agregar un suscriptor nuevo
 * a un evento existente no le miente al sistema sobre su estado actual.
 *
 * Uso: npx tsx scripts/seed-subscription.ts <chatId> [eventIds]
 *   eventIds: opcional, coma-separado (usar el `id` tal como aparece en
 *   watched-events.json, ej. "crowder:bts-world-tour-2026/venta-general-02-10" para Crowder —
 *   `npx tsx scripts/simulate-notification.ts` sin argumentos los lista).
 *   Si no se pasa, suscribe a TODOS los eventos de watched-events.json.
 */
import { randomUUID } from "crypto";
import { buildContainer } from "../src/config/container";
import { User } from "../src/domain/entities/User";
import { NotificationChannel } from "../src/domain/value-objects/NotificationChannel";

async function main() {
  const chatId = process.argv[2];
  if (!chatId) {
    throw new Error("Uso: npx tsx scripts/seed-subscription.ts <chatId> [eventIds]");
  }
  const requestedIds = process.argv[3]
    ? process.argv[3].split(",").map((id) => id.trim()).filter((id) => id.length > 0)
    : null;

  const { watchedEvents, db, userRepository } = buildContainer({ telegramPolling: false });

  // El usuario "nace" por teléfono en el flujo real (ver FindOrCreateUserByPhone),
  // pero este script solo tiene un chatId de prueba a mano — arma un usuario
  // sin teléfono, linkeado directo al chat, igual que quedan los usuarios
  // legacy migrados en la versión 2 del esquema.
  let user = await userRepository.findByTelegramChatId(chatId);
  if (!user) {
    user = new User({ id: randomUUID(), phone: null, telegramChatId: chatId, createdAt: new Date() });
    await userRepository.save(user);
  }

  const targets = requestedIds
    ? watchedEvents.filter((entry) => requestedIds.includes(entry.id))
    : watchedEvents;

  if (requestedIds) {
    const missing = requestedIds.filter((id) => !watchedEvents.some((entry) => entry.id === id));
    for (const id of missing) {
      console.warn(`[seed] ${id} no está en watched-events.json, se ignora`);
    }
  }

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

  for (const entry of targets) {
    if (alreadySubscribed(entry.id)) {
      console.log(`[seed] ya existía suscripción activa para ${entry.id} -> chat ${chatId}, no se duplica`);
      continue;
    }

    const subscription = await entry.subscribe.execute(
      user.id,
      entry.id,
      NotificationChannel.TELEGRAM,
      chatId
    );
    console.log(`[seed] suscripción creada: ${subscription.id} -> evento ${entry.id} -> chat ${chatId}`);

    if (hasKnownState(entry.id)) {
      console.log(`[seed] ${entry.id} ya tenía estado real registrado, no se toca`);
    } else {
      db.prepare(
        `INSERT INTO event_state (event_id, status, updated_at)
         VALUES (?, 'OFFSALE', ?)
         ON CONFLICT(event_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
      ).run(entry.id, new Date().toISOString());
      console.log(`[seed] estado previo forzado a OFFSALE para ${entry.id} (para provocar el cambio en el próximo tick)`);
    }
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
