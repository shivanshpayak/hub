import { useState } from "react";
import { YOUTUBE_ID, type ElementOf } from "../content";
import { BlockField, ToolButton, ToolDivider, type BlockUI, type BlockViewProps, type ToolActions } from "./kit";

/*
 * A YouTube video. Visitors see its picture with a play button; YouTube's
 * player (from youtube-nocookie.com, which keeps no cookies until it's
 * played) loads only when they press it, so a page with videos stays quick.
 * Editors paste any YouTube link; only the video's id and start are kept.
 * What it keeps: BLOCKS.video in ManuQueue's src/lib/binder-blocks.ts.
 */

type VideoElement = ElementOf<"video">;

/** Seconds from a link's t= or start=: 90, 90s or 1m30s */
function readTime(raw: string | null): number {
  if (!raw) return 0;
  if (/^\d+s?$/.test(raw)) return parseInt(raw, 10);
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/** The video and start in a YouTube link (watch, youtu.be, shorts, live,
 *  embed), or a bare id; null if it isn't one */
export function readYouTubeLink(raw: string): { id: string; start: number } | null {
  const text = raw.trim();
  if (YOUTUBE_ID.test(text)) return { id: text, start: 0 };
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : (url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1] ?? null);
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return { id, start: readTime(url.searchParams.get("t") ?? url.searchParams.get("start")) };
}

/** The link an editor sees for what's kept */
const linkFor = (element: VideoElement) =>
  element.videoId ? `https://youtu.be/${element.videoId}${element.start ? `?t=${element.start}` : ""}` : "";

function VideoView({ element, edit }: BlockViewProps<VideoElement>) {
  const [playing, setPlaying] = useState(false);
  const [problem, setProblem] = useState(false);
  const active = Boolean(edit?.active);
  const { videoId, caption } = element;

  const fields = active && edit && (
    <span className="bp-picture-fields">
      <BlockField
        value={linkFor(element)}
        placeholder="Paste a YouTube link"
        inputMode="url"
        autoFocus={!videoId}
        onCommit={(link) => {
          if (!link) {
            setProblem(false);
            edit.change({ videoId: "", start: 0 });
            return;
          }
          const found = readYouTubeLink(link);
          setProblem(!found);
          if (found) edit.change({ videoId: found.id, start: found.start });
        }}
      />
      {problem && <span className="bp-field-note bp-field-problem">That isn't a YouTube link.</span>}
      <BlockField
        value={caption}
        placeholder="Caption (optional)"
        maxLength={200}
        onCommit={(next) => edit.change({ caption: next })}
      />
    </span>
  );

  if (!videoId) {
    // Nothing for visitors; a spot to fill in the editor
    if (!edit) return null;
    return (
      <div className="bp-video bp-image-empty">
        {active ? fields : <span>Double click to add a YouTube video</span>}
      </div>
    );
  }

  const title = caption || "Video";
  return (
    <figure className={`bp-video${element.frame ? " bp-framed" : ""}`}>
      <div className="bp-video-stage">
        {playing && !edit ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0${element.start ? `&start=${element.start}` : ""}`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            // YouTube won't play an embed that doesn't say which site it's on
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className="bp-video-play"
            aria-label={`Play ${title}`}
            // In the editor a press picks the video instead
            disabled={Boolean(edit)}
            onClick={() => setPlaying(true)}
          >
            {/* hqdefault is there for every video; cover crops its bars */}
            <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" draggable={false} />
            <span className="bp-video-icon" aria-hidden="true" />
          </button>
        )}
      </div>
      {caption && !active && <figcaption>{caption}</figcaption>}
      {fields}
    </figure>
  );
}

function VideoTools({ element, actions }: { element: VideoElement; actions: ToolActions<VideoElement> }) {
  return (
    <>
      <ToolButton onClick={actions.open} label="Paste its link and add a caption">
        {element.videoId ? "Change video" : "Add video"}
      </ToolButton>
      <ToolDivider />
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

export const video: BlockUI<"video"> = {
  View: VideoView,
  growsToFit: false,
  Tools: VideoTools,
  add: [
    {
      label: "Video",
      hint: "A YouTube video",
      make: () => ({ videoId: "", start: 0, caption: "", frame: false, w: 640, h: 360 }),
    },
  ],
};
