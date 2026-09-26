/**
 * Para agregar un evento nuevo de Crowder a config/watched-events.json: pide
 * la página UNA vez (misma lógica de parseo y de claves que el provider real)
 * y muestra cada ítem con su estado actual, más un bloque JSON listo para
 * pegar en "crowder" — solo falta ajustar name/venue/activeFrom/activeUntil.
 *
 * Uso: npx tsx scripts/list-crowder-items.ts <url-de-la-página>
 *   ej. npx tsx scripts/list-crowder-items.ts https://www.ticketmaster.co/event/bts-world-tour-2026
 */
import { CrowderPageClient } from "../src/infrastructure/event-providers/crowder/CrowderPageClient";
import { crowderPageSlug } from "../src/infrastructure/event-providers/crowder/CrowderEventProvider";

async function main() {
  const pageUrl = process.argv[2];
  if (!pageUrl) {
    throw new Error("Uso: npx tsx scripts/list-crowder-items.ts <url-de-la-página>");
  }

  const slug = crowderPageSlug(pageUrl);
  const items = await new CrowderPageClient({ pageUrl, cacheTtlMs: 0 }).getItems();

  if (items.length === 0) {
    console.warn(
      "No se encontró ningún ítem con estado. Puede que la página no use la plantilla de Crowder (.button_item / .tm-status-dot) o que haya llegado un captcha."
    );
    return;
  }

  console.log(`Página "${slug}": ${items.length} ítem(s)\n`);
  for (const item of items) {
    console.log(`  ${item.key.padEnd(40)} ${item.statusCode.padEnd(9)} ${item.title} | ${item.description}`);
  }

  const snippet = items.map((item) => ({
    id: item.key,
    pageUrl,
    name: item.title,
    venue: item.description,
    activeFrom: "AAAA-MM-DDT00:00:00-05:00",
    activeUntil: "AAAA-MM-DDT23:59:00-05:00",
  }));
  console.log("\nPara pegar en \"crowder\" de config/watched-events.json (ajustar name/venue/fechas):\n");
  console.log(JSON.stringify(snippet, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
