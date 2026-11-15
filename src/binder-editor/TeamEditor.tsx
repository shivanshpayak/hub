import { useState, type FormEvent } from "react";
import type { TeamId } from "../binder/content";
import * as api from "./api";
import type { EditorSection, EditorTeam, EditorTeamDetails, TeamDetails } from "./api";
import { SinglePicture } from "./Pictures";
import { SectionEditor } from "./SectionEditor";
import {
  Field,
  MoveButtons,
  RemoveButton,
  SaveBar,
  cardClass,
  hintClass,
  inputBaseClass,
  inputClass,
  moved,
  primaryButtonClass,
  secondaryButtonClass,
  sectionLabelClass,
  usePart,
} from "./ui";

/*
 * One team's binder in the editor: its number and robot, then its sections.
 */

const MAX_STATS = 8;

/** Changes the list from whatever it is by then, so two saves finishing
 *  close together don't undo each other */
export type SectionsUpdate = (sections: EditorSection[]) => EditorSection[];

export function TeamEditor({
  season,
  team,
  onDetailsSaved,
  onSectionsChanged,
}: {
  season: number;
  team: EditorTeam;
  onDetailsSaved: (details: EditorTeamDetails) => void;
  /** A section was added, saved, deleted or moved */
  onSectionsChanged: (update: SectionsUpdate) => void;
}) {
  return (
    <div className="space-y-8">
      <TeamDetailsCard
        key={`${season}-${team.team}`}
        season={season}
        team={team.team}
        name={team.name}
        details={team.details}
        onSaved={onDetailsSaved}
      />
      <Sections
        season={season}
        team={team.team}
        sections={team.sections}
        onChange={onSectionsChanged}
      />
    </div>
  );
}

function pickDetails(saved: EditorTeamDetails): TeamDetails {
  return { number: saved.number, robot: saved.robot };
}

function TeamDetailsCard({
  season,
  team,
  name,
  details,
  onSaved,
}: {
  season: number;
  team: TeamId;
  name: string;
  details: EditorTeamDetails;
  onSaved: (details: EditorTeamDetails) => void;
}) {
  const part = usePart(
    `${season}-${team}-details`,
    details,
    (draft, rev, force) => api.saveTeamDetails(season, team, draft, rev, force),
    onSaved,
    pickDetails,
  );
  const { draft, setDraft } = part;
  const robot = draft.robot;

  const setRobot = (change: Partial<TeamDetails["robot"]>) =>
    setDraft((d) => ({ ...d, robot: { ...d.robot, ...change } }));
  const setStats = (stats: TeamDetails["robot"]["stats"]) => setRobot({ stats });

  return (
    <section className="space-y-3" aria-labelledby={`${team}-details-title`}>
      <h2 id={`${team}-details-title`} className={sectionLabelClass}>
        {name} and its robot
      </h2>
      <div className={`${cardClass} space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Field label="Team number">
            <input
              className={inputClass}
              inputMode="numeric"
              // Empty while it's 0, so it can be cleared and typed again
              value={draft.number ? String(draft.number) : ""}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 5);
                setDraft((d) => ({ ...d, number: Number(digits) || 0 }));
              }}
            />
          </Field>
          <Field label="Robot's name">
            <input
              className={inputClass}
              value={robot.name}
              onChange={(event) => setRobot({ name: event.target.value })}
              maxLength={60}
            />
          </Field>
        </div>

        <Field label="Tagline" hint="One or two sentences under the robot's name.">
          <textarea
            className={inputClass}
            rows={2}
            value={robot.tagline}
            onChange={(event) => setRobot({ tagline: event.target.value })}
            maxLength={400}
          />
        </Field>

        <div className="space-y-1">
          <p className="text-sm font-medium text-black dark:text-white">Robot photo</p>
          <p className={hintClass}>Shown big at the top, beside the robot's name.</p>
          <SinglePicture
            image={robot.image}
            onChange={(image) => setRobot({ image })}
            label="Photo"
            describe
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-black dark:text-white">Stats</legend>
          <p className={hintClass}>
            Quick facts under the robot, like Weight and 115 lb. Leave a value empty to hide it.
          </p>
          {robot.stats.map((stat, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input
                className={`${inputBaseClass} w-40 flex-none`}
                value={stat.label}
                onChange={(event) =>
                  setStats(robot.stats.map((s, i) => (i === index ? { ...s, label: event.target.value } : s)))
                }
                placeholder="Name"
                aria-label={`Stat ${index + 1}'s name`}
                maxLength={30}
              />
              <input
                className={`${inputBaseClass} min-w-0 flex-1`}
                value={stat.value}
                onChange={(event) =>
                  setStats(robot.stats.map((s, i) => (i === index ? { ...s, value: event.target.value } : s)))
                }
                placeholder="Value"
                aria-label={`Stat ${index + 1}'s value`}
                maxLength={40}
              />
              <div className="flex gap-1.5">
                <MoveButtons
                  index={index}
                  count={robot.stats.length}
                  name={stat.label || `stat ${index + 1}`}
                  onMove={(from, to) => setStats(moved(robot.stats, from, to))}
                />
                <RemoveButton
                  name={stat.label || `stat ${index + 1}`}
                  onRemove={() => setStats(robot.stats.filter((_, i) => i !== index))}
                />
              </div>
            </div>
          ))}
          {robot.stats.length < MAX_STATS && (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setStats([...robot.stats, { label: "", value: "" }])}
            >
              Add a stat
            </button>
          )}
        </fieldset>

        <SaveBar part={part} savedBy={details} />
      </div>
    </section>
  );
}

function Sections({
  season,
  team,
  sections,
  onChange,
}: {
  season: number;
  team: TeamId;
  sections: EditorSection[];
  onChange: (update: SectionsUpdate) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A section just added opens straight away
  const [openId, setOpenId] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError(null);
    const answer = await api.addSection(season, team, newTitle);
    setAdding(false);
    if (!answer.ok) return setError(answer.error);
    const added = answer.value;
    onChange((list) => [...list, added]);
    setOpenId(answer.value.id);
    setNewTitle("");
  }

  async function move(from: number, to: number) {
    const before = sections.map((s) => s.id);
    const order = moved(before, from, to);
    // Moves on screen straight away, and back if the server says no
    const arrange = (ids: string[]) => (list: EditorSection[]) =>
      ids.flatMap((id) => list.filter((s) => s.id === id));
    onChange(arrange(order));
    setError(null);
    const answer = await api.orderSections(season, team, order);
    if (!answer.ok) {
      onChange(arrange(before));
      setError(answer.error);
    }
  }

  async function remove(section: EditorSection) {
    const sure = window.confirm(
      `Delete the section "${section.title}" and everything in it? This can't be undone.`,
    );
    if (!sure) return;
    setError(null);
    const answer = await api.deleteSection(season, section.id);
    if (!answer.ok) return setError(answer.error);
    onChange((list) => list.filter((s) => s.id !== section.id));
  }

  return (
    <section className="space-y-3" aria-labelledby={`${team}-sections-title`}>
      <div className="space-y-1">
        <h2 id={`${team}-sections-title`} className={sectionLabelClass}>
          Sections
        </h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Each one is a part of the page, like Mechanical or Software, with a card for each topic.
          Moving and deleting sections happens straight away; changes inside one wait for its Save.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <ol className="space-y-3">
        {sections.map((section, index) => (
          <li key={`${season}-${section.id}`}>
            <SectionEditor
              season={season}
              section={section}
              number={index + 1}
              startOpen={section.id === openId}
              moveButtons={
                <MoveButtons
                  index={index}
                  count={sections.length}
                  name={section.title}
                  onMove={(from, to) => void move(from, to)}
                />
              }
              onDelete={() => void remove(section)}
              onSaved={(saved) =>
                onChange((list) => list.map((s) => (s.id === saved.id ? saved : s)))
              }
            />
          </li>
        ))}
      </ol>

      <form onSubmit={add} className={`${cardClass} flex flex-wrap items-end gap-2`}>
        <div className="min-w-48 flex-1">
          <Field label="New section">
            <input
              className={inputClass}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Its title, like Awards"
              maxLength={60}
            />
          </Field>
        </div>
        <button type="submit" className={primaryButtonClass} disabled={adding || !newTitle.trim()}>
          {adding ? "Adding…" : "Add section"}
        </button>
      </form>
    </section>
  );
}
