import { documentSrc, type ElementOf } from "../content";
import { Editable, ToolButton, ToolDivider, type BlockUI, type BlockViewProps, type ToolActions } from "./kit";

/*
 * A file: a PDF people open in the browser or save (the full technical
 * binder, a sponsorship packet), shown as a card with its name, a line about
 * it and its size. The whole card is the link. PDFs upload through ManuQueue's
 * /api/binder/files, which checks they really are PDFs. What it keeps:
 * BLOCKS.file in ManuQueue's src/lib/binder-blocks.ts.
 */

type FileElement = ElementOf<"file">;

function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Its file's name without .pdf, for a file with no title yet */
const plainName = (name: string) => name.replace(/\.pdf$/i, "");

function FileView({ element, edit }: BlockViewProps<FileElement>) {
  const doc = element.document;
  if (!doc && !edit) return null;
  const title = element.title || (doc && !edit ? plainName(doc.name) : "");

  const body = (
    <>
      <span className="bp-file-icon" aria-hidden="true">
        PDF
      </span>
      <span className="bp-file-body">
        <Editable
          as="h3"
          className="bp-file-title"
          value={title}
          edit={edit}
          singleLine
          first
          placeholder={doc ? plainName(doc.name) : "Name it, like Technical binder"}
          onCommit={(next) => edit?.change({ title: next })}
        />
        <Editable
          as="p"
          className="bp-file-text"
          value={element.text}
          edit={edit}
          rich
          placeholder="A line about what's in it (optional)"
          onCommit={(text) => edit?.change({ text })}
        />
        <span className="bp-file-meta">
          {doc ? `PDF, ${sizeText(doc.size)}` : edit ? "No file yet. Add one from the toolbar" : ""}
        </span>
      </span>
      <span className="bp-file-open" aria-hidden="true">
        Open
      </span>
    </>
  );

  // For visitors the whole card opens the PDF
  return doc && !edit ? (
    <a className="bp-file" href={documentSrc(doc)} target="_blank" rel="noopener">
      {body}
    </a>
  ) : (
    <div className="bp-file">{body}</div>
  );
}

/** Asks for a PDF and puts it in */
async function chooseFile(actions: ToolActions<FileElement>) {
  const document = await actions.pickFile();
  if (document) actions.update({ document });
}

function FileTools({ element, actions }: { element: FileElement; actions: ToolActions<FileElement> }) {
  return (
    <>
      <ToolButton onClick={() => void chooseFile(actions)}>{element.document ? "Replace PDF" : "Add PDF"}</ToolButton>
      <ToolDivider />
      <ToolButton onClick={actions.open} label="Its name and a line about it">
        Edit
      </ToolButton>
    </>
  );
}

export const file: BlockUI<"file"> = {
  View: FileView,
  growsToFit: true,
  formatting: true,
  Tools: FileTools,
  // Without a PDF yet, opening it asks for one
  opening: (element, actions) => {
    if (element.document) return false;
    void chooseFile(actions);
    return true;
  },
  add: [
    {
      label: "File",
      hint: "A PDF to open or download",
      make: () => ({ document: null, title: "", text: "", w: 480, h: 130 }),
    },
  ],
};
