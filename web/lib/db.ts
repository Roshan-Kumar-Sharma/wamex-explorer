import { Pool } from "pg";

// Phase 0: local PostGIS in Docker. See docker-compose.yml.
const globalForPg = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString:
      process.env.WAMEX_DSN ?? "postgresql://wamex:wamex@localhost:54329/wamex",
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pool = pool;
