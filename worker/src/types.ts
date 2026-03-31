export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  AUTH_TOKEN: string;
  ENVIRONMENT: string;
}
