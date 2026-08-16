import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./index.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const database = createDatabase(databaseUrl);
const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle"
);

try {
  await migrate(database, { migrationsFolder });
  console.info("Database migrations completed");
} finally {
  await database.$client.end();
}
