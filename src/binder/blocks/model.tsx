import { useRef } from "react";
import { MODEL_START_ANGLE, MODEL_UPS, type ModelElement } from "../content";
import { currentModelAngle } from "../modelAngles";
import { ModelView } from "../ModelView";
import { ToolButton, ToolDivider, type BlockUI, type ToolActions } from "./kit";

/*
 * A 3D model (an .stl) people can turn and zoom, drawn by ModelView.tsx.
 * What it keeps, and the limit of 6 a page: BLOCKS.model in ManuQueue's
 * src/lib/binder-blocks.ts.
 */

/** Asks for an .stl and puts it in, keeping the old one's description and
 *  caption */
async function chooseModel(actions: ToolActions<ModelElement>) {
  const model = await actions.pickModel();
  if (!model) return;
  const old = actions.latest()?.model;
  actions.update({ model: old ? { ...model, alt: old.alt, caption: old.caption } : model });
}

/** The look's own model colour, for the colour picker to start from */
function lookModelColor(): string {
  const binder = document.querySelector(".binder");
  const own = binder ? getComputedStyle(binder).getPropertyValue("--b-model").trim() : "";
  return /^#[0-9a-f]{6}$/i.test(own) ? own : "#b8b2aa";
}

function ModelTools({ element, actions }: { element: ModelElement; actions: ToolActions<ModelElement> }) {
  // A colour dragged around the picker is one step for Undo
  const lastColor = useRef(0);
  return (
    <>
      <ToolButton onClick={() => void chooseModel(actions)}>{element.model ? "Replace" : "Add model"}</ToolButton>
      {element.model && (
        <ToolButton onClick={actions.open} label="Turn it, describe it and add a caption">
          Caption
        </ToolButton>
      )}
      <ToolDivider />
      <ToolButton
        label="Stand it up another way. CAD programs don't agree on which way is up"
        // Tries each way in turn
        onClick={() => actions.update({ up: MODEL_UPS[(MODEL_UPS.indexOf(element.up) + 1) % MODEL_UPS.length] })}
      >
        Upright
      </ToolButton>
      <ToolButton
        label="Visitors start from the angle it's at now. Double click the model to turn it first"
        disabled={!element.model}
        onClick={() => {
          const view = currentModelAngle(element.id);
          if (view) actions.update({ view });
        }}
      >
        Use this view
      </ToolButton>
      <ToolButton
        pressed={element.spin}
        label="Turn slowly until someone touches it"
        onClick={() => actions.update({ spin: !element.spin })}
      >
        Spin
      </ToolButton>
      <label className="be-tool-color" title="Colour">
        <span className="be-sr">Colour</span>
        <input
          type="color"
          value={element.color ?? lookModelColor()}
          onChange={(event) => {
            const now = Date.now();
            const continued = now - lastColor.current < 900;
            lastColor.current = now;
            actions.update({ color: event.target.value }, continued);
          }}
        />
      </label>
      {element.color && (
        <ToolButton label="Back to the look's own colour" onClick={() => actions.update({ color: null })}>
          Reset colour
        </ToolButton>
      )}
      <ToolButton
        pressed={element.frame}
        onClick={() => actions.update({ frame: !element.frame })}
        label="Frame it in the team's style"
      >
        Frame
      </ToolButton>
    </>
  );
}

export const model: BlockUI<"model"> = {
  View: ModelView,
  growsToFit: false,
  Tools: ModelTools,
  // Without a model yet, opening it asks for one
  opening: (element, actions) => {
    if (element.model) return false;
    void chooseModel(actions);
    return true;
  },
  add: [
    {
      label: "3D model",
      hint: "An .stl people can turn and zoom",
      make: () => ({
        model: null,
        up: "z",
        color: null,
        view: MODEL_START_ANGLE,
        spin: false,
        frame: false,
        w: 560,
        h: 420,
      }),
    },
  ],
};
