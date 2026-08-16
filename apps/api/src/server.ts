import * as schema from "./db/schema.js";
import { createDatabase } from "./db/index.js";
import { buildApp } from "./app.js";
import { bootstrapProductionDatabase, migrateLegacyMemberAuthorizations, migrateProductionDatabase } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { createRepository } from "./postgres-repository.js";

try {
  const config = loadConfig();
  const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
  if (config.isProduction && database) {
    await migrateProductionDatabase(database);
    await bootstrapProductionDatabase(config, database);
    await migrateLegacyMemberAuthorizations(database);
  }
  const repository = database ? createRepository(database) : undefined;
  const app = await buildApp(config, { repository, database, databaseSchema: schema });
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port, repository: repository?.mode ?? "memory" }, "USM ERP API listening");
} catch (error) {
  console.error("Failed to start USM ERP API", error);
  process.exitCode = 1;
}
