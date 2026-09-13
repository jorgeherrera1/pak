export async function register() {
  if (process.env.NEXT_RUNTIME !== "edge") {
    for (const k of [
      "DATABASE_URL",
      "WORKFLOW_POSTGRES_URL",
      "AZURE_STORAGE_CONNECTION_STRING",
    ])
      if (!process.env[k]) throw new Error(`${k} is not set`);
    const { getWorld } = await import("workflow/runtime");
    await getWorld().start?.();
  }
}
