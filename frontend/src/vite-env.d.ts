/// <reference types="vite/client" />

interface Window {
  __chronicle_source_insertAtCursor?: (deleteCount: number, text: string) => void;
}
