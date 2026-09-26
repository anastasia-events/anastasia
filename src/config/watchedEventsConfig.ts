import { readFileSync } from "fs";

export interface WatchedTicketmasterConfigEntry {
  id: string;
  name: string;
  venue: string;
  activeFrom?: string;
  activeUntil?: string;
}

export interface WatchedCrowderConfigEntry {
  id: string;
  pageUrl: string;
  name: string;
  venue: string;
  activeFrom?: string;
  activeUntil?: string;
}

export interface WatchedEventsConfig {
  ticketmaster: WatchedTicketmasterConfigEntry[];
  crowder: WatchedCrowderConfigEntry[];
}

/**
 * La lista de eventos observables vive en JSON (no en .env) para poder
 * llevar varios eventos con su info de display sin amontonar variables de
 * entorno separadas por coma.
 */
export function loadWatchedEventsConfig(filePath: string): WatchedEventsConfig {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `No se pudo leer el archivo de eventos vigilados (${filePath}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const parsed = JSON.parse(raw);
  const config: WatchedEventsConfig = {
    ticketmaster: parsed.ticketmaster ?? [],
    crowder: parsed.crowder ?? [],
  };
  validate(config, filePath);
  return config;
}

// Falla al arrancar con un mensaje claro en vez de vigilar en silencio un
// ítem mal cargado (ej. al agregar un evento nuevo a mano).
function validate(config: WatchedEventsConfig, filePath: string): void {
  const errors: string[] = [];

  config.ticketmaster.forEach((item, i) => {
    for (const field of ["id", "name", "venue"] as const) {
      if (!item[field]) errors.push(`ticketmaster[${i}] sin "${field}"`);
    }
  });

  const seenCrowder = new Set<string>();
  config.crowder.forEach((item, i) => {
    for (const field of ["id", "pageUrl", "name", "venue"] as const) {
      if (!item[field]) errors.push(`crowder[${i}] sin "${field}"`);
    }
    const key = `${item.pageUrl}#${item.id}`;
    if (seenCrowder.has(key)) errors.push(`crowder[${i}] repite id "${item.id}" en la misma página`);
    seenCrowder.add(key);
  });

  if (errors.length > 0) {
    throw new Error(`${filePath} tiene errores:\n  - ${errors.join("\n  - ")}`);
  }
}

export function parseOptionalDate(value: string | undefined, context: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida en ${context}: "${value}"`);
  }
  return date;
}
