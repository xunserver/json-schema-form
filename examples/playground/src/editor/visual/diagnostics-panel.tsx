import type { VisualEditorDiagnostic } from "@xunserver-jsf/example-shared";

export function AuthoringDiagnostics({
  diagnostics,
  onFocus,
}: {
  readonly diagnostics: readonly VisualEditorDiagnostic[];
  readonly onFocus?: (diagnostic: VisualEditorDiagnostic) => void;
}) {
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <div data-testid="visual-diagnostics" className="border-t p-3" role="status">
      <p className="mb-2 text-sm font-medium">可视化诊断</p>
      <ul className="flex flex-col gap-1 text-sm">
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${index}`}>
            <button
              type="button"
              className="text-left text-destructive underline-offset-2 hover:underline"
              onClick={() => onFocus?.(diagnostic)}
            >
              {diagnostic.message}
              {diagnostic.jsonPointer !== undefined ? ` (${diagnostic.jsonPointer})` : ""}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
