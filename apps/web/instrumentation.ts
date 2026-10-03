export async function register() {
  for (const k of [
    "WORKFLOW_POSTGRES_URL",
    "AZURE_STORAGE_CONNECTION_STRING",
    "AZURE_DI_ENDPOINT",
    "AZURE_FOUNDRY_ENDPOINT",
    "AZURE_API_KEY",
  ])
    if (!process.env[k]) throw new Error(`${k} is not set`);
  const { getWorld } = await import("workflow/runtime");
  await getWorld().start?.();
}
