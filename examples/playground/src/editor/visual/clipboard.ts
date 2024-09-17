export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText === undefined) {
    throw new Error("当前环境不支持复制");
  }
  await navigator.clipboard.writeText(text);
}

export function downloadUtf8Json(text: string, fileName: string, mimeType: string): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
