import { BLOCKS, CANVAS_WIDTH, type ElementOf } from "../content";
import {
  AddRow,
  Editable,
  RowActions,
  ToolButton,
  moved,
  type BlockUI,
  type BlockViewProps,
  type ToolActions,
} from "./kit";

/*
 * Awards and results: a title, then each event with how it went and what
 * was won, one to a row (stacked when the box is narrow). What it keeps, and
 * that a new season's outline starts it empty: BLOCKS.awards in ManuQueue's
 * src/lib/binder-blocks.ts.
 */

type AwardsElement = ElementOf<"awards">;
type Entry = AwardsElement["events"][number];

const MAX_EVENTS = BLOCKS.awards.fields.events.max ?? 30;
const EMPTY_EVENT: Entry = { event: "", result: "", awards: "" };

function AwardsView({ element, edit }: BlockViewProps<AwardsElement>) {
  const active = Boolean(edit?.active);
  const events = active ? element.events : element.events.filter((e) => e.event || e.result || e.awards);
  if (events.length === 0 && !edit) return null;
  const setEvents = (next: Entry[]) => edit?.change({ events: next });
  const setEvent = (index: number, patch: Partial<Entry>) =>
    setEvents(element.events.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  return (
    <section className="bp-awards">
      <Editable
        as="h3"
        className="bp-awards-title"
        value={element.title}
        edit={edit}
        singleLine
        first
        placeholder="Awards and results"
        onCommit={(title) => edit?.change({ title })}
      />
      <ol className="bp-award-list">
        {events.map((entry, index) => (
          <li key={index} className="bp-award">
            <Editable
              className="bp-award-event"
              value={entry.event}
              edit={edit}
              singleLine
              placeholder="Event"
              onCommit={(event) => setEvent(index, { event })}
            />
            <Editable
              className="bp-award-result"
              value={entry.result}
              edit={edit}
              singleLine
              placeholder="How it went, like Semifinalist"
              onCommit={(result) => setEvent(index, { result })}
            />
            <Editable
              className="bp-award-won"
              value={entry.awards}
              edit={edit}
              singleLine
              placeholder="Awards won"
              onCommit={(awards) => setEvent(index, { awards })}
            />
            {active && (
              <RowActions
                index={index}
                count={element.events.length}
                name="event"
                onMove={(from, to) => setEvents(moved(element.events, from, to))}
                onRemove={(at) => setEvents(element.events.filter((_, i) => i !== at))}
              />
            )}
          </li>
        ))}
      </ol>
      {active && element.events.length < MAX_EVENTS && (
        <AddRow onAdd={() => setEvents([...element.events, EMPTY_EVENT])}>Add an event</AddRow>
      )}
      {!active && edit && events.length === 0 && (
        <div className="bp-image-empty bp-list-empty">Double click to add events</div>
      )}
    </section>
  );
}

function AwardsTools({ actions }: { actions: ToolActions<AwardsElement> }) {
  return (
    <ToolButton onClick={actions.open} label="Change, add, move or remove events">
      Edit events
    </ToolButton>
  );
}

export const awards: BlockUI<"awards"> = {
  View: AwardsView,
  growsToFit: true,
  Tools: AwardsTools,
  add: [
    {
      label: "Awards",
      hint: "Events, how they went, and awards won",
      make: () => ({ title: "Awards and results", events: [EMPTY_EVENT], w: CANVAS_WIDTH, h: 200 }),
    },
  ],
};
