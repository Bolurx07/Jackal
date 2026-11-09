import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
}

// prepare: false keeps this compatible with Supabase/Neon connection poolers.
const client = postgres(url, { prepare: false, max: 5 });

export const db = drizzle(client, { schema });
export const closeDb = () => client.end();
