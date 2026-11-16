import { hubPath } from "../paths";
import type { PageContent, PageImage, SeasonState, TeamId } from "../binder/content";

/*
 * The binder editor's calls to ManuQueue's /api/binder routes
 * (manu-orders/src/lib/binder.ts has the rules). A page's draft saves on its
 * own as people work; Publish puts it up. One editor tab holds a page at a
 * time (`tab`), checking in every 30 seconds.
 */

export type EditorPage = {
  draft: PageContent;
  rev: number;
  updatedAt: string | null;
  updatedBy: string;
  /** The draft has unpublished changes while this differs from rev */
  publishedRev: number;
  publishedAt: string | null;
  publishedBy: string;
};

export type EditorSponsor = { id: string; name: string; url: string; logo: PageImage | null };

export type EditorSponsors = {
  list: EditorSponsor[];
  /** The list differs from what visitors see, until either page is published */
  unpublished: boolean;
  rev: number;
  updatedAt: string | null;
  updatedBy: string;
};

export type EditorSeason = {
  season: number;
  state: SeasonState;
  liveSeason: number;
  /** Every season, newest first */
  seasons: { season: number; state: SeasonState }[];
  pages: Record<TeamId, EditorPage>;
  sponsors: EditorSponsors;
};

export type Answer<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; data?: Record<string, unknown> };

const OFFLINE = "Could not reach the server.";

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  { keepalive = false } = {},
): Promise<Answer<T>> {
  try {
    const res = await fetch(path, {
      method,
      cache: "no-store",
      keepalive,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Signed out (or the account changed) mid edit: sign in again
    if (res.status === 401) window.location.assign(hubPath("/login/"));
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    return {
      ok: false,
      status: res.status,
      error: data?.error ?? "Something went wrong. Please try again.",
      data: data ?? undefined,
    };
  } catch {
    return { ok: false, status: 0, error: OFFLINE };
  }
}

const seasonPath = (season: number | "live") => `/api/binder/seasons/${season}`;
const pagePath = (season: number, team: TeamId) => `${seasonPath(season)}/pages/${team}`;

/** This tab's name, so the server can tell two tabs of one person apart */
export const TAB = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "");

export function loadSeason(season: number | "live") {
  return call<EditorSeason>("GET", seasonPath(season));
}

/** `settled`: nothing changed but where things were measured to sit */
export function savePage(
  season: number,
  team: TeamId,
  page: PageContent,
  rev: number,
  settled: boolean,
) {
  return call<{ rev: number; updatedAt: string; publishedRev: number }>(
    "PUT",
    pagePath(season, team),
    { rev, tab: TAB, settled, page },
  );
}

/** Takes or keeps the page; 423 with data.heldBy while someone else has it */
export function lockPage(season: number, team: TeamId, takeOver = false) {
  return call<{ ok: true }>("POST", `${pagePath(season, team)}/lock`, { tab: TAB, takeOver });
}

/** Lets go of the page, even as the tab closes */
export function unlockPage(season: number, team: TeamId) {
  return call<{ ok: true }>("DELETE", `${pagePath(season, team)}/lock?tab=${TAB}`, undefined, {
    keepalive: true,
  });
}

export function publishPage(season: number, team: TeamId, rev: number) {
  return call<{ publishedRev: number; publishedAt: string }>(
    "POST",
    `${pagePath(season, team)}/publish`,
    { rev, tab: TAB },
  );
}

export function saveSponsors(season: number, list: EditorSponsor[], rev: number, force: boolean) {
  return call<{ sponsors: EditorSponsors }>("PUT", `${seasonPath(season)}/sponsors`, {
    rev,
    force,
    sponsors: list,
  });
}

export function startSeason(from: "copy" | "outline") {
  return call<{ season: number }>("POST", "/api/binder/seasons", { from });
}

export function makeLive(season: number) {
  return call<unknown>("PATCH", seasonPath(season), { live: true });
}

export function deleteSeason(season: number) {
  return call<unknown>("DELETE", seasonPath(season));
}

/* ------------------------------------------------------------------ */
/*  Uploading pictures                                                */
/* ------------------------------------------------------------------ */

/** Matches BINDER_IMAGE_MAX_BYTES in manu-orders/src/lib/binder-images.ts */
const MAX_BYTES = 8 * 1024 * 1024;
/** Longest side a picture is sent at. Plenty for a screen, and quick to load */
const MAX_SIDE = 2400;
/** Smaller files that fit are sent as they are */
const SEND_AS_IS_BYTES = 1.5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** For the file picker. HEIC too: the browser may be able to turn it into
 *  something the server takes */
export const IMAGE_ACCEPT = [...ACCEPTED, "image/heic", "image/heif"].join(",");

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrinks a big photo or render before it's sent, so the page stays quick
 * for judges. Small PNG, JPEG and WebP files and every GIF (which can move)
 * go as they are.
 */
async function prepareImage(file: File): Promise<Blob | { error: string }> {
  const accepted = ACCEPTED.includes(file.type);
  if (file.type === "image/gif") {
    return file.size <= MAX_BYTES ? file : { error: `${file.name} is over 8 MB.` };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (accepted && file.size <= MAX_BYTES) return file;
    return { error: `${file.name} isn't a picture this can use. Try a PNG or JPEG.` };
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (accepted && scale === 1 && file.size <= SEND_AS_IS_BYTES) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return accepted && file.size <= MAX_BYTES ? file : { error: `${file.name} couldn't be read.` };
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  // WebP keeps a CAD render's see-through background. A browser that can't
  // make WebP gets JPEG on white
  let blob = await canvasBlob(canvas, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") {
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    blob = await canvasBlob(canvas, "image/jpeg", 0.88);
  }
  bitmap.close();

  if (blob && accepted && scale === 1 && blob.size >= file.size) blob = file;
  if (!blob) return { error: `${file.name} couldn't be read.` };
  if (blob.size > MAX_BYTES) return { error: `${file.name} is still over 8 MB once shrunk.` };
  return blob;
}

/** Uploads one picture. Its description and caption start empty */
export async function uploadImage(
  file: File,
): Promise<{ ok: true; image: PageImage } | { ok: false; error: string }> {
  const prepared = await prepareImage(file);
  if (!(prepared instanceof Blob)) return { ok: false, error: prepared.error };

  const form = new FormData();
  form.append("file", prepared, file.name);
  try {
    const res = await fetch("/api/binder/images", { method: "POST", body: form });
    if (res.status === 401) window.location.assign(hubPath("/login/"));
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `${file.name}: ${data?.error ?? "it didn't upload. Please try again."}` };
    }
    return { ok: true, image: { file: data.file, alt: "", caption: "" } };
  } catch {
    return { ok: false, error: `${file.name}: ${OFFLINE}` };
  }
}

/** Opens the file picker; resolves with the files chosen (none if closed) */
export function chooseFiles(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_ACCEPT;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}
