import { useId, useRef, useState } from "react";
import { IMAGE_ACCEPT, uploadImage, type EditorImage } from "./api";
import { MoveButtons, RemoveButton, hintClass, inputClass, moved, secondaryButtonClass } from "./ui";

/*
 * Pictures in the binder editor: photos, CAD renders and sponsor logos.
 * Each one uploads as soon as it's picked (big ones are shrunk first, see
 * api.ts), then is saved into the binder with the rest of its part.
 */

/** Picks files and uploads them one by one */
function useUpload(onUploaded: (image: EditorImage) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = [...files];
    const problems: string[] = [];
    setErrors([]);
    for (const [index, file] of list.entries()) {
      setBusy(list.length === 1 ? "Uploading…" : `Uploading ${index + 1} of ${list.length}…`);
      const answer = await uploadImage(file);
      if (answer.ok) onUploaded(answer.image);
      else problems.push(answer.error);
    }
    setBusy(null);
    setErrors(problems);
  }

  return { busy, errors, upload };
}

function UploadErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul role="alert" className="space-y-1 text-sm text-red-700 dark:text-red-300">
      {errors.map((error, index) => (
        <li key={index}>{error}</li>
      ))}
    </ul>
  );
}

/** A button that opens the file picker */
function PickButton({
  label,
  multiple,
  busy,
  onPick,
}: {
  label: string;
  multiple: boolean;
  busy: string | null;
  onPick: (files: FileList | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onPick(event.target.files);
          // The same file can be picked again later
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={busy !== null}
        onClick={() => input.current?.click()}
      >
        {busy ?? label}
      </button>
    </>
  );
}

const thumbClass =
  "aspect-[4/3] w-full rounded-lg border border-black/10 bg-[repeating-conic-gradient(#0000000d_0_25%,transparent_0_50%)] bg-[length:16px_16px] object-contain dark:border-white/10";

/** A card's pictures: each with what it shows and an optional caption */
export function PictureList({
  images,
  onChange,
  name,
}: {
  images: EditorImage[];
  onChange: (images: EditorImage[]) => void;
  /** The card's title, for screen readers */
  name: string;
}) {
  // Uploads finish one at a time, after `images` was read: add to the latest
  const latest = useRef(images);
  latest.current = images;
  const { busy, errors, upload } = useUpload((image) => {
    latest.current = [...latest.current, image];
    onChange(latest.current);
  });

  const update = (index: number, change: Partial<EditorImage>) =>
    onChange(images.map((image, i) => (i === index ? { ...image, ...change } : image)));

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <li
              key={image.file}
              className="space-y-2 rounded-lg border border-black/10 p-2 dark:border-white/10"
            >
              <img src={image.src} alt="" className={thumbClass} />
              <input
                className={inputClass}
                value={image.alt}
                onChange={(event) => update(index, { alt: event.target.value })}
                placeholder="What it shows"
                aria-label={`What picture ${index + 1} in ${name} shows, for screen readers`}
                maxLength={200}
              />
              <input
                className={inputClass}
                value={image.caption}
                onChange={(event) => update(index, { caption: event.target.value })}
                placeholder="Caption (optional)"
                aria-label={`Caption for picture ${index + 1} in ${name}`}
                maxLength={200}
              />
              <div className="flex flex-wrap gap-1.5">
                <MoveButtons
                  index={index}
                  count={images.length}
                  name={`picture ${index + 1}`}
                  onMove={(from, to) => onChange(moved(images, from, to))}
                  sideways
                />
                <RemoveButton
                  name={`picture ${index + 1}`}
                  onRemove={() => onChange(images.filter((_, i) => i !== index))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <PickButton
          label={images.length > 0 ? "Add more pictures" : "Add pictures"}
          multiple
          busy={busy}
          onPick={upload}
        />
        <span className={hintClass}>Photos or CAD renders.</span>
      </div>
      <UploadErrors errors={errors} />
    </div>
  );
}

/** One picture or none, like the robot photo or a sponsor's logo */
export function SinglePicture({
  image,
  onChange,
  label,
  describe = false,
}: {
  image: EditorImage | null;
  onChange: (image: EditorImage | null) => void;
  /** "Robot photo" */
  label: string;
  /** Ask what it shows (a logo doesn't need it: the sponsor's name is used) */
  describe?: boolean;
}) {
  const altId = useId();
  const { busy, errors, upload } = useUpload((uploaded) =>
    // A new picture keeps the old one's description
    onChange({ ...uploaded, alt: image?.alt ?? "", caption: image?.caption ?? "" }),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        {image && <img src={image.src} alt="" className={`${thumbClass} max-w-48`} />}
        <div className="flex flex-wrap gap-2">
          <PickButton
            label={image ? "Replace" : `Add ${label.toLowerCase()}`}
            multiple={false}
            busy={busy}
            onPick={upload}
          />
          {image && (
            <button type="button" className={secondaryButtonClass} onClick={() => onChange(null)}>
              Remove
            </button>
          )}
        </div>
      </div>
      {image && describe && (
        <div className="space-y-1">
          <label htmlFor={altId} className="text-sm font-medium text-black dark:text-white">
            What it shows
          </label>
          <input
            id={altId}
            className={inputClass}
            value={image.alt}
            onChange={(event) => onChange({ ...image, alt: event.target.value })}
            placeholder="For screen readers, like: Elytra on the field, intake down"
            maxLength={200}
          />
        </div>
      )}
      <UploadErrors errors={errors} />
    </div>
  );
}
