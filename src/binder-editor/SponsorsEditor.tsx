import * as api from "./api";
import type { EditorSponsor, EditorSponsors } from "./api";
import { SinglePicture } from "./Pictures";
import {
  MoveButtons,
  RemoveButton,
  SaveBar,
  cardClass,
  hintClass,
  inputBaseClass,
  moved,
  secondaryButtonClass,
  sectionLabelClass,
  usePart,
} from "./ui";

/*
 * The sponsors under both teams' binders: a name, an optional link, and an
 * optional logo (without one, the name shows).
 */

const MAX_SPONSORS = 80;

function pickList(saved: EditorSponsors): { list: EditorSponsor[] } {
  return { list: saved.list };
}

export function SponsorsEditor({
  season,
  sponsors,
  onSaved,
}: {
  season: number;
  sponsors: EditorSponsors;
  onSaved: (sponsors: EditorSponsors) => void;
}) {
  const part = usePart(
    `${season}-sponsors`,
    sponsors,
    (draft, rev, force) => api.saveSponsors(season, draft.list, rev, force),
    onSaved,
    pickList,
  );
  const list = part.draft.list;
  const setList = (update: (list: EditorSponsor[]) => EditorSponsor[]) =>
    part.setDraft((d) => ({ list: update(d.list) }));
  const updateSponsor = (id: string, change: Partial<EditorSponsor>) =>
    setList((l) => l.map((s) => (s.id === id ? { ...s, ...change } : s)));

  return (
    <section className="space-y-3" aria-labelledby="sponsors-title">
      <div className="space-y-1">
        <h2 id="sponsors-title" className={sectionLabelClass}>
          Sponsors
        </h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Shown under both teams' binders, in this order.
        </p>
      </div>
      <div className={`${cardClass} space-y-4`}>
        {list.length === 0 && <p className={hintClass}>No sponsors yet.</p>}
        <ol className="space-y-3">
          {list.map((sponsor, index) => (
            <li
              key={sponsor.id}
              className="space-y-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${inputBaseClass} min-w-40 flex-1`}
                  value={sponsor.name}
                  onChange={(event) => updateSponsor(sponsor.id, { name: event.target.value })}
                  placeholder="Name"
                  aria-label={`Sponsor ${index + 1}'s name`}
                  maxLength={80}
                />
                <input
                  className={`${inputBaseClass} min-w-40 flex-1`}
                  value={sponsor.url}
                  onChange={(event) => updateSponsor(sponsor.id, { url: event.target.value })}
                  placeholder="Their website (optional)"
                  aria-label={`Sponsor ${index + 1}'s website`}
                  inputMode="url"
                  maxLength={500}
                />
                <div className="flex gap-1.5">
                  <MoveButtons
                    index={index}
                    count={list.length}
                    name={sponsor.name || `sponsor ${index + 1}`}
                    onMove={(from, to) => setList((l) => moved(l, from, to))}
                  />
                  <RemoveButton
                    name={sponsor.name || `sponsor ${index + 1}`}
                    onRemove={() => setList((l) => l.filter((s) => s.id !== sponsor.id))}
                  />
                </div>
              </div>
              <SinglePicture
                image={sponsor.logo}
                onChange={(logo) => updateSponsor(sponsor.id, { logo })}
                label="Logo"
              />
            </li>
          ))}
        </ol>
        {list.length < MAX_SPONSORS && (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              setList((l) => [
                ...l,
                { id: crypto.randomUUID().slice(0, 8), name: "", url: "", logo: null },
              ])
            }
          >
            Add a sponsor
          </button>
        )}
        <SaveBar part={part} savedBy={sponsors} />
      </div>
    </section>
  );
}
