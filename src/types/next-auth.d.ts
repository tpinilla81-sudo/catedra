// Augmentación de tipos NextAuth: sesión JWT con rol y club del tenant.
import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      clubId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    clubId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    clubId?: string | null;
  }
}
