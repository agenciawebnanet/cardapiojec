import { neon } from '@neondatabase/serverless';

const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connection && process.env.ORDERS_BACKEND_URL) process.exit(0);
if (!connection) throw new Error('Conecte o PostgreSQL ao projeto e configure DATABASE_URL.');

const sql = neon(connection);
await sql.transaction([
  sql`SELECT pg_advisory_xact_lock(1294131)`,
  sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      table_number INTEGER NOT NULL CHECK (table_number BETWEEN 1 AND 10),
      customer TEXT NOT NULL,
      lines TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'novo'
        CHECK (status IN ('novo','preparo','entregue','fechado','cancelado'))
    )
  `,
  sql`CREATE INDEX IF NOT EXISTS orders_status_created ON orders (status, created_at)`
]);
