import { coreSchemaPath, readSurrealConfig } from "@originium/surreal";

export function main(argv: readonly string[] = process.argv.slice(2)): string {
  const [area, command] = argv;

  if (area === "db" && command === "status") {
    const config = readSurrealConfig();
    return `SurrealDB target: ${config.url} ns=${config.namespace} db=${config.database}`;
  }

  if (area === "db" && command === "apply-schema") {
    return `Schema file: ${coreSchemaPath}`;
  }

  return "Usage: originium db <status|apply-schema>";
}

if (import.meta.main) {
  console.log(main());
}
