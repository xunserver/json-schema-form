import { useSyncExternalStore } from "react";
import type { PlaygroundController, PlaygroundSnapshot } from "@form/example-shared";

export function usePlaygroundSnapshot(controller: PlaygroundController): PlaygroundSnapshot {
  return useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );
}
