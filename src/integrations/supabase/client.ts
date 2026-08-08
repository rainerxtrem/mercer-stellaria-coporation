/**
 * Application data client (browser).
 *
 * Keeps the fluent API the codebase was written against, but talks to this
 * project's own PostgreSQL database through `/api/db` instead of a hosted
 * backend. Row-level security is enforced by PostgreSQL itself, using the
 * bearer token attached to every request.
 */
import { createAuthClient } from "@/lib/pgrest/auth-client";
import { createBrowserTransport, createDataApi } from "@/lib/pgrest/browser-client";

function createAppClient() {
  const auth = createAuthClient();
  const { executor, storage } = createBrowserTransport(auth);
  return { ...createDataApi(executor), auth, storage };
}

export type AppClient = ReturnType<typeof createAppClient>;

let instance: AppClient | undefined;

// Import the client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as AppClient, {
  get(_target, property, receiver) {
    if (!instance) instance = createAppClient();
    return Reflect.get(instance, property, receiver);
  },
});
