import { useEffect, useRef, useState } from "react";
import { CaptionFields } from "./CaptionFields";
import type { ModelElement, PageModel } from "./content";
import type { BlockViewProps } from "./blocks/kit";
import { watchModelAngle } from "./modelAngles";
import type { ModelScene, SceneSettings } from "./modelScene";

/*
 * A 3D model on a page, in a box people can turn it and zoom in. three.js
 * (modelScene.ts) and the model itself load only once the box comes near
 * the screen. In the editor it stays still while it's being arranged, and
 * turns once opened with a double click.
 */

/** The look's own colour for models (--b-model in binder.css), unless one
 *  was picked */
function modelColor(stage: HTMLElement, picked: string | null): string {
  if (picked) return picked;
  const own = getComputedStyle(stage).getPropertyValue("--b-model").trim();
  return /^#[0-9a-f]{6}$/i.test(own) ? own : "#b8b2aa";
}

type Status =
  | { kind: "waiting" }
  | { kind: "loading"; progress: number }
  | { kind: "ready" }
  | { kind: "failed"; text: string; retry: boolean };

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 4v5h5" />
    </svg>
  );
}

function FullscreenIcon({ leave }: { leave: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={leave ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
    </svg>
  );
}

function Stage({
  element,
  model,
  interactive,
}: {
  element: ModelElement;
  model: PageModel;
  interactive: boolean;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ModelScene | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "waiting" });
  const [attempt, setAttempt] = useState(0);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // The latest settings, for a scene made after a wait
  const settingsFor = (stage: HTMLElement): SceneSettings => ({
    up: element.up,
    color: modelColor(stage, element.color),
    view: element.view,
    spin: element.spin,
    interactive,
  });
  const settingsRef = useRef(settingsFor);
  settingsRef.current = settingsFor;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;
    let scene: ModelScene | null = null;
    let stopWatching = () => {};

    async function draw(stage: HTMLElement) {
      try {
        const three = await import("./modelScene");
        if (cancelled) return;
        const load = three.loadModel(model.file, (progress) => {
          if (!cancelled) setStatus({ kind: "loading", progress });
        });
        stopWatching = load.stop;
        const mesh = await load.mesh;
        if (cancelled) return;
        scene = three.createScene(stage, mesh, settingsRef.current(stage), {
          onTouch: () => setTouched(true),
          onLost: () => setStatus({ kind: "failed", text: "The 3D model stopped drawing.", retry: true }),
        });
        if (!scene) {
          setStatus({ kind: "failed", text: "This browser can't show 3D models.", retry: false });
          return;
        }
        sceneRef.current = scene;
        setStatus({ kind: "ready" });
      } catch {
        if (!cancelled) setStatus({ kind: "failed", text: "The 3D model didn't load.", retry: true });
      }
    }

    // Fetched once it's nearly on screen
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        near.disconnect();
        void draw(stage);
      },
      { rootMargin: "600px" },
    );
    near.observe(stage);
    return () => {
      cancelled = true;
      near.disconnect();
      stopWatching();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [model.file, attempt]);

  // Keeps the drawing in step with the page (it skips what hasn't changed)
  useEffect(() => {
    const stage = stageRef.current;
    if (stage && sceneRef.current) sceneRef.current.update(settingsRef.current(stage));
  });

  useEffect(
    () => watchModelAngle(element.id, () => sceneRef.current?.currentAngle() ?? null),
    [element.id],
  );

  useEffect(() => {
    const onChange = () => {
      const on = Boolean(viewRef.current) && document.fullscreenElement === viewRef.current;
      setFullscreen(on);
      sceneRef.current?.setFullscreen(on);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (fullscreen) void document.exitFullscreen?.();
    else void viewRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

  return (
    <div ref={viewRef} className={`bp-model-view${fullscreen ? " is-fullscreen" : ""}`}>
      <div
        ref={stageRef}
        className="bp-model-stage"
        role="img"
        aria-label={model.alt || model.caption || "A 3D model"}
      />
      {status.kind !== "ready" && (
        <div className="bp-model-status" role={status.kind === "failed" ? "alert" : undefined}>
          {status.kind === "failed" ? (
            <>
              <p>{status.text}</p>
              {status.retry && (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setStatus({ kind: "loading", progress: 0 });
                    setAttempt((n) => n + 1);
                  }}
                >
                  Try again
                </button>
              )}
            </>
          ) : (
            <p aria-live="polite">
              {status.kind === "loading" && status.progress > 0
                ? `Loading the 3D model, ${Math.round(status.progress * 100)}%`
                : "Loading the 3D model…"}
            </p>
          )}
        </div>
      )}
      {status.kind === "ready" && interactive && (
        <>
          {!touched && (
            <p className="bp-model-hint" aria-hidden="true">
              {coarse ? "Drag to turn, pinch to zoom" : "Drag to turn, then scroll to zoom"}
            </p>
          )}
          <div
            className="bp-model-controls"
            role="group"
            aria-label="3D model"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => sceneRef.current?.zoom(true)}>
              +
            </button>
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => sceneRef.current?.zoom(false)}>
              −
            </button>
            <button
              type="button"
              aria-label="Back to the start"
              title="Back to the start"
              onClick={() => sceneRef.current?.reset()}
            >
              <ResetIcon />
            </button>
            {document.fullscreenEnabled && (
              <button
                type="button"
                aria-label={fullscreen ? "Leave full screen" : "Full screen"}
                title={fullscreen ? "Leave full screen" : "Full screen"}
                onClick={toggleFullscreen}
              >
                <FullscreenIcon leave={fullscreen} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ModelView({ element, edit }: BlockViewProps<ModelElement>) {
  const { model } = element;
  if (!model) {
    // Nothing for visitors; a spot to fill in the editor
    return edit ? (
      <div className="bp-model bp-image-empty">
        <span>Double click to add a 3D model (.stl)</span>
      </div>
    ) : null;
  }
  const active = Boolean(edit?.active);
  return (
    <figure className={`bp-model${element.frame ? " bp-framed" : ""}`}>
      {/* A new file starts afresh */}
      <Stage key={model.file} element={element} model={model} interactive={!edit || active} />
      {model.caption && !active && <figcaption>{model.caption}</figcaption>}
      {active && edit && (
        <CaptionFields
          value={model}
          note={`${model.name}, ${model.triangles.toLocaleString("en-US")} triangles`}
          onChange={(next) => edit.change({ model: next })}
        />
      )}
    </figure>
  );
}
