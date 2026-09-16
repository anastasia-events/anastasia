import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function optionalEnvDate(name: string): Date | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Variable de entorno ${name} no es una fecha ISO válida: "${raw}"`);
  }
  return parsed;
}

export const env = {
  ticketmasterApiKey: requireEnv("TICKETMASTER_API_KEY"),
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  databasePath: process.env.DATABASE_PATH ?? "./data/event-watcher.sqlite",

  watchedEventIds: (process.env.WATCHED_EVENT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0),

  pollingIntervalSeconds: optionalEnvInt("POLLING_INTERVAL_SECONDS", 15),

  // Rate limiting / reintentos contra Ticketmaster Discovery API — ajustable
  // por configuración sin tocar código, ya que el tier/cuota puede cambiar.
  ticketmaster: {
    maxRequestsPerSecond: optionalEnvInt("TICKETMASTER_MAX_REQUESTS_PER_SECOND", 5),
    requestTimeoutMs: optionalEnvInt("TICKETMASTER_REQUEST_TIMEOUT_MS", 8000),
    retryMaxAttempts: optionalEnvInt("TICKETMASTER_RETRY_MAX_ATTEMPTS", 3),
    retryBaseDelayMs: optionalEnvInt("TICKETMASTER_RETRY_BASE_DELAY_MS", 500),
  },

  // Proveedor secundario: eventos de Ticketmaster.co vendidos por Crowder,
  // fuera de la Discovery API. Opt-in — si CROWDER_WATCHED_ITEM_IDS está
  // vacío no se levanta este scheduler.
  crowder: {
    pageUrl: process.env.CROWDER_EVENT_PAGE_URL ?? "",
    watchedItemIds: (process.env.CROWDER_WATCHED_ITEM_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
    pollingIntervalSeconds: optionalEnvInt("CROWDER_POLLING_INTERVAL_SECONDS", 60),
    pageCacheTtlSeconds: optionalEnvInt("CROWDER_PAGE_CACHE_TTL_SECONDS", 60),
    watchStartAt: optionalEnvDate("CROWDER_WATCH_START_AT"),
    watchEndAt: optionalEnvDate("CROWDER_WATCH_END_AT"),
  },
};
