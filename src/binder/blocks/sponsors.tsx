import { CANVAS_WIDTH, imageSrc, type SponsorsElement } from "../content";
import { Editable, ToolButton, keepPress, type BlockUI, type BlockViewProps, type ToolActions } from "./kit";

/*
 * The sponsors: a title, a line of thanks, and the list both teams share
 * (Sponsors in the editor's bottom bar, kept on the season). One a page,
 * linked in the top bar. What it keeps: BLOCKS.sponsors in ManuQueue's
 * src/lib/binder-blocks.ts.
 */

function SponsorsView({ element, edit, page }: BlockViewProps<SponsorsElement>) {
  const { sponsors } = page;
  return (
    <section className="bp-sponsors">
      <Editable
        as="h2"
        value={element.title}
        edit={edit}
        first
        singleLine
        placeholder="Sponsors"
        onCommit={(title) => edit?.change({ title })}
      />
      <Editable
        as="p"
        className="bp-sponsors-text"
        value={element.text}
        edit={edit}
        rich
        placeholder="A line of thanks"
        onCommit={(text) => edit?.change({ text })}
      />
      <ul className="bp-sponsor-list">
        {sponsors.map((sponsor, index) => {
          const face = sponsor.logo ? (
            <img src={imageSrc(sponsor.logo.file)} alt={sponsor.name} draggable={false} />
          ) : (
            sponsor.name
          );
          return (
            <li key={index} className="bp-sponsor">
              {sponsor.url && !edit ? (
                <a href={sponsor.url} target="_blank" rel="noopener noreferrer">
                  {face}
                </a>
              ) : (
                face
              )}
            </li>
          );
        })}
        {edit && (
          <li className="bp-sponsor bp-sponsor-edit">
            <button type="button" onPointerDown={keepPress} onClick={edit.editSponsors}>
              {sponsors.length === 0 ? "Add sponsors" : "Edit the list"}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

function SponsorsTools({ actions }: { actions: ToolActions<SponsorsElement> }) {
  return (
    <>
      <ToolButton onClick={actions.editSponsors}>Edit the list</ToolButton>
      <ToolButton onClick={actions.open}>Edit text</ToolButton>
    </>
  );
}

export const sponsors: BlockUI<"sponsors"> = {
  View: SponsorsView,
  growsToFit: true,
  formatting: true,
  Tools: SponsorsTools,
  topBar: { anchor: "sponsors", label: "Sponsors" },
  add: [
    {
      label: "Sponsors",
      hint: "The sponsors list",
      make: () => ({ title: "Our sponsors", text: "", w: CANVAS_WIDTH, h: 220 }),
    },
  ],
};
