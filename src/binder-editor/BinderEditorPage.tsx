import { useEffect, useReducer, useRef, useState } from "react";
import "./editor.css";
import { TopBar } from "../TopBar";
import { hubPath } from "../paths";
import { LambertLogo } from "../binder/LambertLogo";
import { Canvas, type CanvasEditor } from "../binder/Canvas";
import { BinderFooter, initialTeam, pageContents, rememberTeam } from "../binder/BinderPage";
import {
  TEAM_IDS,
  TEAM_NAMES,
  type PageContent,
  type PageElement,
  type PageImage,
  type Sponsor,
  type TeamId,
} from "../binder/content";
import { CANVAS_WIDTH } from "../binder/layout";
import { PLAIN_THEME, useLook } from "../binder/look";
import * as api from "./api";
import { ElementToolbar, defaultSize, type ToolbarActions } from "./ElementToolbar";
import { SeasonsDialog, SponsorsDialog } from "./Dialogs";
import { LookPanel } from "./LookPanel";

/*
 * Edit Binder: the front page itself, made editable. Click something to
 * pick it, drag it (or its handles) to move or resize it, double click to
 * type into it. Add puts new things where you're looking. Changes save as a
 * draft on their own; Publish puts the page up for visitors.
 *
 * One person edits a team's page at a time (the server keeps a lock, which
 * this page renews every 30 seconds). Who can open it is the "hub:binder"
 * row in ManuQueue's permissions.ts, which the server checks on every save.
 */

type LockState =
  | { kind: "checking" }
  | { kind: "mine" }
  | { kind: "held"; by: string }
  | { kind: "lost"; message: string };

type SaveStatus = "saved" | "waiting" | "saving" | "error" | "refused";
type View = "edit" | "preview" | "phone";
type History = { past: PageContent[]; future: PageContent[] };

const HISTORY_LIMIT = 100;

/** ?season= in the address, or the live season */
function seasonFromAddress(): number | "live" {
  const raw = new URLSearchParams(window.location.search).get("season");
  return raw && /^\d{4}$/.test(raw) ? Number(raw) : "live";
}

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Something new to put on the page, `w` by `h`, before it's placed */
function newElement(kind: AddKind, team: TeamId): PageElement {
  const right = team === "gamma";
  const align = right ? ("right" as const) : ("left" as const);
  const base = { id: newId(), x: 0, y: 0 };
  switch (kind) {
    case "heading":
      return {
        ...base,
        type: "text",
        variant: "heading",
        text: "",
        kicker: "",
        size: defaultSize("heading", team),
        align,
        numbered: true,
        w: CANVAS_WIDTH,
        h: 90,
      };
    case "text":
      return {
        ...base,
        type: "text",
        variant: "body",
        text: "",
        kicker: "",
        size: defaultSize("body", team),
        align,
        numbered: false,
        w: 560,
        h: 60,
      };
    case "card":
      return {
        ...base,
        type: "card",
        title: "",
        text: "",
        features: [],
        images: [],
        imagePlace: "below",
        imageSize: "medium",
        w: 550,
        h: 220,
      };
    case "picture":
      return { ...base, type: "image", image: null, fit: "contain", frame: false, w: 420, h: 300 };
    case "stats":
      return {
        ...base,
        type: "stats",
        stats: [
          { label: "", value: "" },
          { label: "", value: "" },
        ],
        w: CANVAS_WIDTH,
        h: 80,
      };
    case "sponsors":
      return {
        ...base,
        type: "sponsors",
        title: "Our sponsors",
        text: "",
        w: CANVAS_WIDTH,
        h: 220,
      };
  }
}

type AddKind = "heading" | "text" | "card" | "picture" | "stats" | "sponsors";

const ADD_MENU: { kind: AddKind; label: string; hint: string }[] = [
  { kind: "heading", label: "Heading", hint: "A numbered section, linked in the top bar" },
  { kind: "text", label: "Text", hint: "A paragraph" },
  { kind: "card", label: "Card", hint: "A topic with text, features and pictures" },
  { kind: "picture", label: "Picture", hint: "A photo or CAD render" },
  { kind: "stats", label: "Stats", hint: "Quick facts in a row" },
  { kind: "sponsors", label: "Sponsors", hint: "The sponsors list" },
];

/** Where the middle of the screen is on the canvas, for a new thing */
function visibleSpot(w: number, h: number) {
  const frame = document.querySelector<HTMLElement>(".bp-frame");
  if (!frame) return { x: Math.round((CANVAS_WIDTH - w) / 2), y: 0 };
  const rect = frame.getBoundingClientRect();
  const scale = Math.min(1, rect.width / CANVAS_WIDTH);
  const y = (window.innerHeight / 2 - rect.top) / scale - h / 2;
  return { x: Math.round((CANVAS_WIDTH - w) / 2), y: Math.max(0, Math.round(y)) };
}

function emptyHistory(): Record<TeamId, History> {
  return { lambda: { past: [], future: [] }, gamma: { past: [], future: [] } };
}

export function BinderEditorPage() {
  const [season, setSeason] = useState<number | "live">(seasonFromAddress);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<api.EditorSeason | null>(null);
  const [problem, setProblem] = useState<{ status: number; error: string } | null>(null);
  const [team, setTeam] = useState<TeamId>(initialTeam);
  const [lock, setLock] = useState<LockState>({ kind: "checking" });
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<View>("edit");
  const [dialog, setDialog] = useState<"sponsors" | "seasons" | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [, render] = useReducer((n: number) => n + 1, 0);

  // Both pages as they are on screen, their Undo history, and what's saved
  const pages = useRef<Record<TeamId, PageContent> | null>(null);
  const undoHistory = useRef<Record<TeamId, History>>(emptyHistory());
  const saved = useRef<Record<TeamId, { rev: number; json: string }>>({
    lambda: { rev: 0, json: "" },
    gamma: { rev: 0, json: "" },
  });
  // Changes made by people (not by measuring), counted, and how many of
  // them the last save included
  const edits = useRef<Record<TeamId, number>>({ lambda: 0, gamma: 0 });
  const editsSaved = useRef<Record<TeamId, number>>({ lambda: 0, gamma: 0 });
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  // The latest of these, for timers and listeners
  const dataRef = useRef(data);
  const teamRef = useRef(team);
  const lockRef = useRef(lock);
  dataRef.current = data;
  teamRef.current = team;
  lockRef.current = lock;

  const page = pages.current?.[team] ?? null;
  const canEdit = lock.kind === "mine" && view === "edit";
  const { look, style: lookStyle } = useLook(page?.theme, team);


  /* ---------------- Loading a season ---------------- */

  useEffect(() => {
    let cancelled = false;
    void api.loadSeason(season).then((answer) => {
      if (cancelled) return;
      if (!answer.ok) {
        setProblem({ status: answer.status, error: answer.error });
        return;
      }
      const loaded = answer.data;
      pages.current = { lambda: loaded.pages.lambda.draft, gamma: loaded.pages.gamma.draft };
      saved.current = {
        lambda: { rev: loaded.pages.lambda.rev, json: JSON.stringify(loaded.pages.lambda.draft) },
        gamma: { rev: loaded.pages.gamma.rev, json: JSON.stringify(loaded.pages.gamma.draft) },
      };
      undoHistory.current = emptyHistory();
      setProblem(null);
      setStatus("saved");
      setData(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [season, attempt]);

  /* ---------------- Holding the page ---------------- */

  const loadedSeason = data?.season;
  useEffect(() => {
    if (loadedSeason === undefined) return;
    let cancelled = false;
    setLock({ kind: "checking" });
    const take = async (takeOver = false) => {
      const answer = await api.lockPage(loadedSeason, team, takeOver);
      if (cancelled) return;
      if (answer.ok) setLock({ kind: "mine" });
      else if (answer.status === 423) {
        const by = String(answer.data?.heldBy ?? "Someone else");
        setLock(
          lockRef.current.kind === "mine"
            ? { kind: "lost", message: `${by} took over editing this page.` }
            : { kind: "held", by },
        );
      } else if (answer.status !== 0) setLock({ kind: "lost", message: answer.error });
    };
    void take();
    const beat = window.setInterval(() => {
      if (lockRef.current.kind === "mine") void take();
    }, 30_000);
    const leave = () => void api.unlockPage(loadedSeason, team);
    window.addEventListener("pagehide", leave);
    return () => {
      cancelled = true;
      window.clearInterval(beat);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [loadedSeason, team]);

  /* ---------------- Saving ---------------- */

  function hasUnsaved(): boolean {
    if (!pages.current) return false;
    return TEAM_IDS.some((t) => JSON.stringify(pages.current![t]) !== saved.current[t].json);
  }

  function scheduleSave(delay = 1000) {
    window.clearTimeout(timer.current);
    if (delay < 5000) setStatus("waiting");
    timer.current = window.setTimeout(() => void flush(), delay);
  }

  /** Saves the open page's draft now, if it changed. False if it couldn't */
  async function flush(): Promise<boolean> {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const current = dataRef.current;
    const t = teamRef.current;
    if (!current || !pages.current || lockRef.current.kind !== "mine") return !hasUnsaved();
    const sending = pages.current[t];
    const json = JSON.stringify(sending);
    if (json === saved.current[t].json) {
      setStatus("saved");
      return true;
    }
    setStatus("saving");
    const editCount = edits.current[t];
    const settled = editCount === editsSaved.current[t];
    const run = (async () => {
      const answer = await api.savePage(current.season, t, sending, saved.current[t].rev, settled);
      if (answer.ok) {
        saved.current[t] = { rev: answer.data.rev, json };
        editsSaved.current[t] = editCount;
        setData((d) =>
          d && {
            ...d,
            pages: {
              ...d.pages,
              [t]: {
                ...d.pages[t],
                rev: answer.data.rev,
                updatedAt: answer.data.updatedAt,
                publishedRev: answer.data.publishedRev,
              },
            },
          },
        );
        return true;
      }
      if (answer.status === 409 || answer.status === 423 || answer.status === 404) {
        setLock({ kind: "lost", message: answer.error });
        return false;
      }
      if (answer.status === 400) {
        // Something on the page the server won't take: say what
        setStatus("refused");
        setToast({ text: answer.error, tone: "error" });
      } else {
        setStatus("error");
        scheduleSave(5000);
      }
      return false;
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    if (ok) {
      if (JSON.stringify(pages.current?.[t]) !== saved.current[t].json) scheduleSave();
      else setStatus("saved");
    }
    return ok;
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsaved() && !inFlight.current) return;
      void flush();
      event.preventDefault();
      event.returnValue = "";
    };
    // A tab in the background has its timers slowed, so save as it goes
    const onHide = () => {
      if (document.hidden && hasUnsaved()) void flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
    };
  });

  /* ---------------- Changing the page ---------------- */

  /** Changes the open page. `remember`: a step for Undo */
  function setPage(update: (page: PageContent) => PageContent, remember = true) {
    if (!pages.current || lockRef.current.kind !== "mine") return;
    const t = teamRef.current;
    const before = pages.current[t];
    const after = update(before);
    if (after === before) return;
    if (remember) {
      edits.current[t] += 1;
      const h = undoHistory.current[t];
      h.past.push(before);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
    }
    pages.current = { ...pages.current, [t]: after };
    scheduleSave();
    render();
  }

  const updateElement = (id: string, patch: Partial<PageElement>) =>
    setPage((p) => ({
      ...p,
      elements: p.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as PageElement) : e)),
    }));

  function step(direction: "undo" | "redo") {
    if (!pages.current || lockRef.current.kind !== "mine") return;
    const h = undoHistory.current[team];
    const [from, to] = direction === "undo" ? [h.past, h.future] : [h.future, h.past];
    const target = from.pop();
    if (!target) return;
    to.push(pages.current[team]);
    edits.current[team] += 1;
    pages.current = { ...pages.current, [team]: target };
    setEditingId(null);
    scheduleSave();
    render();
  }

  function addElement(kind: AddKind) {
    setAddOpen(false);
    if (!page) return;
    const element = newElement(kind, team);
    const spot = visibleSpot(element.w, element.h);
    const placed = { ...element, ...spot } as PageElement;
    setPage((p) => ({ ...p, elements: [...p.elements, placed] }));
    setSelectedId(placed.id);
    if (placed.type === "image") void replaceImage(placed.id);
    else {
      setPoint(null);
      setEditingId(placed.id);
    }
  }

  function removeElement(id: string) {
    setPage((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) }));
    setSelectedId(null);
    setEditingId(null);
  }

  function duplicate(id: string) {
    const original = page?.elements.find((e) => e.id === id);
    if (!original) return;
    const copy = { ...original, id: newId(), x: Math.min(original.x + 24, CANVAS_WIDTH - original.w), y: original.y + 24 };
    setPage((p) => ({ ...p, elements: [...p.elements, copy] }));
    setSelectedId(copy.id);
  }

  function reorder(id: string, to: "front" | "back") {
    setPage((p) => {
      const element = p.elements.find((e) => e.id === id);
      if (!element) return p;
      const rest = p.elements.filter((e) => e.id !== id);
      return { ...p, elements: to === "front" ? [...rest, element] : [element, ...rest] };
    });
  }

  /** Asks for pictures and uploads them, saying how it's going */
  async function pickImages(multiple: boolean): Promise<PageImage[]> {
    const files = await api.chooseFiles(multiple);
    const images: PageImage[] = [];
    const problems: string[] = [];
    for (const [index, file] of files.entries()) {
      setBusy(files.length === 1 ? "Uploading…" : `Uploading ${index + 1} of ${files.length}…`);
      const answer = await api.uploadImage(file);
      if (answer.ok) images.push(answer.image);
      else problems.push(answer.error);
    }
    setBusy(null);
    if (problems.length > 0) setToast({ text: problems.join(" "), tone: "error" });
    return images;
  }

  async function replaceImage(id: string) {
    const [image] = await pickImages(false);
    if (!image) return;
    const old = page?.elements.find((e) => e.id === id);
    const keep = old?.type === "image" && old.image ? { alt: old.image.alt, caption: old.image.caption } : {};
    updateElement(id, { image: { ...image, ...keep } } as Partial<PageElement>);
  }

  /** Stops typing, saving what was typed (it saves when the cursor leaves) */
  function close() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".bp-frame")) active.blur();
    setEditingId(null);
    setPoint(null);
  }

  function openElement(id: string, at: { x: number; y: number } | null) {
    const element = page?.elements.find((e) => e.id === id);
    if (!element) return;
    setSelectedId(id);
    if (element.type === "image" && !element.image) {
      void replaceImage(id);
      return;
    }
    setPoint(at);
    setEditingId(id);
  }

  /* ---------------- Teams, seasons and publishing ---------------- */

  async function switchTeam(next: TeamId) {
    if (next === team) return;
    close();
    setSelectedId(null);
    await flush();
    rememberTeam(next);
    setTeam(next);
  }

  async function openSeason(next: number | "live") {
    close();
    setDialog(null);
    const ok = await flush();
    if (!ok && hasUnsaved() && !window.confirm("Some changes couldn't be saved. Leave them?")) return;
    const url = new URL(window.location.href);
    if (next === "live") url.searchParams.delete("season");
    else url.searchParams.set("season", String(next));
    history.replaceState(history.state, "", url);
    pages.current = null;
    setSelectedId(null);
    setData(null);
    setProblem(null);
    setSeason(next);
    setAttempt((n) => n + 1);
  }

  async function takeOver() {
    if (!data) return;
    const answer = await api.lockPage(data.season, team, true);
    if (!answer.ok) {
      setToast({ text: answer.error, tone: "error" });
      return;
    }
    setLock({ kind: "mine" });
    // Their last saved draft
    setAttempt((n) => n + 1);
  }

  async function publish() {
    if (!data) return;
    close();
    setBusy("Publishing…");
    const ok = await flush();
    if (!ok) {
      setBusy(null);
      setToast({ text: "Couldn't save the latest changes, so nothing was published. Try again.", tone: "error" });
      return;
    }
    const answer = await api.publishPage(data.season, team, saved.current[team].rev);
    setBusy(null);
    if (!answer.ok) {
      setToast({ text: answer.error, tone: "error" });
      return;
    }
    setData((d) =>
      d && {
        ...d,
        pages: {
          ...d.pages,
          [team]: { ...d.pages[team], publishedRev: answer.data.publishedRev, publishedAt: answer.data.publishedAt },
        },
        // The sponsors went up with it
        sponsors: { ...d.sponsors, unpublished: false },
      },
    );
    setToast({
      tone: "ok",
      text:
        data.state === "draft"
          ? `${TEAM_NAMES[team]}'s page is published. Visitors see it once ${data.season} is made live.`
          : `${TEAM_NAMES[team]}'s page is up. Visitors see it now.`,
    });
  }

  /* ---------------- Keys ---------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (view !== "edit" || dialog || !page) return;
      const target = event.target as HTMLElement;
      const typing =
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        if (editingId) close();
        else setSelectedId(null);
        return;
      }
      if (typing) return;
      const key = event.key.toLowerCase();
      // Not the whole page's text
      if (mod && key === "a") {
        event.preventDefault();
        return;
      }
      if (mod && key === "z") {
        event.preventDefault();
        step(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        step("redo");
        return;
      }
      const selected = selectedId ? page.elements.find((e) => e.id === selectedId) : undefined;
      if (!selected) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeElement(selected.id);
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicate(selected.id);
      } else if (event.key === "Enter") {
        event.preventDefault();
        openElement(selected.id, null);
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const by = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -by : event.key === "ArrowRight" ? by : 0;
        const dy = event.key === "ArrowUp" ? -by : event.key === "ArrowDown" ? by : 0;
        updateElement(selected.id, {
          x: Math.max(0, Math.min(CANVAS_WIDTH - selected.w, selected.x + dx)),
          y: Math.max(0, selected.y + dy),
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // A click anywhere off the page's things (its margins, the logo) closes
  // what's open and lets go of what's picked, like a click on the canvas
  useEffect(() => {
    if (!editingId && !selectedId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".bp-frame, .be-bar, .be-dialog, .be-drawer, .be-notice, .be-toast, .hub-top-bar")) return;
      close();
      setSelectedId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  useEffect(() => {
    if (!toast) return;
    const hide = window.setTimeout(() => setToast(null), toast.tone === "error" ? 8000 : 4000);
    return () => window.clearTimeout(hide);
  }, [toast]);

  /* ---------------- Drawing ---------------- */

  const sponsors: Sponsor[] = (data?.sponsors.list ?? []).map(({ name, url, logo }) => ({ name, url, logo }));

  const actionsFor = (element: PageElement): ToolbarActions => ({
    team,
    update: (patch) => updateElement(element.id, patch),
    remove: () => removeElement(element.id),
    duplicate: () => duplicate(element.id),
    front: () => reorder(element.id, "front"),
    back: () => reorder(element.id, "back"),
    open: () => openElement(element.id, null),
    replaceImage: () => void replaceImage(element.id),
    editSponsors: () => setDialog("sponsors"),
  });

  const canvasEditor: CanvasEditor = {
    selectedId,
    editingId,
    point,
    select: setSelectedId,
    open: openElement,
    close,
    place: (id, place) => updateElement(id, place),
    change: (id, patch) => updateElement(id, patch),
    settle: (places) =>
      setPage(
        (p) => ({
          ...p,
          elements: p.elements.map((e) => {
            const placeNow = places.get(e.id);
            return placeNow ? { ...e, ...placeNow } : e;
          }),
        }),
        false,
      ),
    pickImages,
    editSponsors: () => setDialog("sponsors"),
    toolbar: (element) => <ElementToolbar element={element} actions={actionsFor(element)} />,
    room: 360,
  };

  const meta = data?.pages[team];
  const unpublished =
    status !== "saved" ||
    (meta ? saved.current[team].rev !== meta.publishedRev : false) ||
    Boolean(data?.sponsors.unpublished);
  const h = undoHistory.current[team];

  return (
    <>
      <TopBar contents={pageContents(page)} />
      <div className={`binder be-editor be-view-${view}`} data-look={look} style={lookStyle}>
        <div className="binder-wrap binder-logo-wrap">
          <LambertLogo
            team={team}
            onPick={(next) => void switchTeam(next)}
            numbers={pages.current ? { lambda: pages.current.lambda.number, gamma: pages.current.gamma.number } : undefined}
          />
        </div>

        <main className="binder-wrap binder-main">
          {problem ? (
            <div className="be-problem" role="alert">
              <p>{problem.error}</p>
              {problem.status === 404 ? (
                <button type="button" className="be-button" onClick={() => void openSeason("live")}>
                  Open the live season
                </button>
              ) : problem.status !== 403 ? (
                <button type="button" className="be-button" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : !data || !page ? (
            <p className="be-loading" aria-busy="true">
              Loading the binder…
            </p>
          ) : view === "phone" ? (
            <div className="be-phone">
              <Canvas page={page} sponsors={sponsors} stacked />
            </div>
          ) : (
            <Canvas page={page} sponsors={sponsors} editor={canEdit ? canvasEditor : undefined} />
          )}
        </main>

        <BinderFooter
          numbers={pages.current ? { lambda: pages.current.lambda.number, gamma: pages.current.gamma.number } : undefined}
        />
      </div>

      {data && page && (
        <div className="be-bar" role="toolbar" aria-label="Binder editor">
          <label className="be-bar-season">
            <span className="be-sr">Season</span>
            <select value={data.season} onChange={(event) => void openSeason(Number(event.target.value))}>
              {data.seasons.map(({ season: s, state }) => (
                <option key={s} value={s}>
                  {s}
                  {state === "live" ? " (live)" : state === "draft" ? " (not live yet)" : " (past)"}
                </option>
              ))}
            </select>
          </label>

          <div className="be-add">
            <button
              type="button"
              className="be-button be-primary"
              aria-expanded={addOpen}
              disabled={!canEdit}
              onClick={() => setAddOpen((o) => !o)}
            >
              Add
            </button>
            {addOpen && (
              <ul className="be-add-menu" role="menu">
                {ADD_MENU.filter((item) => item.kind !== "sponsors" || !page.elements.some((e) => e.type === "sponsors")).map((item) => (
                  <li key={item.kind} role="none">
                    <button type="button" role="menuitem" onClick={() => addElement(item.kind)}>
                      <strong>{item.label}</strong>
                      <span>{item.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="button" className="be-button" disabled={!canEdit || h.past.length === 0} onClick={() => step("undo")}>
            Undo
          </button>
          <button type="button" className="be-button" disabled={!canEdit || h.future.length === 0} onClick={() => step("redo")}>
            Redo
          </button>

          <div className="be-views" role="group" aria-label="View">
            {(["edit", "preview", "phone"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="be-button"
                aria-pressed={view === v}
                onClick={() => {
                  close();
                  setSelectedId(null);
                  setView(v);
                }}
              >
                {v === "edit" ? "Edit" : v === "preview" ? "Preview" : "Phone"}
              </button>
            ))}
          </div>

          <p className="be-status" aria-live="polite">
            {busy ??
              (lock.kind === "checking"
                ? "Opening…"
                : lock.kind !== "mine"
                  ? "Look only"
                  : status === "saving" || status === "waiting"
                    ? "Saving…"
                    : status === "error"
                      ? "Couldn't save. Trying again…"
                      : status === "refused"
                        ? "Couldn't save"
                        : "Saved")}
            {lock.kind === "mine" && (
              <span className={unpublished ? "be-dot be-dot-draft" : "be-dot"}>
                {unpublished ? "Not published yet" : "Published"}
              </span>
            )}
          </p>

          <span className="be-push" />
          <button
            type="button"
            className="be-button"
            aria-pressed={lookOpen}
            disabled={lock.kind !== "mine"}
            onClick={() => setLookOpen((o) => !o)}
          >
            Look
          </button>
          <button type="button" className="be-button" onClick={() => setDialog("sponsors")} disabled={lock.kind !== "mine"}>
            Sponsors
          </button>
          <button type="button" className="be-button" onClick={() => setDialog("seasons")}>
            Seasons
          </button>
          <a
            className="be-button"
            href={`${hubPath("/")}?team=${team}${data.state === "live" ? "" : `&season=${data.season}`}`}
            target="_blank"
            rel="noopener"
          >
            View page
          </a>
          <button
            type="button"
            className="be-button be-publish"
            disabled={lock.kind !== "mine" || busy !== null || !unpublished}
            onClick={() => void publish()}
          >
            Publish
          </button>
        </div>
      )}

      {data && lock.kind === "held" && (
        <div className="be-notice" role="alert">
          <p>
            <strong>{lock.by}</strong> is editing {TEAM_NAMES[team]}'s page. You can look, or take over
            if they've finished.
          </p>
          <button type="button" className="be-button be-primary" onClick={() => void takeOver()}>
            Take over
          </button>
        </div>
      )}
      {data && lock.kind === "lost" && (
        <div className="be-notice" role="alert">
          <p>{lock.message}</p>
          <button type="button" className="be-button be-primary" onClick={() => void takeOver()}>
            Take over
          </button>
        </div>
      )}

      {toast && (
        <p className={`be-toast be-toast-${toast.tone}`} role="status">
          {toast.text}
        </p>
      )}

      {lookOpen && page && lock.kind === "mine" && (
        <LookPanel
          theme={page.theme}
          team={team}
          onChange={(update, remember) =>
            setPage((p) => ({ ...p, theme: update(p.theme ?? PLAIN_THEME) }), remember)
          }
          pickImage={async () => (await pickImages(false))[0] ?? null}
          onClose={() => setLookOpen(false)}
        />
      )}

      {dialog === "sponsors" && data && (
        <SponsorsDialog
          season={data.season}
          sponsors={data.sponsors}
          onSaved={(next) => setData((d) => d && { ...d, sponsors: next })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "seasons" && data && (
        <SeasonsDialog
          data={data}
          onOpen={(s) => void openSeason(s)}
          onChanged={(s) => void openSeason(s)}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
