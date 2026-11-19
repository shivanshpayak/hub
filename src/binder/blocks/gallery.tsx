import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaptionFields } from "../CaptionFields";
import { BLOCKS, CANVAS_WIDTH, imageSrc, type ElementOf, type PageImage } from "../content";
import {
  AddRow,
  RowActions,
  ToolButton,
  ToolDivider,
  moved,
  type BlockUI,
  type BlockViewProps,
  type ToolActions,
} from "./kit";

/*
 * A gallery: pictures in a row people scroll through (with arrows on a
 * computer, a swipe on a phone), each opening large with a click. Its height
 * comes from its size (small, medium, large), so it grows to fit. What it
 * keeps: BLOCKS.gallery in ManuQueue's src/lib/binder-blocks.ts.
 */

type GalleryElement = ElementOf<"gallery">;

const MAX_PICTURES = BLOCKS.gallery.fields.images.max ?? 40;
const SIZE_NAMES = { small: "S", medium: "M", large: "L" } as const;

/** The pictures large, one at a time, over the whole screen */
function Viewer({ images, start, onClose }: { images: PageImage[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const go = (step: number) => setIndex((i) => (i + step + images.length) % images.length);
  const image = images[index];
  return (
    <dialog
      ref={ref}
      className="bp-viewer"
      aria-label="Pictures"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dark space around the picture closes it
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(1);
        else if (event.key === "ArrowLeft") go(-1);
      }}
    >
      <figure className="bp-viewer-picture">
        <img src={imageSrc(image.file)} alt={image.alt || image.caption} />
        <figcaption>
          {image.caption && <span>{image.caption}</span>}
          {images.length > 1 && (
            <span className="bp-viewer-count">
              {index + 1} of {images.length}
            </span>
          )}
        </figcaption>
      </figure>
      {images.length > 1 && (
        <>
          <button type="button" className="bp-control bp-viewer-prev" aria-label="Previous picture" onClick={() => go(-1)}>
            ←
          </button>
          <button type="button" className="bp-control bp-viewer-next" aria-label="Next picture" onClick={() => go(1)}>
            →
          </button>
        </>
      )}
      <button type="button" className="bp-control bp-viewer-close" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}

function GalleryView({ element, edit }: BlockViewProps<GalleryElement>) {
  const active = Boolean(edit?.active);
  const strip = useRef<HTMLDivElement>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  // Whether there's more to scroll to on each side, for the arrows
  const [more, setMore] = useState({ back: false, forward: false });
  const { images } = element;

  const measure = useCallback(() => {
    const node = strip.current;
    if (!node) return;
    const back = node.scrollLeft > 2;
    const forward = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
    setMore((m) => (m.back === back && m.forward === forward ? m : { back, forward }));
  }, []);
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, images.length]);

  if (images.length === 0 && !edit) return null;
  const setImages = (next: PageImage[]) => edit?.change({ images: next });
  const scroll = (direction: number) => {
    const node = strip.current;
    node?.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className={`bp-gallery bp-gallery-${element.size}`}>
      <div className="bp-gallery-strip" ref={strip} onScroll={measure}>
        {images.map((image, index) => (
          <figure key={`${image.file}-${index}`} className="bp-gallery-item">
            <button
              type="button"
              className="bp-gallery-open"
              aria-label={`Open ${image.alt || image.caption || `picture ${index + 1}`} large`}
              // Only visitors open it; in the editor a press picks the gallery
              disabled={Boolean(edit)}
              onClick={() => setViewing(index)}
            >
              <img
                src={imageSrc(image.file)}
                alt={image.alt || image.caption}
                loading="lazy"
                draggable={false}
                onLoad={measure}
              />
            </button>
            {image.caption && !active && <figcaption>{image.caption}</figcaption>}
            {active && (
              <>
                <CaptionFields
                  value={image}
                  onChange={(next) => setImages(images.map((old, i) => (i === index ? next : old)))}
                />
                <RowActions
                  index={index}
                  count={images.length}
                  name="picture"
                  across
                  onMove={(from, to) => setImages(moved(images, from, to))}
                  onRemove={(at) => setImages(images.filter((_, i) => i !== at))}
                />
              </>
            )}
          </figure>
        ))}
        {active && edit && images.length < MAX_PICTURES && (
          <AddRow
            onAdd={async () => {
              const added = await edit.pickImages(true);
              if (added.length > 0) setImages([...images, ...added].slice(0, MAX_PICTURES));
            }}
          >
            Add pictures
          </AddRow>
        )}
        {!active && edit && images.length === 0 && (
          <div className="bp-image-empty bp-gallery-empty">Double click to add pictures</div>
        )}
      </div>
      {!edit && (more.back || more.forward) && (
        <div className="bp-gallery-arrows">
          <button type="button" className="bp-control" aria-label="Scroll back" disabled={!more.back} onClick={() => scroll(-1)}>
            ←
          </button>
          <button type="button" className="bp-control" aria-label="Scroll on" disabled={!more.forward} onClick={() => scroll(1)}>
            →
          </button>
        </div>
      )}
      {viewing !== null && <Viewer images={images} start={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** Asks for pictures and adds them at the end */
async function addPictures(actions: ToolActions<GalleryElement>) {
  const added = await actions.pickImages(true);
  const current = actions.latest();
  if (added.length === 0 || !current) return;
  actions.update({ images: [...current.images, ...added].slice(0, MAX_PICTURES) });
}

function GalleryTools({ element, actions }: { element: GalleryElement; actions: ToolActions<GalleryElement> }) {
  return (
    <>
      <ToolButton onClick={() => void addPictures(actions)} disabled={element.images.length >= MAX_PICTURES}>
        Add pictures
      </ToolButton>
      {element.images.length > 0 && (
        <ToolButton onClick={actions.open} label="Captions, order and removing pictures">
          Edit
        </ToolButton>
      )}
      <ToolDivider />
      <span className="be-tool-caption">Size</span>
      {(["small", "medium", "large"] as const).map((size) => (
        <ToolButton
          key={size}
          pressed={element.size === size}
          onClick={() => actions.update({ size })}
          label={`${size[0].toUpperCase()}${size.slice(1)} pictures`}
        >
          {SIZE_NAMES[size]}
        </ToolButton>
      ))}
    </>
  );
}

export const gallery: BlockUI<"gallery"> = {
  View: GalleryView,
  growsToFit: true,
  Tools: GalleryTools,
  // Empty, opening it asks for pictures
  opening: (element, actions) => {
    if (element.images.length > 0) return false;
    void addPictures(actions);
    return true;
  },
  add: [
    {
      label: "Gallery",
      hint: "Photos in a row, opened large with a click",
      make: () => ({ images: [], size: "medium", w: CANVAS_WIDTH, h: 300 }),
    },
  ],
};
