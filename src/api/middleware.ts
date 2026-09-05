import { MiddlewareHandler } from "hono";

export function generateAdminToken(password: string): string {
  let hash = 0;
  const str = `deezer-arl-admin-salt-${password}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  let hex = Math.abs(hash).toString(16);
  for (let i = 0; i < str.length; i++) {
    hex += (str.charCodeAt(i) % 16).toString(16);
  }
  return hex;
}

export const adminAuth = (): MiddlewareHandler => {
  return async (c, next) => {
    const adminPassword =
      c.env?.ADMIN_PASSWORD ||
      (typeof process !== "undefined" ? process.env?.ADMIN_PASSWORD : "") ||
      "admin123";
    const expectedToken = generateAdminToken(adminPassword);

    const clientToken =
      c.req.header("x-admin-token") ||
      c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
      c.req.query("admin_token");

    if (!clientToken || clientToken !== expectedToken) {
      return c.json(
        {
          success: false,
          error: "Unauthorized: Admin access required. Please log in with the admin password.",
        },
        401
      );
    }

    await next();
  };
};
