import { BLOCKS, CANVAS_WIDTH, type StatsElement } from "../content";
import { Editable, ToolButton, keepPress, type BlockUI, type BlockViewProps, type ToolActions } from "./kit";

/*
 * Stats: quick facts in a row, each a name and a value (Drivetrain, Swerve).
 * What it keeps, and what a new season keeps of it (the names): BLOCKS.stats
 * in ManuQueue's src/lib/binder-blocks.ts.
 */

/** The most stats in one row (the server's limit) */
const MAX_STATS = BLOCKS.stats.fields.stats.max ?? 12;

function StatsView({ element, edit }: BlockViewProps<StatsElement>) {
  const active = Boolean(edit?.active);
  const stats = active ? element.stats : element.stats.filter((s) => s.label && s.value);
  if (stats.length === 0 && !edit) return null;
  const setStat = (index: number, patch: Partial<StatsElement["stats"][number]>) =>
    edit?.change({
      stats: element.stats.map((stat, i) => (i === index ? { ...stat, ...patch } : stat)),
    });

  return (
    <dl className="bp-stats">
      {stats.map((stat, index) => (
        <div key={index} className="bp-stat">
          <Editable
            as="dt"
            value={stat.label}
            edit={edit}
            first={index === 0}
            singleLine
            placeholder="Name"
            onCommit={(label) => setStat(index, { label })}
          />
          <Editable
            as="dd"
            value={stat.value}
            edit={edit}
            singleLine
            placeholder="Value"
            onCommit={(value) => setStat(index, { value })}
          />
          {active && (
            <button
              type="button"
              className="bp-stat-remove"
              aria-label={`Remove ${stat.label || "this stat"}`}
              onPointerDown={keepPress}
              onClick={() => edit?.change({ stats: element.stats.filter((_, i) => i !== index) })}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {active && element.stats.length < MAX_STATS && (
        <button
          type="button"
          className="bp-stat bp-stat-add"
          onPointerDown={keepPress}
          onClick={() => edit?.change({ stats: [...element.stats, { label: "", value: "" }] })}
        >
          Add a stat
        </button>
      )}
      {!active && edit && stats.length === 0 && (
        <div className="bp-stat bp-stat-empty">Double click to add stats</div>
      )}
    </dl>
  );
}

function StatsTools({ actions }: { actions: ToolActions<StatsElement> }) {
  return <ToolButton onClick={actions.open}>Edit stats</ToolButton>;
}

export const stats: BlockUI<"stats"> = {
  View: StatsView,
  growsToFit: true,
  Tools: StatsTools,
  add: [
    {
      label: "Stats",
      hint: "Quick facts in a row",
      make: () => ({
        stats: [
          { label: "", value: "" },
          { label: "", value: "" },
        ],
        w: CANVAS_WIDTH,
        h: 80,
      }),
    },
  ],
};
