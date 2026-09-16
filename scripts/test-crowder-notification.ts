/**
 * Prueba end-to-end del proveedor Crowder sin tocar Ticketmaster ni .env:
 * sirve un fixture local que simula el ítem "Venta General 02/10" pasando
 * a disponible, fuerza el estado previo a OFFSALE (para que se vea como un
 * cambio real), y corre el mismo CheckEventAvailability que usa producción
 * — con el NotifySubscribers y el bot de Telegram reales — apuntando al
 * fixture en vez de a la página real (que hoy está agotada de verdad).
 *
 * Al terminar, deja el estado del ítem de vuelta en OFFSALE (la verdad
 * actual), así producción no queda con un estado falso.
 *
 * Uso: npx tsx scripts/test-crowder-notification.ts
 */
import { createServer } from "http";
import { readFileSync } from "fs";
import { join } from "path";
import { buildContainer } from "../src/config/container";
import { CheckEventAvailability } from "../src/application/use-cases/CheckEventAvailability";
import { CrowderEventProvider, CROWDER_ID_PREFIX } from "../src/infrastructure/event-providers/crowder/CrowderEventProvider";
import { CrowderPageClient } from "../src/infrastructure/event-providers/crowder/CrowderPageClient";
import { EventStatus } from "../src/domain/value-objects/EventStatus";

const PORT = 4321;
const TARGET_ITEM_ID = `${CROWDER_ID_PREFIX}venta-general-02-10`;

async function main() {
  const fixtureHtml = readFileSync(
    join(__dirname, "fixtures", "crowder-onsale-fixture.html"),
    "utf8"
  );

  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fixtureHtml);
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`[test] fixture servido en http://localhost:${PORT}/`);

  const { db, eventStateRepository, notifySubscribers } = buildContainer();

  try {
    await eventStateRepository.saveStatus(TARGET_ITEM_ID, EventStatus.OFFSALE);
    console.log(`[test] estado previo forzado a OFFSALE para ${TARGET_ITEM_ID}`);

    const fixtureProvider = new CrowderEventProvider(
      new CrowderPageClient({ pageUrl: `http://localhost:${PORT}/`, cacheTtlMs: 0 })
    );
    const checkFixtureAvailability = new CheckEventAvailability(
      fixtureProvider,
      eventStateRepository,
      notifySubscribers
    );

    const result = await checkFixtureAvailability.execute(TARGET_ITEM_ID);
    console.log(`[test] resultado: changed=${result.changed}, newStatus=${result.newStatus}`);

    if (result.changed && result.newStatus === EventStatus.ONSALE) {
      console.log("[test] debería haber llegado un mensaje de Telegram al/a los suscriptor(es) de este ítem.");
    } else {
      console.warn("[test] no se detectó el cambio esperado — revisar el fixture o el estado previo.");
    }
  } finally {
    await eventStateRepository.saveStatus(TARGET_ITEM_ID, EventStatus.OFFSALE);
    console.log(`[test] estado devuelto a OFFSALE para ${TARGET_ITEM_ID} (la realidad actual)`);
    db.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
