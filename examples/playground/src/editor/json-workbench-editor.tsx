import { useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { EditorKey } from "@form/example-shared";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import { Skeleton } from "@/components/ui/skeleton";

globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") {
      return new jsonWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });

export interface JsonWorkbenchEditorProps {
  readonly activeTab: EditorKey;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function JsonWorkbenchEditor({ activeTab, value, onChange }: JsonWorkbenchEditorProps) {
  const suppressSyncRef = useRef(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null || suppressSyncRef.current) {
      return;
    }
    const model = editor.getModel();
    if (model !== null && model.getValue() !== value) {
      model.setValue(value);
    }
  }, [value, activeTab]);

  return (
    <Editor
      height="100%"
      language="json"
      path={`inmemory://playground/${activeTab}.json`}
      defaultValue={value}
      options={{
        automaticLayout: true,
      }}
      onMount={(editor) => {
        editorRef.current = editor;
        if (editor.getValue() !== value) {
          editor.setValue(value);
        }
      }}
      onChange={(next) => {
        suppressSyncRef.current = true;
        onChange(next ?? "");
        queueMicrotask(() => {
          suppressSyncRef.current = false;
        });
      }}
      loading={<Skeleton className="h-full w-full" />}
    />
  );
}
