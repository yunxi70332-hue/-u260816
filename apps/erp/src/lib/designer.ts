export function getDesignerBaseUrl(): string {
  const configured = import.meta.env.VITE_DESIGNER_URL?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") {
    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
      return `${window.location.protocol}//${window.location.hostname}:9011/`;
    }
    if (import.meta.env.PROD) return `${window.location.origin}/`;
  }
  return "http://127.0.0.1:9011/";
}

export function getDesignerDraftUrl(designId: string): string {
  const url = new URL(getDesignerBaseUrl());
  if (typeof window !== "undefined" && window.location.port) url.searchParams.set("erpPort", window.location.port);
  url.searchParams.set("draft", "1");
  url.searchParams.set("designId", designId);
  return url.toString();
}
