import { CaptionFields } from "../CaptionFields";
import { Formatted } from "../formatting";
import { imageSrc, type CardElement, type PageImage } from "../content";
import {
  Editable,
  ToolButton,
  ToolDivider,
  keepPress,
  type BlockUI,
  type BlockViewProps,
  type ToolActions,
} from "./kit";

/*
 * A card: a topic with a title, a write up, a list of features under a
 * heading of its own ("Features" unless it's renamed or emptied) and
 * pictures, which go above, below or beside the text. What it keeps:
 * BLOCKS.card in ManuQueue's src/lib/binder-blocks.ts.
 */

function CardView({ element, edit }: BlockViewProps<CardElement>) {
  const active = Boolean(edit?.active);
  const setImages = (images: PageImage[]) => edit?.change({ images });
  const showFeatures = element.features.length > 0 || active;
  // Emptied, the heading goes and the list stays
  const showHeading = Boolean(element.featuresTitle) || active;

  return (
    <article className={`bp-card bp-pictures-${element.imagePlace} bp-pictures-${element.imageSize}`}>
      <div className="bp-card-body">
        <Editable
          as="h3"
          value={element.title}
          edit={edit}
          first
          singleLine
          placeholder="Card title"
          onCommit={(title) => edit?.change({ title })}
        />
        <Editable
          as="p"
          className="bp-card-text"
          value={element.text}
          edit={edit}
          rich
          placeholder="What it does, and why it was built this way"
          onCommit={(text) => edit?.change({ text })}
        />
        {showFeatures && (
          <>
            {showHeading && (
              <Editable
                as="h4"
                value={element.featuresTitle}
                edit={edit}
                singleLine
                placeholder="Features"
                onCommit={(featuresTitle) => edit?.change({ featuresTitle })}
              />
            )}
            {active ? (
              <Editable
                as="div"
                className="bp-features bp-features-editing"
                value={element.features.join("\n")}
                edit={edit}
                rich
                placeholder="One feature per line"
                onCommit={(text) =>
                  edit?.change({
                    features: text
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
              />
            ) : (
              <ul className="bp-features">
                {element.features.map((feature, index) => (
                  <li key={index}>
                    <Formatted text={feature} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {(element.images.length > 0 || active) && (
        <div className="bp-card-pictures">
          {element.images.map((image, index) => (
            <figure key={`${image.file}-${index}`}>
              <img
                src={imageSrc(image.file)}
                alt={image.alt || image.caption || element.title}
                loading="lazy"
                draggable={false}
              />
              {image.caption && !active && <figcaption>{image.caption}</figcaption>}
              {active && (
                <>
                  <CaptionFields
                    value={image}
                    onChange={(next) =>
                      setImages(element.images.map((old, i) => (i === index ? next : old)))
                    }
                  />
                  <span className="bp-picture-actions" onPointerDown={keepPress}>
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label="Move picture back"
                      onClick={() => {
                        const next = [...element.images];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setImages(next);
                      }}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={index === element.images.length - 1}
                      aria-label="Move picture forward"
                      onClick={() => {
                        const next = [...element.images];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        setImages(next);
                      }}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      aria-label="Remove picture"
                      onClick={() => setImages(element.images.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </span>
                </>
              )}
            </figure>
          ))}
          {active && edit && (
            <button
              type="button"
              className="bp-add-picture"
              onPointerDown={keepPress}
              onClick={async () => {
                const added = await edit.pickImages(true);
                if (added.length > 0) setImages([...element.images, ...added]);
              }}
            >
              Add pictures
            </button>
          )}
        </div>
      )}
    </article>
  );
}

const PLACES = ["above", "below", "left", "right"] as const;
const PLACE_NAMES = { above: "Top", below: "Bottom", left: "Left", right: "Right" };
const SIZES = ["small", "medium", "large"] as const;
const SIZE_NAMES = { small: "S", medium: "M", large: "L" };

function CardTools({ element, actions }: { element: CardElement; actions: ToolActions<CardElement> }) {
  return (
    <>
      <ToolButton onClick={actions.open}>Edit</ToolButton>
      <ToolDivider />
      <span className="be-tool-caption">Pictures</span>
      {PLACES.map((place) => (
        <ToolButton
          key={place}
          pressed={element.imagePlace === place}
          onClick={() => actions.update({ imagePlace: place })}
          label={`Pictures ${place === "above" ? "above the text" : place === "below" ? "below the text" : `on the ${place}`}`}
        >
          {PLACE_NAMES[place]}
        </ToolButton>
      ))}
      <ToolDivider />
      {SIZES.map((size) => (
        <ToolButton
          key={size}
          pressed={element.imageSize === size}
          onClick={() => actions.update({ imageSize: size })}
          label={`${size[0].toUpperCase()}${size.slice(1)} pictures`}
        >
          {SIZE_NAMES[size]}
        </ToolButton>
      ))}
    </>
  );
}

export const card: BlockUI<"card"> = {
  View: CardView,
  growsToFit: true,
  formatting: true,
  Tools: CardTools,
  add: [
    {
      label: "Card",
      hint: "A topic with text, features and pictures",
      make: () => ({
        title: "",
        text: "",
        featuresTitle: "Features",
        features: [],
        images: [],
        imagePlace: "below",
        imageSize: "medium",
        w: 550,
        h: 220,
      }),
    },
  ],
};
