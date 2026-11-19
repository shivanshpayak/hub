import { useEffect, useRef, useState, type ReactNode } from "react";
import { FOOTER_MAX_LINKS, imageSrc, TEAM_NAMES, type FooterContent } from "../binder/content";
import { siteName } from "../binder/Footer";
import * as api from "./api";
import type { EditorFooter, EditorSeason, EditorSponsor, EditorSponsors } from "./api";

/*
 * The editor's dialogs: the sponsors list (shared by both teams), the footer
 * (shared by both teams and every season) and the seasons.
 */

function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="be-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="be-dialog-head">
        <h2>{title}</h2>
        <button type="button" className="be-button be-quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="be-dialog-body">{children}</div>
      {footer && <div className="be-dialog-foot">{footer}</div>}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Sponsors                                                          */
/* ------------------------------------------------------------------ */

export function SponsorsDialog({
  season,
  sponsors,
  onSaved,
  onClose,
}: {
  season: number;
  sponsors: EditorSponsors;
  onSaved: (sponsors: EditorSponsors) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<EditorSponsor[]>(sponsors.list);
  const [base, setBase] = useState(sponsors);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<EditorSponsors | null>(null);
  const changed = JSON.stringify(list) !== JSON.stringify(base.list);

  const update = (id: string, patch: Partial<EditorSponsor>) =>
    setList((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (index: number, to: number) =>
    setList((l) => {
      if (to < 0 || to >= l.length) return l;
      const next = [...l];
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item);
      return next;
    });

  async function save(force: boolean) {
    setBusy("Saving…");
    setError(null);
    const answer = await api.saveSponsors(season, list, base.rev, force);
    setBusy(null);
    if (answer.ok) {
      setBase(answer.data.sponsors);
      setList(answer.data.sponsors.list);
      setTheirs(null);
      onSaved(answer.data.sponsors);
      return;
    }
    setError(answer.error);
    setTheirs((answer.data?.current as EditorSponsors | undefined) ?? null);
  }

  async function addLogo(id: string) {
    const [file] = await api.chooseFiles(false);
    if (!file) return;
    setBusy("Uploading…");
    const answer = await api.uploadImage(file);
    setBusy(null);
    if (answer.ok) update(id, { logo: answer.image });
    else setError(answer.error);
  }

  const close = () => {
    if (!changed || window.confirm("The sponsors list has changes that aren't saved. Close without saving them?")) {
      onClose();
    }
  };

  return (
    <Dialog
      title="Sponsors"
      onClose={close}
      footer={
        <>
          <p className="be-hint">
            Shared by both teams. Saved changes go up with the next Publish of either team's page.
          </p>
          <button
            type="button"
            className="be-button be-primary"
            disabled={!changed || busy !== null}
            onClick={() => void save(false)}
          >
            {busy ?? "Save"}
          </button>
        </>
      }
    >
      {error && (
        <div className="be-alert" role="alert">
          <p>{error}</p>
          {theirs && (
            <p className="be-row">
              <button
                type="button"
                className="be-button"
                onClick={() => {
                  setBase(theirs);
                  setList(theirs.list);
                  setTheirs(null);
                  setError(null);
                  onSaved(theirs);
                }}
              >
                Load their list
              </button>
              <button type="button" className="be-button be-danger" onClick={() => void save(true)}>
                Save mine over it
              </button>
            </p>
          )}
        </div>
      )}
      {list.length === 0 && <p className="be-hint">No sponsors yet.</p>}
      <ol className="be-sponsor-rows">
        {list.map((sponsor, index) => (
          <li key={sponsor.id} className="be-sponsor-row">
            <div className="be-sponsor-logo">
              {sponsor.logo ? (
                <img src={imageSrc(sponsor.logo.file)} alt="" />
              ) : (
                <span className="be-hint">No logo</span>
              )}
            </div>
            <div className="be-sponsor-fields">
              <input
                className="be-input"
                value={sponsor.name}
                placeholder="Name"
                aria-label={`Sponsor ${index + 1}'s name`}
                maxLength={80}
                onChange={(event) => update(sponsor.id, { name: event.target.value })}
              />
              <input
                className="be-input"
                value={sponsor.url}
                placeholder="Their website (optional)"
                aria-label={`Sponsor ${index + 1}'s website`}
                inputMode="url"
                maxLength={500}
                onChange={(event) => update(sponsor.id, { url: event.target.value })}
              />
              <p className="be-row">
                <button type="button" className="be-button be-small" onClick={() => void addLogo(sponsor.id)}>
                  {sponsor.logo ? "Replace logo" : "Add logo"}
                </button>
                {sponsor.logo && (
                  <button type="button" className="be-button be-small" onClick={() => update(sponsor.id, { logo: null })}>
                    Remove logo
                  </button>
                )}
              </p>
            </div>
            <div className="be-sponsor-moves">
              <button type="button" className="be-button be-small" disabled={index === 0} aria-label="Move up" onClick={() => move(index, index - 1)}>
                ↑
              </button>
              <button type="button" className="be-button be-small" disabled={index === list.length - 1} aria-label="Move down" onClick={() => move(index, index + 1)}>
                ↓
              </button>
              <button
                type="button"
                className="be-button be-small be-danger"
                onClick={() => setList((l) => l.filter((s) => s.id !== sponsor.id))}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      {list.length < 80 && (
        <button
          type="button"
          className="be-button"
          onClick={() =>
            setList((l) => [...l, { id: crypto.randomUUID().slice(0, 8), name: "", url: "", logo: null }])
          }
        >
          Add a sponsor
        </button>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  The footer                                                        */
/* ------------------------------------------------------------------ */

/** A link being edited, with a key that stays put while rows move */
type LinkRow = { key: string; label: string; url: string };

const toRows = (footer: FooterContent): LinkRow[] =>
  footer.links.map((link) => ({ key: crypto.randomUUID(), ...link }));

export function FooterDialog({
  footer,
  onSaved,
  onClose,
}: {
  footer: EditorFooter;
  onSaved: (footer: EditorFooter) => void;
  onClose: () => void;
}) {
  const [base, setBase] = useState(footer);
  const [line, setLine] = useState(footer.draft.line);
  const [email, setEmail] = useState(footer.draft.email);
  const [rows, setRows] = useState<LinkRow[]>(() => toRows(footer.draft));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<EditorFooter | null>(null);

  const current: FooterContent = {
    line,
    email,
    links: rows.map(({ label, url }) => ({ label, url })),
  };
  const changed = JSON.stringify(current) !== JSON.stringify(base.draft);

  const load = (next: EditorFooter) => {
    setBase(next);
    setLine(next.draft.line);
    setEmail(next.draft.email);
    setRows(toRows(next.draft));
  };
  const update = (key: string, patch: Partial<LinkRow>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index: number, to: number) =>
    setRows((r) => {
      if (to < 0 || to >= r.length) return r;
      const next = [...r];
      const [row] = next.splice(index, 1);
      next.splice(to, 0, row);
      return next;
    });

  async function save(force: boolean) {
    setBusy("Saving…");
    setError(null);
    const answer = await api.saveFooter(current, base.rev, force);
    setBusy(null);
    if (answer.ok) {
      load(answer.data.footer);
      setTheirs(null);
      onSaved(answer.data.footer);
      return;
    }
    setError(answer.error);
    setTheirs((answer.data?.current as EditorFooter | undefined) ?? null);
  }

  const close = () => {
    if (!changed || window.confirm("The footer has changes that aren't saved. Close without saving them?")) {
      onClose();
    }
  };

  return (
    <Dialog
      title="Footer"
      onClose={close}
      footer={
        <>
          <p className="be-hint">
            Under both teams' pages, in every season. Saved changes go up with the next Publish of either
            team's page.
          </p>
          <button
            type="button"
            className="be-button be-primary"
            disabled={!changed || busy !== null}
            onClick={() => void save(false)}
          >
            {busy ?? "Save"}
          </button>
        </>
      }
    >
      {error && (
        <div className="be-alert" role="alert">
          <p>{error}</p>
          {theirs && (
            <p className="be-row">
              <button
                type="button"
                className="be-button"
                onClick={() => {
                  load(theirs);
                  setTheirs(null);
                  setError(null);
                  onSaved(theirs);
                }}
              >
                Load theirs
              </button>
              <button type="button" className="be-button be-danger" onClick={() => void save(true)}>
                Save mine over it
              </button>
            </p>
          )}
        </div>
      )}

      <label className="be-field">
        <span>Line about the team</span>
        <input
          className="be-input"
          value={line}
          placeholder="Lambert Robotics, Lambert High School"
          maxLength={200}
          onChange={(event) => setLine(event.target.value)}
        />
      </label>
      <p className="be-hint">The team numbers go under it on their own.</p>

      <label className="be-field">
        <span>Contact email</span>
        <input
          className="be-input"
          type="email"
          inputMode="email"
          value={email}
          placeholder="team@example.com (optional)"
          maxLength={200}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <h3 className="be-dialog-subhead">Links</h3>
      <p className="be-hint">
        Social media, The Blue Alliance, anything else. Leave a name empty to use the site's own, like
        Instagram.
      </p>
      <ol className="be-sponsor-rows">
        {rows.map((row, index) => (
          <li key={row.key} className="be-sponsor-row be-link-row">
            <div className="be-sponsor-fields">
              <input
                className="be-input"
                value={row.url}
                placeholder="Address, like instagram.com/yourteam"
                aria-label={`Link ${index + 1}'s address`}
                inputMode="url"
                maxLength={500}
                onChange={(event) => update(row.key, { url: event.target.value })}
              />
              <input
                className="be-input"
                value={row.label}
                placeholder={row.url.trim() ? `Name (${siteName(row.url.trim())})` : "Name (optional)"}
                aria-label={`Link ${index + 1}'s name`}
                maxLength={40}
                onChange={(event) => update(row.key, { label: event.target.value })}
              />
            </div>
            <div className="be-sponsor-moves">
              <button type="button" className="be-button be-small" disabled={index === 0} aria-label="Move up" onClick={() => move(index, index - 1)}>
                ↑
              </button>
              <button type="button" className="be-button be-small" disabled={index === rows.length - 1} aria-label="Move down" onClick={() => move(index, index + 1)}>
                ↓
              </button>
              <button
                type="button"
                className="be-button be-small be-danger"
                onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      {rows.length < FOOTER_MAX_LINKS && (
        <button
          type="button"
          className="be-button"
          onClick={() => setRows((r) => [...r, { key: crypto.randomUUID(), label: "", url: "" }])}
        >
          Add a link
        </button>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Seasons                                                           */
/* ------------------------------------------------------------------ */

const STATE_LABELS = { live: "Live", past: "Past season", draft: "Not live yet" } as const;

export function SeasonsDialog({
  data,
  onOpen,
  onChanged,
  onClose,
}: {
  data: EditorSeason;
  /** Opens a season in the editor */
  onOpen: (season: number) => void;
  /** Seasons changed: open this one fresh */
  onChanged: (season: number | "live") => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newest = data.seasons[0]?.season ?? data.liveSeason;
  const draftExists = newest > data.liveSeason;
  const next = newest + 1;

  async function act<T>(run: () => Promise<api.Answer<T>>, then: (data: T) => number | "live") {
    setBusy(true);
    setError(null);
    const answer = await run();
    setBusy(false);
    if (answer.ok) onChanged(then(answer.data));
    else setError(answer.error);
  }

  return (
    <Dialog title="Seasons" onClose={onClose}>
      <p className="be-hint">
        The live season is the front page. Older ones stay under Past seasons for anyone to see.
      </p>
      {error && (
        <p className="be-alert" role="alert">
          {error}
        </p>
      )}
      <ul className="be-season-rows">
        {data.seasons.map(({ season, state }) => (
          <li key={season} className="be-season-row">
            <strong>{season}</strong>
            <span className={`be-badge be-badge-${state}`}>{STATE_LABELS[state]}</span>
            <span className="be-row be-push">
              {season !== data.season && (
                <button type="button" className="be-button be-small" onClick={() => onOpen(season)}>
                  Edit
                </button>
              )}
              {state !== "live" && (
                <button
                  type="button"
                  className={`be-button be-small${state === "draft" ? " be-primary" : ""}`}
                  disabled={busy}
                  onClick={() => {
                    const older = season < data.liveSeason;
                    const sure = window.confirm(
                      older
                        ? `Put ${season} back on the front page? ${data.liveSeason} goes back to not being live.`
                        : `Put ${season} on the front page? ${data.liveSeason} moves to Past seasons.`,
                    );
                    if (sure) void act(() => api.makeLive(season), () => season);
                  }}
                >
                  Make live
                </button>
              )}
              {state === "draft" && (
                <button
                  type="button"
                  className="be-button be-small be-danger"
                  disabled={busy}
                  onClick={() => {
                    const sure = window.confirm(
                      `Delete the ${season} season and both its pages? This can't be undone.`,
                    );
                    if (sure) void act(() => api.deleteSeason(season), () => "live");
                  }}
                >
                  Delete
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="be-dialog-subhead">
        {draftExists ? "Next season" : `Start the ${next} season`}
      </h3>
      {draftExists ? (
        <p className="be-hint">
          {newest} is being made. Make it live or delete it before starting another.
        </p>
      ) : (
        <>
          <p className="be-hint">
            {next} starts hidden, so both pages can be made while {data.liveSeason} stays up. Publish{" "}
            {TEAM_NAMES.lambda}'s and {TEAM_NAMES.gamma}'s pages, then make it live, and {data.liveSeason}{" "}
            moves to Past seasons.
          </p>
          <p className="be-row">
            <button
              type="button"
              className="be-button be-primary"
              disabled={busy}
              onClick={() => void act(() => api.startSeason("outline"), (made) => made.season)}
            >
              Start from {data.liveSeason}'s outline
            </button>
            <button
              type="button"
              className="be-button"
              disabled={busy}
              onClick={() => void act(() => api.startSeason("copy"), (made) => made.season)}
            >
              Copy everything from {data.liveSeason}
            </button>
          </p>
          <p className="be-hint">
            The outline keeps the titles, headings, stat names and sponsors, without cards, pictures
            or text. A full copy keeps all of it to change.
          </p>
        </>
      )}
    </Dialog>
  );
}
