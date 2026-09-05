export type AccountStatus = "ACTIVE" | "EXPIRED" | "BLOCKED" | "INVALID_CREDENTIALS" | "PENDING";

export interface Account {
  id: string;
  label: string;
  email: string;
  password?: string;
  arl: string | null;
  user_id: string | null;
  user_name: string | null;
  avatar_url: string | null;
  country: string | null;
  tier: string;
  status: AccountStatus;
  last_checked_at: number | null;
  last_refreshed_at: number | null;
  created_at: number;
  error_message: string | null;
}

export interface CreateAccountInput {
  label: string;
  email: string;
  password?: string;
  initialArl?: string;
}

export interface UpdateAccountInput {
  label?: string;
  email?: string;
  password?: string;
  status?: AccountStatus;
}

export interface DeezerLoginResult {
  success: boolean;
  arl?: string;
  userId?: string;
  userName?: string;
  avatarUrl?: string | null;
  country?: string;
  tier?: string;
  status: AccountStatus;
  errorMessage?: string;
}

export interface DeezerValidationResult {
  valid: boolean;
  userId?: string;
  userName?: string;
  avatarUrl?: string | null;
  country?: string;
  tier?: string;
  status: AccountStatus;
  errorMessage?: string;
}

export interface StatsSummary {
  total: number;
  active: number;
  expired: number;
  blocked: number;
  invalidCredentials: number;
  activeArl: string | null;
  primaryAccount: {
    id: string;
    label: string;
    userName: string | null;
    tier: string;
  } | null;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
