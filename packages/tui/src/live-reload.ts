import { createServerSocket } from "./server-client";
import { emit, SIGNALS } from "./signals";

type WatcherOptions = {
  changeDebounceMs?: number;
  rebuildDebounceMs?: number;
};

type WorkspaceWatcher = {
  close: () => void;
};

export async function watchWorkspace(_root: string, _options: WatcherOptions = {}): Promise<WorkspaceWatcher> {
  let closed = false;
  let activeSocket: Awaited<ReturnType<typeof createServerSocket>> | null = null;
  let detachEvents: (() => void) | null = null;

  const connectLoop = async (): Promise<void> => {
    while (!closed) {
      try {
        const socket = await createServerSocket();
        if (closed) {
          socket.close();
          break;
        }

        activeSocket = socket;
        detachEvents = socket.onEvent((event) => {
          if (event.event !== "workspace.changed") return;
          emit(SIGNALS.workspaceChanged);
        });

        await socket.request("workspace.watch.start");
        await socket.waitForClose();
      } catch {
        // Retry below.
      } finally {
        detachEvents?.();
        detachEvents = null;
        activeSocket = null;
      }

      if (closed) break;
      await sleep(240);
    }
  };

  void connectLoop();

  return {
    close: () => {
      closed = true;
      detachEvents?.();
      detachEvents = null;
      activeSocket?.close();
      activeSocket = null;
    },
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
