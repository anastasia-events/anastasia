const COLOMBIA_CODE = "57";

/**
 * Forma canónica del celular como identidad: solo dígitos, sin el 57.
 * Así "+57 314 722 9936", "57 3147229936" y "3147229936" son el mismo
 * usuario (en la base ya estaban guardados sin código de país).
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith(COLOMBIA_CODE)) {
    return digits.slice(COLOMBIA_CODE.length);
  }
  return digits;
}

/** ALLOWED_PHONES="3103587691, 3147229936" → Set normalizado. Vacío = sin restricción. */
export function parseAllowedPhones(raw: string | undefined): Set<string> | undefined {
  const phones = (raw ?? "")
    .split(",")
    .map((p) => normalizePhone(p))
    .filter((p) => p.length > 0);
  return phones.length > 0 ? new Set(phones) : undefined;
}
