import { hubPath } from "../paths";
import type { SeasonState, TeamId } from "../binder/content";

/*
 * The binder editor's calls to ManuQueue's /api/binder routes
 * (manu-orders/src/lib/binder.ts has the rules). Each part (a team's robot,
 * one section, the sponsors) saves on its own with the rev it was loaded at;
 * if someone else saved it since, the server answers with theirs instead.
 */

/** Who saved a part last, and its rev for the next save */
export type SavedBy = { rev: number; updatedAt: string | null; updatedBy: string };

export type EditorImage = { file: string; src: string; alt: string; caption: string };

export type EditorEntry = {
  id: string;
  title: string;
  summary: string;
  features: string[];
  images: EditorImage[];
};

export type SectionContent = { title: string; intro: string; entries: EditorEntry[] };

export type EditorSection = SavedBy & SectionContent & { id: string };

export type TeamDetails = {
  number: number;
  robot: {
    name: string;
    tagline: string;
    image: EditorImage | null;
    stats: { label: string; value: string }[];
  };
};

export type EditorTeamDetails = SavedBy & TeamDetails;

export type EditorTeam = {
  team: TeamId;
  name: string;
  details: EditorTeamDetails;
  sections: EditorSection[];
};

export type EditorSponsor = { id: string; name: string; url: string; logo: EditorImage | null };

export type EditorSponsors = SavedBy & { list: EditorSponsor[] };

export type EditorSeason = {
  season: number;
  state: SeasonState;
  liveSeason: number;
  /** Every season, newest first */
  seasons: { season: number; state: SeasonState }[];
  teams: Record<TeamId, EditorTeam>;
  sponsors: EditorSponsors;
};

type Answer<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; current?: unknown };

const OFFLINE = "Could not reach the server. Please try again.";

async function call<T>(method: string, path: string, body?: unknown): Promise<Answer<T>> {
  try {
    const res = await fetch(path, {
      method,
      cache: "no-store",
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
      current: data?.current,
    };
  } catch {
    return { ok: false, status: 0, error: OFFLINE };
  }
}

const seasonPath = (season: number | "live") => `/api/binder/seasons/${season}`;

/** A saved part, a refusal, or (current) the newer one someone else saved */
export type SaveAnswer<T> = { ok: true; value: T } | { ok: false; error: string; current?: T };

function saveAnswer<T>(answer: Answer<Record<string, T>>, key: string): SaveAnswer<T> {
  if (answer.ok) return { ok: true, value: answer.data[key] };
  return { ok: false, error: answer.error, current: answer.current as T | undefined };
}

export function loadSeason(season: number | "live") {
  return call<EditorSeason>("GET", seasonPath(season));
}

export async function saveTeamDetails(
  season: number,
  team: TeamId,
  details: TeamDetails,
  rev: number,
  force: boolean,
): Promise<SaveAnswer<EditorTeamDetails>> {
  const body = {
    rev,
    force,
    number: details.number,
    robot: { ...details.robot, image: details.robot.image && stripSrc(details.robot.image) },
  };
  return saveAnswer(await call("PATCH", `${seasonPath(season)}/teams/${team}`, body), "details");
}

export async function addSection(
  season: number,
  team: TeamId,
  title: string,
): Promise<SaveAnswer<EditorSection>> {
  return saveAnswer(await call("POST", `${seasonPath(season)}/sections`, { team, title }), "section");
}

export async function saveSection(
  season: number,
  id: string,
  section: SectionContent,
  rev: number,
  force: boolean,
): Promise<SaveAnswer<EditorSection>> {
  const body = {
    rev,
    force,
    title: section.title,
    intro: section.intro,
    entries: section.entries.map((entry) => ({ ...entry, images: entry.images.map(stripSrc) })),
  };
  return saveAnswer(
    await call("PATCH", `${seasonPath(season)}/sections/${encodeURIComponent(id)}`, body),
    "section",
  );
}

export function deleteSection(season: number, id: string) {
  return call<unknown>("DELETE", `${seasonPath(season)}/sections/${encodeURIComponent(id)}`);
}

export function orderSections(season: number, team: TeamId, order: string[]) {
  return call<unknown>("PUT", `${seasonPath(season)}/teams/${team}/order`, { order });
}

export async function saveSponsors(
  season: number,
  list: EditorSponsor[],
  rev: number,
  force: boolean,
): Promise<SaveAnswer<EditorSponsors>> {
  const sponsors = list.map((sponsor) => ({
    ...sponsor,
    logo: sponsor.logo && stripSrc(sponsor.logo),
  }));
  return saveAnswer(
    await call("PUT", `${seasonPath(season)}/sponsors`, { rev, force, sponsors }),
    "sponsors",
  );
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

/** The server makes src itself; only the file name is saved */
function stripSrc({ file, alt, caption }: EditorImage) {
  return { file, alt, caption };
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

/** Uploads one picture. Its alt text and caption start empty */
export async function uploadImage(file: File): Promise<{ ok: true; image: EditorImage } | { ok: false; error: string }> {
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
    return { ok: true, image: { file: data.file, src: data.src, alt: "", caption: "" } };
  } catch {
    return { ok: false, error: `${file.name}: ${OFFLINE}` };
  }
}
