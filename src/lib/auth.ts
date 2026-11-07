// Configuración central de NextAuth (v4) — estrategia JWT + credenciales.
// El JWT guarda solo datos estables (id, role, clubId). lastTeamId se lee
// SIEMPRE en vivo desde la BD (fuente de verdad) para fricción cero al reentrar.
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? "metodo-dev-secret-cambia-en-produccion",
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  },
  pages: {
    signIn: "/", // la vista de login vive en la raíz (Modo Vestuario)
  },
  providers: [
    CredentialsProvider({
      name: "Cuerpo Técnico",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;
        if (!verifyPassword(credentials.password, user.passwordHash)) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          clubId: user.clubId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        token.clubId = user.clubId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role ?? "ANALYST";
        session.user.clubId = token.clubId ?? null;
      }
      return session;
    },
  },
};
