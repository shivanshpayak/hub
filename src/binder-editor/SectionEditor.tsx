import { useId, useState, type ReactNode } from "react";
import * as api from "./api";
import type { EditorEntry, EditorSection, SectionContent } from "./api";
import { PictureList } from "./Pictures";
import {
  Field,
  MoveButtons,
  RemoveButton,
  SaveBar,
  dangerButtonClass,
  hintClass,
  inputClass,
  moved,
  secondaryButtonClass,
  usePart,
} from "./ui";

/*
 * One section in the binder editor: its title and intro, and its cards (one
 * per topic, like the drivetrain), each with text, features and pictures.
 * The whole section saves at once.
 */

const MAX_CARDS = 20;

function pickContent(saved: EditorSection): SectionContent {
  return { title: saved.title, intro: saved.intro, entries: saved.entries };
}

function newCard(): EditorEntry {
  return { id: crypto.randomUUID().slice(0, 8), title: "", summary: "", features: [], images: [] };
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function SectionEditor({
  season,
  section,
  number,
  startOpen,
  moveButtons,
  onDelete,
  onSaved,
}: {
  season: number;
  section: EditorSection;
  number: number;
  startOpen: boolean;
  moveButtons: ReactNode;
  onDelete: () => void;
  onSaved: (section: EditorSection) => void;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(startOpen);
  const part = usePart(
    `${season}-section-${section.id}`,
    section,
    (draft, rev, force) => api.saveSection(season, section.id, draft, rev, force),
    onSaved,
    pickContent,
  );
  const { draft, setDraft } = part;

  const setCards = (update: (cards: EditorEntry[]) => EditorEntry[]) =>
    setDraft((d) => ({ ...d, entries: update(d.entries) }));
  // By id, not place: an upload can finish after its card has moved
  const updateCard = (id: string, change: Partial<EditorEntry>) =>
    setCards((cards) => cards.map((card) => (card.id === id ? { ...card, ...change } : card)));

  return (
    <div className="space-y-4 rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <span className="font-mono text-sm text-black/40 dark:text-white/40">
          {String(number).padStart(2, "0")}
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="block truncate font-semibold text-black dark:text-white">
            {draft.title || "Untitled section"}
          </span>
          <span className={hintClass}>
            {plural(draft.entries.length, "card")}
            {part.unsaved && (
              <span className="ml-2 font-semibold text-amber-700 dark:text-amber-300">
                Not saved yet
              </span>
            )}
          </span>
        </button>
        <div className="flex flex-wrap gap-1.5">
          {moveButtons}
          <button
            type="button"
            className={secondaryButtonClass}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {/* Hidden, not removed, so closing it keeps unsaved changes */}
      <div id={bodyId} hidden={!open} className="space-y-4 px-4 pb-4">
        <Field label="Title">
          <input
            className={inputClass}
            value={draft.title}
            onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
            maxLength={60}
          />
        </Field>
        <Field label="Intro" hint="A line under the title.">
          <textarea
            className={inputClass}
            rows={2}
            value={draft.intro}
            onChange={(event) => setDraft((d) => ({ ...d, intro: event.target.value }))}
            maxLength={400}
          />
        </Field>

        <div className="space-y-3">
          <p className="text-sm font-medium text-black dark:text-white">Cards</p>
          {draft.entries.length === 0 && (
            <p className={hintClass}>No cards yet. Add one for each topic, like Drivetrain.</p>
          )}
          <ol className="space-y-3">
            {draft.entries.map((card, index) => (
              <li
                key={card.id}
                className="space-y-3 rounded-lg border border-black/10 bg-black/[0.015] p-3 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-black/70 dark:text-white/70">
                    Card {index + 1}
                  </span>
                  <div className="flex gap-1.5">
                    <MoveButtons
                      index={index}
                      count={draft.entries.length}
                      name={card.title || `card ${index + 1}`}
                      onMove={(from, to) => setCards((cards) => moved(cards, from, to))}
                    />
                    <RemoveButton
                      name={card.title || `card ${index + 1}`}
                      onRemove={() => {
                        const hasContent = card.title || card.summary || card.images.length;
                        if (hasContent && !window.confirm(`Remove the card "${card.title || `Card ${index + 1}`}"?`)) {
                          return;
                        }
                        setCards((cards) => cards.filter((_, i) => i !== index));
                      }}
                    />
                  </div>
                </div>
                <Field label="Title">
                  <input
                    className={inputClass}
                    value={card.title}
                    onChange={(event) => updateCard(card.id, { title: event.target.value })}
                    placeholder="Like Drivetrain"
                    maxLength={80}
                  />
                </Field>
                <Field label="Text" hint="What it does and why it was built this way. Leave a blank line between paragraphs.">
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={card.summary}
                    onChange={(event) => updateCard(card.id, { summary: event.target.value })}
                    maxLength={3000}
                  />
                </Field>
                <Field label="Features" hint="One per line. Each shows as a point in a list.">
                  <textarea
                    className={inputClass}
                    rows={Math.max(3, card.features.length + 1)}
                    value={card.features.join("\n")}
                    onChange={(event) => updateCard(card.id, { features: event.target.value.split("\n") })}
                  />
                </Field>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-black dark:text-white">Pictures</p>
                  <PictureList
                    images={card.images}
                    name={card.title || `card ${index + 1}`}
                    onChange={(images) => updateCard(card.id, { images })}
                  />
                </div>
              </li>
            ))}
          </ol>
          {draft.entries.length < MAX_CARDS && (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setCards((cards) => [...cards, newCard()])}
            >
              Add a card
            </button>
          )}
        </div>

        <SaveBar part={part} savedBy={section} />

        <div className="flex justify-end border-t border-black/10 pt-3 dark:border-white/10">
          <button type="button" className={dangerButtonClass} onClick={onDelete}>
            Delete this section
          </button>
        </div>
      </div>
    </div>
  );
}
