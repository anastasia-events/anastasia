-- v5: ids de Crowder con slug de página (crowder:<clave> -> crowder:<página>/<clave>).
-- Hasta este cambio solo se vigilaba la página de BTS, así que todo id viejo sin "/" es de ahí.
UPDATE event_state
SET event_id = 'crowder:bts-world-tour-2026/' || substr(event_id, length('crowder:') + 1)
WHERE event_id LIKE 'crowder:%' AND instr(event_id, '/') = 0;

UPDATE subscriptions
SET event_id = 'crowder:bts-world-tour-2026/' || substr(event_id, length('crowder:') + 1)
WHERE event_id LIKE 'crowder:%' AND instr(event_id, '/') = 0;
