/**
 * Browser-side session manager.
 *
 * Mirrors the subset of the `supabase.auth` API the application uses, backed by
 * the app's own `/api/auth` endpoints. Sessions live in localStorage and the
 * access token is refreshed transparently before it expires.
 */

export type AuthUser = {
  id: string;
  aud: string;
  role: string;
  email: string | null;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
};

export type Session = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: AuthUser;
};

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

type AuthResult<T> = { data: T; error: { message: string; status?: number } | null };

const STORAGE_KEY = "sba.auth.session";
const REFRESH_MARGIN_SECONDS = 60;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error((payload.message as string) ?? `Request failed (${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

function toResult<T>(promise: Promise<T>, empty: T): Promise<AuthResult<T>> {
  return promise.then(
    (data) => ({ data, error: null }),
    (error: Error & { status?: number }) => ({
      data: empty,
      error: { message: error.message, status: error.status },
    }),
  );
}

export function createAuthClient() {
  let session: Session | null = null;
  let initialised = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let inflightRefresh: Promise<Session | null> | undefined;
  const listeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();

  function emit(event: AuthChangeEvent) {
    for (const listener of listeners) {
      try {
        listener(event, session);
      } catch (error) {
        console.error("[auth] listener failed", error);
      }
    }
  }

  function persist(next: Session | null) {
    session = next;
    if (!isBrowser()) return;
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
    scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!session || !isBrowser()) return;
    const delay = (session.expires_at - REFRESH_MARGIN_SECONDS) * 1000 - Date.now();
    refreshTimer = setTimeout(() => void refresh(), Math.max(delay, 5_000));
  }

  function readStored(): Session | null {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  async function refresh(): Promise<Session | null> {
    if (!session?.refresh_token) return null;
    if (inflightRefresh) return inflightRefresh;

    inflightRefresh = post<{ session: Session }>("/api/auth/refresh", {
      refresh_token: session.refresh_token,
    })
      .then(({ session: next }) => {
        persist(next);
        emit("TOKEN_REFRESHED");
        return next;
      })
      .catch(() => {
        persist(null);
        emit("SIGNED_OUT");
        return null;
      })
      .finally(() => {
        inflightRefresh = undefined;
      });

    return inflightRefresh;
  }

  /** Exchanges a `?token=` recovery/invite link for a real session. */
  async function consumeUrlToken(): Promise<boolean> {
    if (!isBrowser()) return false;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) return false;

    try {
      const { session: next } = await post<{ session: Session }>("/api/auth/verify", {
        token,
        type: "recovery",
      });
      persist(next);
      url.searchParams.delete("token");
      url.searchParams.delete("redirect_to");
      window.history.replaceState({}, "", url.toString());
      emit("PASSWORD_RECOVERY");
      return true;
    } catch {
      return false;
    }
  }

  async function initialise() {
    if (initialised) return;
    initialised = true;
    session = readStored();
    await consumeUrlToken();
    if (session && session.expires_at * 1000 - REFRESH_MARGIN_SECONDS * 1000 < Date.now()) {
      await refresh();
    } else {
      scheduleRefresh();
    }
    emit("INITIAL_SESSION");
  }

  const client = {
    async getSession(): Promise<AuthResult<{ session: Session | null }>> {
      await initialise();
      if (session && session.expires_at * 1000 <= Date.now()) await refresh();
      return { data: { session }, error: null };
    },

    async getUser(jwt?: string): Promise<AuthResult<{ user: AuthUser | null }>> {
      await initialise();
      const token = jwt ?? session?.access_token;
      if (!token) return { data: { user: null }, error: { message: "Auth session missing!" } };
      return toResult(post<{ user: AuthUser | null }>("/api/auth/user", { access_token: token }), {
        user: null,
      });
    },

    async setSession(tokens: { access_token: string; refresh_token: string }) {
      const result = await toResult(
        post<{ session: Session }>("/api/auth/refresh", { refresh_token: tokens.refresh_token }),
        { session: null as Session | null },
      );
      if (result.data.session) {
        persist(result.data.session);
        emit("SIGNED_IN");
      }
      return result;
    },

    async signInWithPassword(credentials: { email: string; password: string }) {
      const result = await toResult(
        post<{ session: Session; user: AuthUser }>("/api/auth/token", credentials),
        { session: null as Session | null, user: null as AuthUser | null },
      );
      if (result.data.session) {
        persist(result.data.session);
        emit("SIGNED_IN");
      }
      return result;
    },

    async signUp(credentials: {
      email: string;
      password: string;
      options?: { data?: { full_name?: string } };
    }) {
      const result = await toResult(
        post<{ session: Session; user: AuthUser }>("/api/auth/signup", {
          email: credentials.email,
          password: credentials.password,
          full_name: credentials.options?.data?.full_name ?? "",
        }),
        { session: null as Session | null, user: null as AuthUser | null },
      );
      if (result.data.session) {
        persist(result.data.session);
        emit("SIGNED_IN");
      }
      return result;
    },

    async signOut() {
      const refreshToken = session?.refresh_token ?? null;
      persist(null);
      emit("SIGNED_OUT");
      return toResult(post("/api/auth/logout", { refresh_token: refreshToken }), {});
    },

    async resetPasswordForEmail(email: string, options: { redirectTo?: string } = {}) {
      return toResult(post("/api/auth/recover", { email, redirect_to: options.redirectTo }), {});
    },

    async updateUser(changes: {
      email?: string;
      password?: string;
      data?: Record<string, unknown>;
    }) {
      await initialise();
      if (!session) {
        return {
          data: { user: null as AuthUser | null },
          error: { message: "Auth session missing!" },
        };
      }
      const result = await toResult(
        post<{ user: AuthUser }>("/api/auth/update-user", {
          access_token: session.access_token,
          ...changes,
        }),
        { user: null as AuthUser | null },
      );
      if (result.data.user) emit("USER_UPDATED");
      return result;
    },

    onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
      listeners.add(callback);
      void initialise().then(() => callback("INITIAL_SESSION", session));
      return {
        data: {
          subscription: {
            id: "local",
            callback,
            unsubscribe() {
              listeners.delete(callback);
            },
          },
        },
      };
    },

    /** Reads the current access token, refreshing it first when needed. */
    async getAccessToken(): Promise<string | null> {
      const { data } = await client.getSession();
      return data.session?.access_token ?? null;
    },
  };

  return client;
}

export type BrowserAuthClient = ReturnType<typeof createAuthClient>;
