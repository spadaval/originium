import { toSlug } from "@originium/domain";

export { checkWebRuntimeHealth, type WebRuntimeHealthReport } from "./health.ts";

export function renderPlaceholderPage(title = "Originium"): string {
  return `<main data-page="${toSlug(title)}"><h1>${title}</h1></main>`;
}

if (import.meta.main) {
  console.log(renderPlaceholderPage());
}
