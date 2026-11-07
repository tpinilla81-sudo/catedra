// Middleware de protección de rutas: cualquier página bajo /dashboard requiere
// sesión JWT válida. Si no la hay → redirige a la raíz (login Modo Vestuario).
// El `secret` espeja el fallback de src/lib/auth.ts: sin NEXTAUTH_SECRET en el
// entorno, withAuth NO puede verificar el JWT y trata toda sesión como
// inválida (NO_SECRET → /dashboard entero redirige al login). Con el fallback,
// el arranque local nunca se rompe por falta de la variable.
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/" },
  secret: process.env.NEXTAUTH_SECRET ?? "metodo-dev-secret-cambia-en-produccion",
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
