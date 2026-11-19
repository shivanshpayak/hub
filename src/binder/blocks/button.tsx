import { useState } from "react";
import { parseLink, type ElementOf, type TeamId } from "../content";
import { BlockField, Editable, ToolButton, ToolDivider, type BlockUI, type BlockViewProps, type ToolActions } from "./kit";

/*
 * A button: a link that looks like one, to a web page (opens in a new tab),
 * an email address, or a place on the page like #sponsors. Solid or outlined,
 * in each look's style. What it keeps: BLOCKS.button in ManuQueue's
 * src/lib/binder-blocks.ts, whose parseLink the editor uses too, so the link
 * shown is the link saved.
 */

type ButtonElement = ElementOf<"button">;

const LINK_OPTIONS = { mail: true, anchor: true };

function ButtonView({ element, edit }: BlockViewProps<ButtonElement>) {
  const [problem, setProblem] = useState<string | null>(null);
  const active = Boolean(edit?.active);
  const { label, link } = element;
  if (!edit && !label) return null;
  const className = `bp-button bp-button-${element.style}`;
  const outside = /^https?:/.test(link);

  return (
    <div className={`bp-button-row bp-align-${element.align}`}>
      {edit ? (
        <span className={className}>
          <Editable
            value={label}
            edit={edit}
            singleLine
            first
            placeholder="Button words"
            onCommit={(next) => edit.change({ label: next })}
          />
        </span>
      ) : link ? (
        <a className={className} href={link} {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {label}
        </a>
      ) : (
        <span className={className}>{label}</span>
      )}
      {active && edit && (
        <span className="bp-picture-fields bp-button-fields">
          <BlockField
            value={link}
            placeholder="Web address, email, or #section"
            inputMode="url"
            onCommit={(typed) => {
              const parsed = parseLink(typed, "That", LINK_OPTIONS);
              if ("error" in parsed) {
                setProblem(parsed.error);
                return;
              }
              setProblem(null);
              edit.change({ link: parsed.value });
            }}
          />
          {problem && <span className="bp-field-note bp-field-problem">{problem}</span>}
          {!link && !problem && <span className="bp-field-note">Without a link it's only words.</span>}
        </span>
      )}
    </div>
  );
}

function ButtonTools({ element, actions }: { element: ButtonElement; actions: ToolActions<ButtonElement> }) {
  return (
    <>
      <ToolButton onClick={actions.open} label="Its words and where it goes">
        Edit
      </ToolButton>
      <ToolDivider />
      <ToolButton pressed={element.style === "solid"} onClick={() => actions.update({ style: "solid" })} label="Filled in">
        Solid
      </ToolButton>
      <ToolButton pressed={element.style === "outline"} onClick={() => actions.update({ style: "outline" })} label="Just an outline">
        Outline
      </ToolButton>
      <ToolDivider />
      {(["left", "center", "right"] as const).map((align) => (
        <ToolButton
          key={align}
          label={`Line up ${align === "center" ? "in the middle" : `on the ${align}`}`}
          pressed={element.align === align}
          onClick={() => actions.update({ align })}
        >
          <span className={`be-align-icon be-align-${align}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </ToolButton>
      ))}
    </>
  );
}

/** Lambda's page lines up on the left, Gamma's (its mirror) on the right */
const teamAlign = (team: TeamId) => (team === "gamma" ? ("right" as const) : ("left" as const));

export const button: BlockUI<"button"> = {
  View: ButtonView,
  growsToFit: true,
  Tools: ButtonTools,
  add: [
    {
      label: "Button",
      hint: "A link to a site, an email or a section",
      make: (team) => ({ label: "", link: "", style: "solid", align: teamAlign(team), w: 360, h: 60 }),
    },
  ],
};
