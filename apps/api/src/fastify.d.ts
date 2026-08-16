import type { AuthorizationSnapshot, Role } from "@usm/contracts";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: {
      user: { id: string; name: string; email: string };
      tenant: { id: string; name: string; slug: string };
      role: Role;
      organizationType: "hq" | "dealer";
      authorizationTenantId: string;
      authorization: AuthorizationSnapshot;
    };
  }
}
