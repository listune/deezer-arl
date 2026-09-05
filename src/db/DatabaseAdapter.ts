import { Account, CreateAccountInput } from "../types/index.js";

export interface DatabaseAdapter {
  init(): Promise<void>;
  getAllAccounts(includePassword?: boolean): Promise<Account[]>;
  getAccountById(id: string, includePassword?: boolean): Promise<Account | null>;
  getAccountByEmail(email: string, includePassword?: boolean): Promise<Account | null>;
  getActiveAccounts(): Promise<Account[]>;
  createAccount(account: Account): Promise<Account>;
  updateAccount(id: string, updates: Partial<Account>): Promise<boolean>;
  deleteAccount(id: string): Promise<boolean>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}
