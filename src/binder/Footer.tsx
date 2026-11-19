import { TEAM_NAMES, type FooterContent, type TeamId } from "./content";

/*
 * The footer under both teams' pages, in every season: a line about the
 * team, the two team numbers, then a contact email and links (social media,
 * The Blue Alliance). Editors change it from Edit Binder (Edit footer, or a
 * double click on it), and it's checked and kept by ManuQueue
 * (FOOTER_FIELDS in its src/lib/binder-blocks.ts).
 */

/** Sites a link can be named after when it's given no name */
const KNOWN_SITES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)thebluealliance\.com$/, "The Blue Alliance"],
  [/(^|\.)statbotics\.io$/, "Statbotics"],
  [/^frc-events\.firstinspires\.org$/, "FRC Events"],
  [/(^|\.)chiefdelphi\.com$/, "Chief Delphi"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)(discord\.gg|discord\.com)$/, "Discord"],
  [/(^|\.)onshape\.com$/, "Onshape"],
];

/** What a link to `url` is called when it has no name: the site's name if
 *  it's a known one, or its address */
export function siteName(url: string): string {
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return KNOWN_SITES.find(([pattern]) => pattern.test(host))?.[1] ?? host;
  } catch {
    return url;
  }
}

export function BinderFooter({
  footer,
  numbers,
  onEdit,
}: {
  footer: FooterContent;
  numbers?: Record<TeamId, number>;
  /** In the editor: opens the footer's dialog */
  onEdit?: () => void;
}) {
  const hasLinks = Boolean(footer.email) || footer.links.length > 0;
  return (
    <footer
      className={`binder-footer${onEdit ? " be-footer-editable" : ""}`}
      onDoubleClick={onEdit}
    >
      <div className="binder-wrap">
        {footer.line && <p>{footer.line}</p>}
        <p>
          {numbers
            ? `FRC Teams ${numbers.lambda} ${TEAM_NAMES.lambda} and ${numbers.gamma} ${TEAM_NAMES.gamma}`
            : `FRC Teams ${TEAM_NAMES.lambda} and ${TEAM_NAMES.gamma}`}
        </p>
        {hasLinks && (
          <ul className="binder-footer-links">
            {footer.email && (
              <li>
                <a className="binder-footer-email" href={`mailto:${footer.email}`}>
                  {footer.email}
                </a>
              </li>
            )}
            {footer.links.map((link, index) => (
              <li key={index}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label || siteName(link.url)}
                </a>
              </li>
            ))}
          </ul>
        )}
        {onEdit && (
          <button type="button" className="be-footer-edit" onClick={onEdit}>
            Edit footer
          </button>
        )}
      </div>
    </footer>
  );
}
