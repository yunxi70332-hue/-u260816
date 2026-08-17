import path from "node:path";

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  throw new Error(`${name} must be true, false, 1, or 0`);
}

export interface AppConfig {
  host: string;
  port: number;
  isProduction: boolean;
  databaseUrl?: string;
  betterAuthSecret?: string;
  betterAuthUrl: string;
  corsOrigins: string[];
  sessionCookieSecure: boolean;
  bootstrapAdminEmail?: string;
  bootstrapAdminPassword?: string;
  bootstrapAdminName: string;
  bootstrapAdminUsername?: string;
  bootstrapOrganizationName: string;
  bootstrapOrganizationSlug: string;
  devAuthAutoLogin: boolean;
  devAuthEmail: string;
  devAuthPassword: string;
  erpStaticDir: string;
  erpDevServerUrl?: string;
  priceBook: Record<string, number>;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function parseOrigins(value: string): string[] {
  const origins = [...new Set(value.split(",").map((origin) => origin.trim()).filter(Boolean))];
  for (const origin of origins) {
    const url = new URL(origin);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== origin) {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }
  return origins;
}

function parsePriceBook(): Record<string, number> {
  try {
    const parsed = JSON.parse(process.env.PRICE_BOOK_JSON ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] >= 0)
        .map(([key, value]) => [key.trim(), Math.round(value)])
    );
  } catch {
    throw new Error("PRICE_BOOK_JSON must be a JSON object of non-negative minor-unit prices");
  }
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 9012);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  const isProduction = process.env.NODE_ENV === "production";
  const databaseUrl = optionalEnv("DATABASE_URL");
  const betterAuthSecret = optionalEnv("BETTER_AUTH_SECRET");
  const betterAuthUrl = optionalEnv("BETTER_AUTH_URL") ?? `http://127.0.0.1:${port}`;
  const configuredOrigins = optionalEnv("CORS_ORIGINS");
  if (isProduction && !databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }
  if (databaseUrl && !betterAuthSecret) {
    throw new Error("BETTER_AUTH_SECRET is required when DATABASE_URL is configured");
  }
  if (betterAuthSecret && betterAuthSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (isProduction && !optionalEnv("BETTER_AUTH_URL")) {
    throw new Error("BETTER_AUTH_URL is required in production");
  }
  if (isProduction && !configuredOrigins) {
    throw new Error("CORS_ORIGINS is required in production");
  }

  const bootstrapAdminEmail = optionalEnv("BOOTSTRAP_ADMIN_EMAIL")?.toLowerCase();
  const bootstrapAdminPassword = optionalEnv("BOOTSTRAP_ADMIN_PASSWORD");
  if (Boolean(bootstrapAdminEmail) !== Boolean(bootstrapAdminPassword)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be configured together");
  }
  // Keep old deployed bootstrap secrets bootable. Newly created and reset account
  // passwords are enforced by Better Auth and the API contracts at 6-12 characters.
  if (bootstrapAdminPassword && (bootstrapAdminPassword.length < 6 || bootstrapAdminPassword.length > 128)) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain 6 to 128 characters");
  }

  const localDevelopmentOrigins = [
    "http://127.0.0.1:9011",
    "http://localhost:9011",
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`
  ];
  const corsOrigins = parseOrigins(
    isProduction
      ? configuredOrigins!
      : [...(configuredOrigins?.split(",") ?? []), ...localDevelopmentOrigins].join(",")
  );
  const authOrigin = new URL(betterAuthUrl).origin;
  if (isProduction && !corsOrigins.includes(authOrigin)) {
    throw new Error("CORS_ORIGINS must include the BETTER_AUTH_URL origin in production");
  }

  return {
    host: process.env.HOST ?? "127.0.0.1",
    port,
    isProduction,
    databaseUrl,
    betterAuthSecret,
    betterAuthUrl,
    corsOrigins,
    sessionCookieSecure: booleanEnv("SESSION_COOKIE_SECURE", isProduction),
    bootstrapAdminEmail,
    bootstrapAdminPassword,
    bootstrapAdminName: optionalEnv("BOOTSTRAP_ADMIN_NAME") ?? "System Administrator",
    bootstrapAdminUsername: optionalEnv("BOOTSTRAP_ADMIN_USERNAME"),
    bootstrapOrganizationName: optionalEnv("BOOTSTRAP_ORGANIZATION_NAME") ?? "Headquarters",
    bootstrapOrganizationSlug: optionalEnv("BOOTSTRAP_ORGANIZATION_SLUG") ?? "headquarters",
    devAuthAutoLogin: booleanEnv("DEV_AUTH_AUTO_LOGIN", true),
    devAuthEmail: process.env.DEV_AUTH_EMAIL ?? "admin@local.usm",
    devAuthPassword: process.env.DEV_AUTH_PASSWORD ?? "usm-local-dev",
    erpStaticDir: path.resolve(process.cwd(), process.env.ERP_STATIC_DIR ?? "../erp/dist"),
    erpDevServerUrl: process.env.ERP_DEV_SERVER_URL?.trim() || undefined,
    priceBook: parsePriceBook()
  };
}
