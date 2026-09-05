import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { DatabaseAdapter } from "./DatabaseAdapter.js";
import { Account } from "../types/index.js";

const require = createRequire(import.meta.url);

export class SqliteAdapter implements DatabaseAdapter {
  private db: any;
  private isNodeSqlite: boolean = false;

  constructor(dbPath: string = "deezer_accounts.db") {
    const dir = path.dirname(dbPath);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      // @ts-ignore
      const { DatabaseSync } = require("node:sqlite");
      if (DatabaseSync) {
        this.db = new DatabaseSync(dbPath);
        this.isNodeSqlite = true;
        this.db.exec("PRAGMA journal_mode = WAL;");
      }
    } catch {
      try {
        // @ts-ignore
        const Database = require("better-sqlite3");
        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.isNodeSqlite = false;
      } catch (err: any) {
        throw new Error(
          `Failed to initialize SQLite database: ${err?.message}. Ensure Node.js 22+ or better-sqlite3 is installed.`
        );
      }
    }
  }

  public async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        arl TEXT,
        user_id TEXT,
        user_name TEXT,
        avatar_url TEXT,
        country TEXT,
        tier TEXT DEFAULT 'FREE',
        status TEXT CHECK(status IN ('ACTIVE', 'EXPIRED', 'BLOCKED', 'INVALID_CREDENTIALS', 'PENDING')) DEFAULT 'PENDING',
        last_checked_at INTEGER,
        last_refreshed_at INTEGER,
        created_at INTEGER NOT NULL,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
      CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
    `);
  }

  public async getAllAccounts(includePassword = false): Promise<Account[]> {
    const stmt = this.db.prepare("SELECT * FROM accounts ORDER BY created_at DESC");
    const rows = (this.isNodeSqlite ? stmt.all() : stmt.all()) as Account[];
    return rows.map((r) => {
      const copy = { ...r };
      if (!includePassword) delete copy.password;
      return copy;
    });
  }

  public async getAccountById(id: string, includePassword = false): Promise<Account | null> {
    const stmt = this.db.prepare("SELECT * FROM accounts WHERE id = ?");
    const row = (this.isNodeSqlite ? stmt.get(id) : stmt.get(id)) as Account | undefined;
    if (!row) return null;
    const copy = { ...row };
    if (!includePassword) delete copy.password;
    return copy;
  }

  public async getAccountByEmail(email: string, includePassword = false): Promise<Account | null> {
    const stmt = this.db.prepare("SELECT * FROM accounts WHERE LOWER(email) = LOWER(?)");
    const row = (this.isNodeSqlite ? stmt.get(email) : stmt.get(email)) as Account | undefined;
    if (!row) return null;
    const copy = { ...row };
    if (!includePassword) delete copy.password;
    return copy;
  }

  public async getActiveAccounts(): Promise<Account[]> {
    const stmt = this.db.prepare(
      "SELECT * FROM accounts WHERE status = 'ACTIVE' AND arl IS NOT NULL AND arl != '' ORDER BY last_refreshed_at DESC"
    );
    return (this.isNodeSqlite ? stmt.all() : stmt.all()) as Account[];
  }

  public async createAccount(account: Account): Promise<Account> {
    const stmt = this.db.prepare(`
      INSERT INTO accounts (
        id, label, email, password, arl, user_id, user_name, avatar_url, country, tier, status, last_checked_at, last_refreshed_at, created_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      account.id,
      account.label,
      account.email,
      account.password,
      account.arl || null,
      account.user_id || null,
      account.user_name || null,
      account.avatar_url || null,
      account.country || null,
      account.tier || "FREE",
      account.status,
      account.last_checked_at || null,
      account.last_refreshed_at || null,
      account.created_at,
      account.error_message || null
    );

    const created = { ...account };
    delete created.password;
    return created;
  }

  public async updateAccount(id: string, updates: Partial<Account>): Promise<boolean> {
    const keys = Object.keys(updates).filter((k) => k !== "id");
    if (keys.length === 0) return true;

    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (updates as any)[k]);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE accounts SET ${setClause} WHERE id = ?`);
    const info = stmt.run(...values);
    return (info?.changes ?? 1) > 0;
  }

  public async deleteAccount(id: string): Promise<boolean> {
    const stmt = this.db.prepare("DELETE FROM accounts WHERE id = ?");
    const info = stmt.run(id);
    return (info?.changes ?? 1) > 0;
  }

  public async getSetting(key: string): Promise<string | null> {
    const stmt = this.db.prepare("SELECT value FROM settings WHERE key = ?");
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    const stmt = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    stmt.run(key, value);
  }
}
