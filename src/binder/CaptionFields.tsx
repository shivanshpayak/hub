import { FILE_TEXT_LIMITS } from "./content";

/** A picture's or model's description and caption, typed in under it in
 *  the editor. `note` is a line about the file, for editors */
export function CaptionFields<T extends { alt: string; caption: string }>({
  value,
  onChange,
  note,
}: {
  value: T;
  onChange: (next: T) => void;
  note?: string;
}) {
  return (
    <span className="bp-picture-fields" onPointerDown={(event) => event.stopPropagation()}>
      {note && <span className="bp-field-note">{note}</span>}
      <input
        className="bp-field"
        defaultValue={value.alt}
        placeholder="What it shows (for screen readers)"
        maxLength={FILE_TEXT_LIMITS.alt}
        onBlur={(event) => {
          if (event.currentTarget.value !== value.alt) onChange({ ...value, alt: event.currentTarget.value });
        }}
      />
      <input
        className="bp-field"
        defaultValue={value.caption}
        placeholder="Caption (optional)"
        maxLength={FILE_TEXT_LIMITS.caption}
        onBlur={(event) => {
          if (event.currentTarget.value !== value.caption) {
            onChange({ ...value, caption: event.currentTarget.value });
          }
        }}
      />
    </span>
  );
}
