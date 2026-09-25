import { buildContainer } from "./config/container";
import { env } from "./config/env";

function main(): void {
  const { schedulers, watchedEvents, httpServer } = buildContainer();

  if (watchedEvents.length === 0) {
    console.warn(
      `[main] ${env.watchedEventsFile} no tiene eventos — el scheduler no tiene nada que revisar.`
    );
  }

  schedulers.forEach((scheduler) => scheduler.start());

  const server = httpServer.listen(env.apiPort, () => {
    console.log(`[main] API HTTP escuchando en http://localhost:${env.apiPort}`);
  });

  console.log(
    `[main] event-watcher arrancado. Vigilando ${watchedEvents.length} evento(s) (ver ${env.watchedEventsFile}).`
  );

  const shutdown = () => {
    console.log("[main] apagando...");
    schedulers.forEach((scheduler) => scheduler.stop());
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
