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

// Search API

export interface SearchMatch {
  line: number;
  context: string;
}

export interface SearchResultItem {
  path: string;
  title: string;
  type: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResultItem[];
}

export async function searchNotes(params: {
  q: string;
  regex?: boolean;
  caseSensitive?: boolean;
}): Promise<SearchResponse> {
  const sp = new URLSearchParams();
  sp.set("q", params.q);
  if (params.regex) sp.set("regex", "true");
  if (params.caseSensitive) sp.set("case", "true");
  const res = await fetch(`${BASE}/search?${sp.toString()}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

// Git API

export interface CommitInfo {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
}

export interface CommitLogResponse {
  commits: CommitInfo[];
  total: number;
  page: number;
  per_page: number;
}

export interface DiffFile {
  path: string;
  change_type: string;
  diff_text: string;
}

export interface DiffResponse {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: DiffFile[];
}

export async function gitCommit(message: string): Promise<CommitInfo> {
  const res = await fetch(`${BASE}/git/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error("Failed to commit");
  return res.json();
}

export async function gitLog(page = 1, perPage = 50): Promise<CommitLogResponse> {
  const res = await fetch(`${BASE}/git/log?page=${page}&per_page=${perPage}`);
  if (!res.ok) throw new Error("Failed to get log");
  return res.json();
}

export async function gitDiff(hash: string): Promise<DiffResponse> {
  const res = await fetch(`${BASE}/git/diff/${hash}`);
  if (!res.ok) throw new Error("Failed to get diff");
  return res.json();
}

export async function gitRestore(hash: string): Promise<CommitInfo> {
  const res = await fetch(`${BASE}/git/restore/${hash}`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to restore");
  return res.json();
}

// Maintenance API

export interface GCPreviewResponse {
  candidates: string[];
  total_size: number;
}

export interface GCResult {
  deleted: string[];
  total_size: number;
}

export interface BrokenLink {
  file: string;
  line: number;
  link: string;
  suggestion: string | null;
}

export interface LinkCheckResponse {
  broken: BrokenLink[];
}

export async function gcPreview(): Promise<GCPreviewResponse> {
  const res = await fetch(`${BASE}/gc/preview`);
  if (!res.ok) throw new Error("Failed to preview GC");
  return res.json();
}

export async function runGC(): Promise<GCResult> {
  const res = await fetch(`${BASE}/gc`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to run GC");
  return res.json();
}

export async function checkLinks(): Promise<LinkCheckResponse> {
  const res = await fetch(`${BASE}/links/check`);
  if (!res.ok) throw new Error("Failed to check links");
  return res.json();
}

// Daily API

export interface DailyEntry {
  date: string;
  path: string;
  title: string;
}

export interface DailyCalendarResponse {
  year: number;
  month: number;
  entries: DailyEntry[];
}

export interface DailyCreateResponse {
  path: string;
  status: "created" | "exists";
}

export async function createDailyToday(): Promise<DailyCreateResponse> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const res = await fetch(`${BASE}/daily/today`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateStr }),
  });
  if (!res.ok) throw new Error("Failed to create daily");
  return res.json();
}

export async function getDailyCalendar(
  year: number,
  month: number
): Promise<DailyCalendarResponse> {
  const res = await fetch(`${BASE}/daily/calendar?year=${year}&month=${month}`);
  if (!res.ok) throw new Error("Failed to get calendar");
  return res.json();
}

export async function getDailyMonths(): Promise<{ months: string[] }> {
  const res = await fetch(`${BASE}/daily/months`);
  if (!res.ok) throw new Error("Failed to get daily months");
  return res.json();
}
