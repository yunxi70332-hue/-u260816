import fs from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import proxy from "@fastify/http-proxy";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";
import { createAuthService } from "./auth.js";
import type { AuthService } from "./auth.js";
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import { MemoryRepository } from "./memory-repository.js";
import type { Repository } from "./repository.js";
import { registerApiRoutes } from "./routes.js";

export interface AppOverrides {
  repository?: Repository;
  auth?: AuthService;
  database?: unknown;
  databaseSchema?: Record<string, unknown>;
}

export async function buildApp(config: AppConfig, overrides: AppOverrides = {}) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? (config.isProduction ? "info" : "debug") },
    // The API is served behind a reverse proxy (BT panel nginx) in production;
    // trusting it lets request.ip resolve the real client IP from X-Forwarded-For.
    trustProxy: true,
    genReqId(request) {
      const requestId = request.headers["x-request-id"];
      return typeof requestId === "string" && requestId.length <= 128 ? requestId : crypto.randomUUID();
    }
  });
  const repository = overrides.repository ?? new MemoryRepository();
  const auth = overrides.auth ?? createAuthService(config, overrides.database, overrides.databaseSchema);

  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed"), false);
    },
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "If-Match", "X-Tenant-Id", "X-Request-Id"],
    exposedHeaders: ["ETag", "Idempotency-Replayed", "X-Request-Id"]
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Request-Id", request.id);
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details, requestId: request.id }
      });
    }
    if (error instanceof ZodError) {
      return reply.code(422).send({
        error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues, requestId: request.id }
      });
    }
    const genericError = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof genericError.statusCode === "number" && genericError.statusCode < 500 ? genericError.statusCode : 500;
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 404 ? "NOT_FOUND" : statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR",
        message: statusCode < 500 && typeof genericError.message === "string" ? genericError.message : "Internal server error",
        requestId: request.id
      }
    });
  });

  await registerApiRoutes(app, { repository, auth });

  if (config.erpDevServerUrl) {
    await app.register(proxy, {
      upstream: config.erpDevServerUrl,
      prefix: "/",
      httpMethods: ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"],
      websocket: true,
      rewritePrefix: "/"
    });
  } else if (fs.existsSync(path.join(config.erpStaticDir, "index.html"))) {
    await app.register(fastifyStatic, { root: config.erpStaticDir, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      const requestPath = request.url.split("?", 1)[0];
      const isApiPath = requestPath === "/api" || requestPath.startsWith("/api/");
      if (request.method === "GET" && !isApiPath) return reply.sendFile("index.html");
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found", requestId: request.id } });
    });
  } else {
    app.get("/", async () => ({ service: "USM ERP API", api: "/api/health" }));
  }

  app.addHook("onClose", () => repository.close());
  return app;
}
