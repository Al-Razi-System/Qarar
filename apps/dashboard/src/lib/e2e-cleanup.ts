/** Preserve the action that failed, even when timeout already closed a page. */
export async function closeE2EContexts(contexts: Array<{ close: () => Promise<void> }>, primary?: { error: unknown }) {
  const results = await Promise.allSettled(contexts.map((context) => context.close()));
  if (primary) throw primary.error;
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
