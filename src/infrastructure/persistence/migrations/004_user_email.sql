ALTER TABLE users ADD COLUMN email TEXT;

-- El email pasa a ser un dato de la CUENTA (uno por usuario), no por
-- suscripción — antes cada suscripción EMAIL cargaba su propio channel_target
-- suelto. El backfill que adopta el email más reciente por usuario y lo
-- propaga a sus suscripciones EMAIL existentes vive en código
-- (../sqlite/migrations.ts, versión 4), no en SQL puro.
