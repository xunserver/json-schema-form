/// <reference types="vite/client" />

declare module "@form/example-shared/preview.css";

declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

interface Window {
  MonacoEnvironment?: {
    getWorker(workerId: string, label: string): Worker;
  };
}

declare var MonacoEnvironment: Window["MonacoEnvironment"];
