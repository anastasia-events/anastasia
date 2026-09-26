import type { Database } from "better-sqlite3";
import { randomUUID } from "crypto";

export interface Migration {
  version: number;
  description: string;
  run: (db: Database) => void;
}

// Mantenidas en sync con los .sql en ../migrations/ (documentación legible;
// se embeben acá para no depender de copiar assets no-.ts al compilar con
// tsc). Cada una corre una sola vez, dentro de una transacción, trackeada en
// `schema_migrations` — así una DB ya desplegada (con datos reales) se pone
// al día sin repetir pasos ni perder filas existentes.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "esquema inicial: event_state, subscriptions",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS event_state (
          event_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          channel_target TEXT NOT NULL,
          created_at TEXT NOT NULL,
          active INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_subscriptions_event_id ON subscriptions (event_id);
      `);
    },
  },
  {
    version: 2,
    description: "tabla users + backfill de subscriptions.user_id desde channel_target",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          telegram_chat_id TEXT UNIQUE,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
      `);

      // Antes de esta migración, user_id en subscriptions era un string suelto
      // (el chatId de Telegram, o "test-user" desde el script de seed) sin
      // tabla propia. Cada chatId distinto que ya envió notificaciones por
      // Telegram pasa a tener una fila real en `users`, y las suscripciones
      // existentes se re-apuntan a ese id — sin esto se perdería la relación
      // real "qué persona está suscrita a qué" que ya vive en producción.
      const distinctChatIds = db
        .prepare<[], { channel_target: string }>(
          "SELECT DISTINCT channel_target FROM subscriptions WHERE channel = 'TELEGRAM'"
        )
        .all();

      const insertUser = db.prepare(
        `INSERT INTO users (id, telegram_chat_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(telegram_chat_id) DO NOTHING`
      );
      const findUserId = db.prepare<[string], { id: string }>(
        "SELECT id FROM users WHERE telegram_chat_id = ?"
      );
      const relinkSubscriptions = db.prepare(
        "UPDATE subscriptions SET user_id = ? WHERE channel = 'TELEGRAM' AND channel_target = ?"
      );

      for (const { channel_target: chatId } of distinctChatIds) {
        insertUser.run(randomUUID(), chatId, new Date().toISOString());
        const user = findUserId.get(chatId);
        if (user) {
          relinkSubscriptions.run(user.id, chatId);
        }
      }
    },
  },
  {
    version: 3,
    description: "users.phone: el celular pasa a ser la identidad raíz (WhatsApp/Email la necesitan; Telegram se linkea después)",
    run: (db) => {
      db.exec(`
        ALTER TABLE users ADD COLUMN phone TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL;
      `);
      // Sin backfill: los usuarios existentes nacieron por Telegram y quedan
      // con phone = NULL, se siguen gestionando por los comandos del bot
      // hasta que alguien los vincule a un teléfono desde la web.
    },
  },
  {
    version: 4,
    description: "users.email: el email pasa a ser un dato de cuenta (uno por usuario), no por suscripción",
    run: (db) => {
      db.exec(`ALTER TABLE users ADD COLUMN email TEXT;`);

      // Backfill: quien ya tenía suscripciones EMAIL de antes de este cambio
      // adopta la más reciente como su email de cuenta, y se propaga a todas
      // sus suscripciones EMAIL existentes — así queda consistente con la
      // regla de "un solo email por cuenta" desde ya, sin esperar a que
      // alguien edite el email manualmente.
      const usersWithEmailSubs = db
        .prepare<[], { user_id: string }>(
          "SELECT DISTINCT user_id FROM subscriptions WHERE channel = 'EMAIL'"
        )
        .all();

      const latestEmailFor = db.prepare<[string], { channel_target: string }>(
        `SELECT channel_target FROM subscriptions
         WHERE user_id = ? AND channel = 'EMAIL'
         ORDER BY created_at DESC LIMIT 1`
      );
      const setUserEmail = db.prepare("UPDATE users SET email = ? WHERE id = ?");
      const propagateEmail = db.prepare(
        "UPDATE subscriptions SET channel_target = ? WHERE user_id = ? AND channel = 'EMAIL'"
      );

      for (const { user_id: userId } of usersWithEmailSubs) {
        const latest = latestEmailFor.get(userId);
        if (!latest) continue;
        setUserEmail.run(latest.channel_target, userId);
        propagateEmail.run(latest.channel_target, userId);
      }
    },
  },
  {
    version: 5,
    description: "ids de Crowder con slug de página: crowder:<clave> → crowder:<página>/<clave>",
    run: (db) => {
      // Antes el id era solo la clave del ítem ("crowder:venta-general-02-10"),
      // que choca entre páginas de eventos distintos. Hasta este cambio solo
      // se vigiló una página (BTS), así que todo id viejo sin "/" es de ahí.
      const legacyPage = "bts-world-tour-2026";
      for (const table of ["event_state", "subscriptions"]) {
        db.prepare(
          `UPDATE ${table}
           SET event_id = 'crowder:' || ? || '/' || substr(event_id, length('crowder:') + 1)
           WHERE event_id LIKE 'crowder:%' AND instr(event_id, '/') = 0`
        ).run(legacyPage);
      }
    },
  },
];

export function runMigrations(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`
  );

  const applied = new Set(
    db
      .prepare<[], { version: number }>("SELECT version FROM schema_migrations")
      .all()
      .map((row) => row.version)
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    const applyMigration = db.transaction(() => {
      migration.run(db);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString()
      );
    });
    applyMigration();
  }
}
