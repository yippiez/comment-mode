import { startRuntime } from "./runtime";
import { parseStartupConfig } from "./startup";

const READY_PREFIX = "COMMENT_MODE_SERVER_READY ";

async function main(): Promise<void> {
  const config = parseStartupConfig(process.argv.slice(2));
  if (!config) return;

  const runtime = await startRuntime(config);
  console.log(
    `${READY_PREFIX}${JSON.stringify({
      url: runtime.url,
      rootDir: config.rootDir,
      localhostOnly: true,
      transport: "websocket",
    })}`,
  );

  const shutdown = () => {
    runtime.close();
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
  process.on("exit", shutdown);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
