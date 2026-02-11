const BASE = "/api";

export interface NoteMeta {
  path: string;
  title: string;
  type: string;
  created: string | null;
  tags: string[];
}

export interface NoteContent {
  path: string;
  content: string;
}

export async function listNotes(): Promise<NoteMeta[]> {
  const res = await fetch(`${BASE}/notes`);
  if (!res.ok) throw new Error("Failed to list notes");
  return res.json();
}

export async function getNote(path: string): Promise<NoteContent> {
  const res = await fetch(`${BASE}/notes/${path}`);
  if (!res.ok) throw new Error("Failed to get note");
  return res.json();
}

export async function saveNote(path: string, content: string): Promise<void> {
  const res = await fetch(`${BASE}/notes/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to save note");
}

export async function deleteNote(path: string): Promise<void> {
  const res = await fetch(`${BASE}/notes/${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete note");
}

// Tree API

export interface TreeNode {
  name: string;
  title: string | null;
  type: string | null;
  path: string | null;
  children: TreeNode[];
}

export interface TreeRoot {
  name: string;
  children: TreeNode[];
}

export async function getTree(): Promise<TreeRoot> {
  const res = await fetch(`${BASE}/tree`);
  if (!res.ok) throw new Error("Failed to get tree");
  return res.json();
}

// Page management API

export async function createPage(
  parentPath: string,
  title: string,
  type: string = "note"
): Promise<{ path: string }> {
  const res = await fetch(`${BASE}/pages/${parentPath}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, type }),
  });
  if (!res.ok) throw new Error("Failed to create page");
  return res.json();
}

// Page index API (for autocomplete)

export interface PageIndexItem {
  path: string;
  title: string;
  type: string;
}

export async function getPageIndex(): Promise<PageIndexItem[]> {
  const res = await fetch(`${BASE}/pages/index`);
  if (!res.ok) throw new Error("Failed to get page index");
  const data = await res.json();
  return data.pages;
}

// Assets API

export interface AssetItem {
  filename: string;
  path: string;
  size: number;
}

export async function uploadAsset(file: File | Blob): Promise<{ path: string; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/assets/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload asset");
  return res.json();
}

export async function getAssetIndex(): Promise<AssetItem[]> {
  const res = await fetch(`${BASE}/assets/index`);
  if (!res.ok) throw new Error("Failed to get asset index");
  const data = await res.json();
  return data.images;
}
