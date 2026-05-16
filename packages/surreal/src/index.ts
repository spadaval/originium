export type SurrealConfig = {
  readonly url: string;
  readonly namespace: string;
  readonly database: string;
  readonly user: string;
  readonly password: string;
};

export const coreSchemaPath = "schema/core.surql";

export function readSurrealConfig(env: NodeJS.ProcessEnv = process.env): SurrealConfig {
  return {
    url: env.ORIGINIUM_SURREAL_URL ?? "http://127.0.0.1:8000",
    namespace: env.ORIGINIUM_SURREAL_NAMESPACE ?? "originium",
    database: env.ORIGINIUM_SURREAL_DATABASE ?? "originium",
    user: env.ORIGINIUM_SURREAL_USER ?? "root",
    password: env.ORIGINIUM_SURREAL_PASSWORD ?? "root",
  };
}
