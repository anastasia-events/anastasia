/**
 * Validación manual del adapter completo (no forma parte del container
 * todavía en este chequeo): confirma que las claves puestas en
 * CROWDER_WATCHED_ITEM_IDS resuelven contra CrowderEventProvider real.
 *
 * Uso: npx tsx scripts/validate-crowder-provider.ts
 */
import { CrowderPageClient } from "../src/infrastructure/event-providers/crowder/CrowderPageClient";
import { CrowderEventProvider } from "../src/infrastructure/event-providers/crowder/CrowderEventProvider";

async function main() {
  const client = new CrowderPageClient({
    pageUrl: "https://www.ticketmaster.co/event/bts-world-tour-2026",
    cacheTtlMs: 60000,
  });
  const provider = new CrowderEventProvider(client);

  const ids = [
    "preventa-army-membership-02-10",
    "venta-general-02-10",
    "preventa-army-membership-03-10",
    "venta-general-03-10",
  ];

  for (const id of ids) {
    const event = await provider.findEventById(id);
    console.log(id, "->", event.status, "|", event.name, "|", event.venue);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
