import { buildContainer } from "./config/container";
import { env } from "./config/env";

function main(): void {
  if (env.watchedEventIds.length === 0) {
    console.warn(
      "[main] WATCHED_EVENT_IDS está vacío — el scheduler no tiene nada que revisar."
    );
  }

  const { schedulers } = buildContainer();
  schedulers.forEach((scheduler) => scheduler.start());

  console.log(
    `[main] event-watcher arrancado. Revisando ${env.watchedEventIds.length} evento(s) de Ticketmaster cada ${env.pollingIntervalSeconds}s.`
  );
  if (env.crowder.watchedItemIds.length > 0) {
    console.log(
      `[main] vigilando ${env.crowder.watchedItemIds.length} ítem(s) de Crowder cada ${env.crowder.pollingIntervalSeconds}s` +
        (env.crowder.watchStartAt ? ` desde ${env.crowder.watchStartAt.toISOString()}` : "") +
        (env.crowder.watchEndAt ? ` hasta ${env.crowder.watchEndAt.toISOString()}` : "") +
        "."
    );
  }

  const shutdown = () => {
    console.log("[main] apagando...");
    schedulers.forEach((scheduler) => scheduler.stop());
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
