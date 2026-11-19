import { BLOCKS, type ElementOf } from "../content";
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
 * A timeline: steps down a line, each with a date, what happened and a line
 * or two about it (which can be bold, italic or underlined). Lambda's line
 * runs down the left, Gamma's down the right, like the rest of their pages.
 * What it keeps, and what a new season keeps of it (the titles):
 * BLOCKS.timeline in ManuQueue's src/lib/binder-blocks.ts.
 */

type TimelineElement = ElementOf<"timeline">;
type Step = TimelineElement["steps"][number];

const MAX_STEPS = BLOCKS.timeline.fields.steps.max ?? 30;
const EMPTY_STEP: Step = { date: "", title: "", text: "" };

function TimelineView({ element, edit }: BlockViewProps<TimelineElement>) {
  const active = Boolean(edit?.active);
  // Visitors don't see steps left completely empty
  const steps = active ? element.steps : element.steps.filter((s) => s.date || s.title || s.text);
  if (steps.length === 0 && !edit) return null;
  const setSteps = (next: Step[]) => edit?.change({ steps: next });
  const setStep = (index: number, patch: Partial<Step>) =>
    setSteps(element.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  return (
    <div className="bp-timeline">
      <ol className="bp-steps">
        {steps.map((step, index) => (
          <li key={index} className="bp-step">
            <span className="bp-step-dot" aria-hidden="true" />
            <Editable
              className="bp-step-date"
              value={step.date}
              edit={edit}
              singleLine
              first={index === 0}
              placeholder="When, like Week 1"
              onCommit={(date) => setStep(index, { date })}
            />
            <Editable
              as="h3"
              className="bp-step-title"
              value={step.title}
              edit={edit}
              singleLine
              placeholder="What happened"
              onCommit={(title) => setStep(index, { title })}
            />
            <Editable
              as="p"
              className="bp-step-text"
              value={step.text}
              edit={edit}
              rich
              placeholder="A line or two about it"
              onCommit={(text) => setStep(index, { text })}
            />
            {active && (
              <RowActions
                index={index}
                count={element.steps.length}
                name="step"
                onMove={(from, to) => setSteps(moved(element.steps, from, to))}
                onRemove={(at) => setSteps(element.steps.filter((_, i) => i !== at))}
              />
            )}
          </li>
        ))}
      </ol>
      {active && element.steps.length < MAX_STEPS && (
        <AddRow onAdd={() => setSteps([...element.steps, EMPTY_STEP])}>Add a step</AddRow>
      )}
      {!active && edit && steps.length === 0 && (
        <div className="bp-image-empty bp-list-empty">Double click to add steps</div>
      )}
    </div>
  );
}

function TimelineTools({ actions }: { actions: ToolActions<TimelineElement> }) {
  return (
    <ToolButton onClick={actions.open} label="Change, add, move or remove steps">
      Edit steps
    </ToolButton>
  );
}

export const timeline: BlockUI<"timeline"> = {
  View: TimelineView,
  growsToFit: true,
  formatting: true,
  Tools: TimelineTools,
  add: [
    {
      label: "Timeline",
      hint: "Steps down a line, like the build season",
      make: () => ({ steps: [EMPTY_STEP, EMPTY_STEP], w: 640, h: 220 }),
    },
  ],
};
