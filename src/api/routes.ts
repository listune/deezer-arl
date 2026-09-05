import { Hono } from "hono";
import { AccountPoolService } from "../core/AccountPoolService.js";
import { DatabaseAdapter } from "../db/DatabaseAdapter.js";
import { CreateAccountInput } from "../types/index.js";
import { adminAuth, generateAdminToken } from "./middleware.js";

export function createApiRouter(db: DatabaseAdapter) {
  const router = new Hono<{ Bindings: any }>();
  const pool = new AccountPoolService(db);

  router.get("/arl", async (c) => {
    const rotate = c.req.query("rotate") === "true";
    const result = await pool.getActiveArl(rotate);

    if (!result) {
      return c.json(
        {
          success: false,
          error: "No active or valid Deezer ARL accounts found in the pool",
          data: null,
        },
        503
      );
    }

    if (c.req.query("format") === "text") {
      return c.text(result.arl);
    }

    return c.json({
      success: true,
      data: {
        arl: result.arl,
        account: {
          id: result.account.id,
          label: result.account.label,
          userName: result.account.user_name,
          tier: result.account.tier,
          country: result.account.country,
        },
      },
    });
  });

  router.get("/arl/raw", async (c) => {
    const rotate = c.req.query("rotate") === "true";
    const result = await pool.getActiveArl(rotate);

    if (!result) {
      return c.text("ERROR: No active Deezer ARL accounts found in pool", 503);
    }

    return c.text(result.arl);
  });

  router.get("/stats", async (c) => {
    const stats = await pool.getStats();
    return c.json({
      success: true,
      data: stats,
    });
  });

  router.get("/health", (c) => {
    return c.json({
      success: true,
      status: "healthy",
      timestamp: Date.now(),
      uptime: process.uptime ? Math.floor(process.uptime()) : null,
    });
  });

  router.post("/admin/login", async (c) => {
    try {
      const body = await c.req.json();
      const password = body?.password || "";
      const expectedPassword = c.env?.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin123";

      if (password !== expectedPassword) {
        return c.json(
          {
            success: false,
            error: "Invalid admin password",
          },
          401
        );
      }

      const token = generateAdminToken(expectedPassword);
      return c.json({
        success: true,
        message: "Admin authenticated successfully",
        token,
      });
    } catch {
      return c.json({ success: false, error: "Invalid login payload" }, 400);
    }
  });

  const adminRouter = new Hono<{ Bindings: any }>();
  adminRouter.use("*", adminAuth());

  adminRouter.get("/verify", (c) => {
    return c.json({ success: true, message: "Admin token is valid" });
  });

  adminRouter.get("/accounts", async (c) => {
    const accounts = await db.getAllAccounts();
    return c.json({
      success: true,
      data: accounts,
    });
  });

  adminRouter.post("/accounts", async (c) => {
    try {
      const body = (await c.req.json()) as CreateAccountInput;
      if (!body.email || !body.password) {
        return c.json(
          {
            success: false,
            error: "Email and password are required fields",
          },
          400
        );
      }

      const account = await pool.addAccount(body);
      return c.json(
        {
          success: true,
          message:
            account.status === "ACTIVE"
              ? "Account added and ARL extracted successfully!"
              : `Account added with status: ${account.status}`,
          data: account,
        },
        201
      );
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || "Failed to add account",
        },
        400
      );
    }
  });

  adminRouter.post("/accounts/:id/refresh", async (c) => {
    const id = c.req.param("id");
    try {
      const updated = await pool.refreshAccount(id);
      return c.json({
        success: updated.status === "ACTIVE",
        message:
          updated.status === "ACTIVE"
            ? "ARL token refreshed successfully!"
            : `Refresh completed with status: ${updated.status}`,
        data: updated,
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || "Failed to refresh account",
        },
        400
      );
    }
  });

  adminRouter.post("/accounts/refresh-all", async (c) => {
    const result = await pool.checkAllAccounts();
    return c.json({
      success: true,
      message: `Health check complete. Checked: ${result.checked}, Refreshed: ${result.refreshed}, Failed: ${result.failed}`,
      data: result,
    });
  });

  adminRouter.put("/accounts/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json();
      if (!body.arl) {
        return c.json({ success: false, error: "ARL token is required" }, 400);
      }
      const updated = await pool.updateAccountArl(id, body.arl, body.label);
      return c.json({
        success: updated.status === "ACTIVE",
        message:
          updated.status === "ACTIVE"
            ? "ARL updated and validated successfully!"
            : `ARL updated with status: ${updated.status}`,
        data: updated,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Failed to update account" }, 400);
    }
  });

  adminRouter.delete("/accounts/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await db.deleteAccount(id);
    if (!deleted) {
      return c.json({ success: false, error: "Account not found" }, 404);
    }
    return c.json({ success: true, message: "Account deleted successfully" });
  });

  router.route("/", adminRouter);
  router.route("/admin", adminRouter);

  return router;
}
