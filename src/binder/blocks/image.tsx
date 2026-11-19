import { CaptionFields } from "../CaptionFields";
import { imageSrc, type ImageElement } from "../content";
import { ToolButton, ToolDivider, type BlockUI, type BlockViewProps, type ToolActions } from "./kit";

/*
 * A picture on its own: a photo or a CAD render, fitted or filling its box,
 * with the team's frame if wanted. What it keeps: BLOCKS.image in
 * ManuQueue's src/lib/binder-blocks.ts.
 */

function ImageView({ element, edit }: BlockViewProps<ImageElement>) {
  const { image } = element;
  if (!image) {
    // Nothing for visitors; a spot to fill in the editor
    return edit ? (
      <div className="bp-image bp-image-empty">
        <span>Double click to add a picture</span>
      </div>
    ) : null;
  }
  return (
    <figure className={`bp-image${element.frame ? " bp-framed" : ""}`}>
      <img
        src={imageSrc(image.file)}
        alt={image.alt || image.caption}
        style={{ objectFit: element.fit }}
        draggable={false}
      />
      {image.caption && !edit?.active && <figcaption>{image.caption}</figcaption>}
      {edit?.active && (
        <CaptionFields value={image} onChange={(next) => edit.change({ image: next })} />
      )}
    </figure>
  );
}

/** Asks for a picture and puts it in, keeping the old one's description and
 *  caption */
async function choosePicture(actions: ToolActions<ImageElement>) {
  const [image] = await actions.pickImages(false);
  if (!image) return;
  const old = actions.latest()?.image;
  actions.update({ image: old ? { ...image, alt: old.alt, caption: old.caption } : image });
}

function ImageTools({ element, actions }: { element: ImageElement; actions: ToolActions<ImageElement> }) {
  return (
    <>
      <ToolButton onClick={() => void choosePicture(actions)}>
        {element.image ? "Replace" : "Add picture"}
      </ToolButton>
      {element.image && (
        <ToolButton onClick={actions.open} label="Describe it and add a caption">
          Caption
        </ToolButton>
      )}
      <ToolDivider />
      <ToolButton
        pressed={element.fit === "contain"}
        onClick={() => actions.update({ fit: "contain" })}
        label="Show all of the picture"
      >
        Fit
      </ToolButton>
      <ToolButton
        pressed={element.fit === "cover"}
        onClick={() => actions.update({ fit: "cover" })}
        label="Fill the box, cropping the edges"
      >
        Fill
      </ToolButton>
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

export const image: BlockUI<"image"> = {
  View: ImageView,
  growsToFit: false,
  Tools: ImageTools,
  // Without a picture yet, opening it asks for one
  opening: (element, actions) => {
    if (element.image) return false;
    void choosePicture(actions);
    return true;
  },
  add: [
    {
      label: "Picture",
      hint: "A photo or CAD render",
      make: () => ({ image: null, fit: "contain", frame: false, w: 420, h: 300 }),
    },
  ],
};
