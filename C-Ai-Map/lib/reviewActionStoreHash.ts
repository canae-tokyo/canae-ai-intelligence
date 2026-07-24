import type { UpdateCandidate } from "./types";

// Mirrors src/worker.mjs's serializeCandidateStore + sha256 exactly so the
// hash embedded at build time matches what the Review Action API recomputes
// from data/update-candidates.json at request time.
export async function computeReviewActionStoreHash(
  candidateStore: UpdateCandidate[]
): Promise<string> {
  const serialized = `${JSON.stringify(candidateStore, null, 2)}\n`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));

  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
