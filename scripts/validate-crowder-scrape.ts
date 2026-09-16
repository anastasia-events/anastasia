/**
 * Script de validación manual (no forma parte del adapter todavía): confirma
 * que se puede extraer el estado de cada función de la página Crowder de
 * Ticketmaster.co antes de construir el CrowderPageEventProvider real.
 *
 * Uso: npx tsx scripts/validate-crowder-scrape.ts
 */
import * as cheerio from "cheerio";

const PAGE_URL = "https://www.ticketmaster.co/event/bts-world-tour-2026";

const STATUS_CLASS_MAP: Record<string, string> = {
  "tm-dot-available": "ONSALE",
  "tm-dot-soon": "OFFSALE (próximamente)",
  "tm-dot-soldout": "OFFSALE (agotado)",
  "tm-dot-canceled": "CANCELLED",
};

async function main() {
  const response = await fetch(PAGE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al pedir la página`);
  }

  const html = await response.text();

  if (html.includes("page-captcha") && html.includes("request-captcha-container")) {
    console.warn(
      "[validate] ADVERTENCIA: la página trae los contenedores de captcha. " +
        "No implica que se haya disparado un challenge, pero conviene confirmarlo visualmente si los resultados se ven raros."
    );
  }

  const $ = cheerio.load(html);
  const items = $(".button_item");

  console.log(`[validate] encontrados ${items.length} .button_item en la página`);

  items.each((i, el) => {
    const title = $(el).find(".button_item__title").first().text().trim();
    const description = $(el).find(".button_item__description").first().text().trim();
    const dotClass = $(el)
      .find(".tm-status-dot")
      .first()
      .attr("class")
      ?.split(/\s+/)
      .find((c) => c.startsWith("tm-dot-"));
    const label = $(el).find(".tm-status-badge span").last().text().trim();
    const mappedStatus = dotClass ? STATUS_CLASS_MAP[dotClass] ?? `desconocido (${dotClass})` : "sin clase de estado";

    console.log(
      `[validate] #${i + 1} "${title}" | ${description} | clase=${dotClass ?? "N/A"} | texto="${label}" | -> ${mappedStatus}`
    );
  });

  if (items.length === 0) {
    console.warn(
      "[validate] No se encontró ningún .button_item — el HTML de la página pudo haber cambiado, o llegó una página de captcha/bloqueo en vez del contenido real."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
