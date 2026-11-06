// Middleware de protección de rutas: cualquier página bajo /dashboard requiere
// sesión JWT válida. Si no la hay → redirige a la raíz (login Modo Vestuario).
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/" },
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
