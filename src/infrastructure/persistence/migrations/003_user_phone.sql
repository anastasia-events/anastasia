ALTER TABLE users ADD COLUMN phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL;

-- El celular pasa a ser la identidad raíz del usuario (antes solo existía
-- telegram_chat_id). Sin backfill: los usuarios ya existentes quedan con
-- phone = NULL hasta que alguien los vincule desde la web.
