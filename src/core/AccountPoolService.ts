import { DatabaseAdapter } from "../db/DatabaseAdapter.js";
import { DeezerAuthService } from "./DeezerAuthService.js";
import { Account, CreateAccountInput, StatsSummary } from "../types/index.js";
import crypto from "crypto";

export class AccountPoolService {
  private db: DatabaseAdapter;
  private rotationIndex = 0;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  public async addAccount(input: CreateAccountInput): Promise<Account> {
    const existing = await this.db.getAccountByEmail(input.email);
    if (existing) {
      throw new Error(`An account with email "${input.email}" already exists`);
    }

    if (!input.email) {
      throw new Error("Email is required");
    }
    if (!input.password && !input.initialArl) {
      throw new Error("Please provide either Deezer Password or an initial ARL Token");
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    let arl = input.initialArl?.trim() || null;
    let userId: string | null = null;
    let userName: string | null = null;
    let avatarUrl: string | null = null;
    let country: string | null = null;
    let tier = "FREE";
    let status: Account["status"] = "PENDING";
    let errorMessage: string | null = null;

    if (arl) {
      const val = await DeezerAuthService.validateArl(arl);
      if (val.valid) {
        status = "ACTIVE";
        userId = val.userId || null;
        userName = val.userName || null;
        avatarUrl = val.avatarUrl || null;
        country = val.country || null;
        tier = val.tier || "FREE";
      } else {
        errorMessage = val.errorMessage || "Provided initial ARL is invalid";
      }
    }

    if (status !== "ACTIVE" && input.password) {
      const login = await DeezerAuthService.login(input.email, input.password);
      if (login.success && login.arl) {
        arl = login.arl;
        status = "ACTIVE";
        userId = login.userId || null;
        userName = login.userName || null;
        avatarUrl = login.avatarUrl || null;
        country = login.country || null;
        tier = login.tier || "FREE";
        errorMessage = null;
      } else {
        status = login.status;
        errorMessage = login.errorMessage || "Login failed";
      }
    }

    const newAccount: Account = {
      id,
      label: input.label.trim() || input.email.split("@")[0],
      email: input.email.trim(),
      password: input.password,
      arl,
      user_id: userId,
      user_name: userName,
      avatar_url: avatarUrl,
      country,
      tier,
      status,
      last_checked_at: now,
      last_refreshed_at: status === "ACTIVE" ? now : null,
      created_at: now,
      error_message: errorMessage,
    };

    return await this.db.createAccount(newAccount);
  }

  public async refreshAccount(id: string): Promise<Account> {
    const account = await this.db.getAccountById(id, true);
    if (!account) {
      throw new Error(`Account not found`);
    }

    const now = Date.now();

    if (account.arl) {
      const val = await DeezerAuthService.validateArl(account.arl);
      if (val.valid) {
        await this.db.updateAccount(id, {
          status: "ACTIVE",
          user_id: val.userId || account.user_id,
          user_name: val.userName || account.user_name,
          avatar_url: val.avatarUrl || account.avatar_url,
          country: val.country || account.country,
          tier: val.tier || account.tier,
          last_checked_at: now,
          error_message: null,
        });
        const updated = await this.db.getAccountById(id);
        return updated!;
      }
    }

    if (account.password) {
      const login = await DeezerAuthService.login(account.email, account.password);
      if (login.success && login.arl) {
        await this.db.updateAccount(id, {
          arl: login.arl,
          user_id: login.userId || account.user_id,
          user_name: login.userName || account.user_name,
          avatar_url: login.avatarUrl || account.avatar_url,
          country: login.country || account.country,
          tier: login.tier || account.tier,
          status: "ACTIVE",
          last_checked_at: now,
          last_refreshed_at: now,
          error_message: null,
        });
        const updated = await this.db.getAccountById(id);
        return updated!;
      }
    }

    await this.db.updateAccount(id, {
      status: "EXPIRED",
      last_checked_at: now,
      error_message: "ARL token has expired and requires updating",
    });

    const updated = await this.db.getAccountById(id);
    return updated!;
  }

  public async updateAccountArl(id: string, arl: string, label?: string): Promise<Account> {
    const account = await this.db.getAccountById(id, true);
    if (!account) {
      throw new Error(`Account not found`);
    }

    const cleanArl = arl.trim();
    const now = Date.now();
    const val = await DeezerAuthService.validateArl(cleanArl);

    if (val.valid) {
      await this.db.updateAccount(id, {
        label: label?.trim() || account.label,
        arl: cleanArl,
        user_id: val.userId || account.user_id,
        user_name: val.userName || account.user_name,
        avatar_url: val.avatarUrl || account.avatar_url,
        country: val.country || account.country,
        tier: val.tier || account.tier,
        status: "ACTIVE",
        last_checked_at: now,
        last_refreshed_at: now,
        error_message: null,
      });
    } else {
      await this.db.updateAccount(id, {
        label: label?.trim() || account.label,
        arl: cleanArl,
        status: val.status,
        last_checked_at: now,
        error_message: val.errorMessage || "ARL validation failed",
      });
    }

    const updated = await this.db.getAccountById(id);
    return updated!;
  }

  public async checkAllAccounts(): Promise<{ checked: number; refreshed: number; failed: number }> {
    const accounts = await this.db.getAllAccounts(true);
    let checked = 0;
    let refreshed = 0;
    let failed = 0;

    for (const acc of accounts) {
      checked++;
      const now = Date.now();

      if (acc.arl) {
        const val = await DeezerAuthService.validateArl(acc.arl);
        if (val.valid) {
          await this.db.updateAccount(acc.id, {
            status: "ACTIVE",
            user_id: val.userId || acc.user_id,
            user_name: val.userName || acc.user_name,
            avatar_url: val.avatarUrl || acc.avatar_url,
            country: val.country || acc.country,
            tier: val.tier || acc.tier,
            last_checked_at: now,
            error_message: null,
          });
          continue;
        }
      }

      if (acc.password) {
        const login = await DeezerAuthService.login(acc.email, acc.password);
        if (login.success && login.arl) {
          refreshed++;
          await this.db.updateAccount(acc.id, {
            arl: login.arl,
            user_id: login.userId || acc.user_id,
            user_name: login.userName || acc.user_name,
            avatar_url: login.avatarUrl || acc.avatar_url,
            country: login.country || acc.country,
            tier: login.tier || acc.tier,
            status: "ACTIVE",
            last_checked_at: now,
            last_refreshed_at: now,
            error_message: null,
          });
        } else {
          failed++;
          await this.db.updateAccount(acc.id, {
            status: login.status,
            last_checked_at: now,
            error_message: login.errorMessage || "Health check auto-login failed",
          });
        }
      } else {
        failed++;
        await this.db.updateAccount(acc.id, {
          status: "EXPIRED",
          last_checked_at: now,
          error_message: "ARL expired and no password stored for auto-renewal",
        });
      }
    }

    return { checked, refreshed, failed };
  }

  public async getActiveArl(rotate = false): Promise<{ arl: string; account: Account } | null> {
    const active = await this.db.getActiveAccounts();
    if (active.length === 0) {
      return null;
    }

    const startIndex = rotate ? (this.rotationIndex++ % active.length) : 0;

    for (let i = 0; i < active.length; i++) {
      const candidateIndex = (startIndex + i) % active.length;
      const candidate = active[candidateIndex];

      if (candidate.arl) {
        return { arl: candidate.arl, account: candidate };
      }
    }

    return null;
  }

  public async getStats(): Promise<StatsSummary> {
    const accounts = await this.db.getAllAccounts();
    const active = accounts.filter((a) => a.status === "ACTIVE" && a.arl);
    const expired = accounts.filter((a) => a.status === "EXPIRED");
    const blocked = accounts.filter((a) => a.status === "BLOCKED");
    const invalidCredentials = accounts.filter((a) => a.status === "INVALID_CREDENTIALS");

    const primary = active[0] || null;

    return {
      total: accounts.length,
      active: active.length,
      expired: expired.length,
      blocked: blocked.length,
      invalidCredentials: invalidCredentials.length,
      activeArl: primary?.arl || null,
      primaryAccount: primary
        ? {
            id: primary.id,
            label: primary.label,
            userName: primary.user_name,
            tier: primary.tier,
          }
        : null,
    };
  }
}
