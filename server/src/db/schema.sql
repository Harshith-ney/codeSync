CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username    VARCHAR(50) UNIQUE NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language    VARCHAR(50) DEFAULT 'javascript',
  access_mode VARCHAR(20) DEFAULT 'public' CHECK (access_mode IN ('public', 'invite')),
  default_role VARCHAR(20) DEFAULT 'editor' CHECK (default_role IN ('editor', 'viewer')),
  invite_token UUID UNIQUE DEFAULT uuid_generate_v4(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS access_mode VARCHAR(20) DEFAULT 'public';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS default_role VARCHAR(20) DEFAULT 'editor';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS invite_token UUID UNIQUE DEFAULT uuid_generate_v4();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE rooms SET access_mode = COALESCE(access_mode, 'public');
UPDATE rooms SET default_role = COALESCE(default_role, 'editor');
UPDATE rooms SET invite_token = COALESCE(invite_token, uuid_generate_v4());

CREATE TABLE IF NOT EXISTS documents (
  room_id     UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  content     TEXT DEFAULT '',
  revision    INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_notes (
  room_id     UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  content     TEXT DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS document_operations (
  id         BIGSERIAL PRIMARY KEY,
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL CHECK (type IN ('insert', 'delete')),
  position   INTEGER NOT NULL,
  content    TEXT,
  length     INTEGER,
  revision   INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_operations_room_revision_idx
  ON document_operations (room_id, revision);
