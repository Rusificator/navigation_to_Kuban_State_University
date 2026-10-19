import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

/** Native WebViews do not support arbitrary anchor downloads: use the OS share sheet. */
export async function exportText(
  filename: string,
  content: string,
  type = "text/plain",
) {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title: filename, text: content });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
