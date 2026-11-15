import { useEffect, useRef } from "react";
import { TEAM_NAMES, type TeamId } from "./content";
import { LOGO_SHAPE } from "./logoShape";

/*
 * Lambert Robotics' main logo (the lambda and gamma as longhorns) with a gear
 * behind the middle, at the top of the binder. It's also the team picker:
 * the left half is Lambda's and the right half Gamma's, and clicking a half
 * opens that team's binder.
 *
 * The open team's half is in its colours (Lambda maroon, Gamma chrome); the
 * other half is an outline that fills in when pointed at. Each horn carries
 * its team's name, the two matching like mirror images. Colours are in binder.css
 * ("The logo").
 *
 * The gear turns slowly: counterclockwise while Lambda's binder is open,
 * clockwise for Gamma's. Switching gives it a quick spin the new way, which
 * settles back to the slow turn.
 *
 * Coordinates are the traced logo's (see logoShape.ts).
 */

/** Where the halves meet: up the bottom join, then up through the gap
 *  between the lambda and the gamma's hook, so the hook stays Gamma's.
 *  The halves leave a hairline gap between them. */
const LAMBDA_SIDE = "32 223 383.8 223 383.8 395 459.8 480 459.8 622 32 622";
const GAMMA_SIDE = "386.2 223 892 223 892 622 462.2 622 462.2 480 386.2 395";

/** A gear outline: `teeth` trapezoid teeth between two radii, one tooth at the top */
function gearPath(cx: number, cy: number, teeth: number, outer: number, root: number): string {
  const step = (Math.PI * 2) / teeth;
  const at = (radius: number, angle: number) =>
    `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    points.push(at(root, a), at(outer, a + step * 0.16), at(outer, a + step * 0.44), at(root, a + step * 0.6));
  }
  return `M${points.join(" L")} Z`;
}

const GEAR_X = 461;
const GEAR_Y = 432;
const GEAR = gearPath(GEAR_X, GEAR_Y, 16, 150, 134);

/** The gear's slow turn, in degrees a second */
const GEAR_SPEED = 6;
/** How fast it spins just after a switch */
const GEAR_KICK = 260;
/** How quickly the spin dies away, in seconds (about two thirds gone by then) */
const GEAR_SETTLE = 0.5;

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

/*
 * The names' baselines. Lambda's is its horn's measured centre line, moved
 * down by half the capitals' height so the letters sit in the middle of the
 * horn. Gamma's is the exact mirror image (the logo is symmetric about
 * x = 462), run the other way so both words read left to right. The two
 * names match: same lettering and size, in mirrored spots.
 *
 * The size (26, in binder.css) and the spot along each horn (NAME_AT) were
 * picked by measuring in the browser: every letter stays at least 5 units
 * inside the horn's edge. Toward the tips the horns get too thin. A bigger
 * size or a new spot needs measuring again.
 */
const LAMBDA_HORN =
  "M 48.6 245.8 C 50.2 246.4 55.1 248 58.3 249.2 C 61.6 250.4 64.6 251.6 67.8 253 C 71 254.4 74.2 256 77.3 257.6 " +
  "C 80.5 259.2 83.7 260.7 86.8 262.5 C 90 264.3 93.2 266.5 96.3 268.5 C 99.5 270.6 102.7 272.6 105.9 274.9 " +
  "C 109.1 277.2 112.3 279.8 115.5 282.4 C 118.7 285 122 287.6 125.3 290.4 C 128.5 293.2 131.9 296.3 135.2 299.2 " +
  "C 138.5 302 141.9 304.8 145.2 307.7 C 148.6 310.6 151.9 313.7 155.4 316.5 C 158.8 319.4 162.3 322.1 165.8 324.7 " +
  "C 169.3 327.2 172.8 329.7 176.3 332 C 179.8 334.3 183.3 336.4 186.7 338.5 C 190.2 340.5 193.7 342.4 197.2 344.2 " +
  "C 200.7 346.1 204.3 347.8 207.8 349.3 C 211.3 350.9 214.9 352.2 218.3 353.5 C 221.8 354.8 225.3 356.1 228.8 357.2 " +
  "C 232.3 358.3 235.7 359.3 239.1 360.3 C 242.6 361.3 246.1 362.3 249.6 363.1 C 253.1 363.9 256.6 364.6 260.1 365.2 " +
  "C 263.5 365.9 268.5 366.7 270.2 367";
const GAMMA_HORN =
  "M 653.8 367 C 655.5 366.7 660.5 365.9 663.9 365.2 C 667.4 364.6 670.9 363.9 674.4 363.1 C 677.9 362.3 681.4 361.3 684.9 360.3 " +
  "C 688.3 359.3 691.7 358.3 695.2 357.2 C 698.7 356.1 702.2 354.8 705.7 353.5 C 709.1 352.2 712.7 350.9 716.2 349.3 " +
  "C 719.7 347.8 723.3 346.1 726.8 344.2 C 730.3 342.4 733.8 340.5 737.3 338.5 C 740.7 336.4 744.2 334.3 747.7 332 " +
  "C 751.2 329.7 754.7 327.2 758.2 324.7 C 761.7 322.1 765.2 319.4 768.6 316.5 C 772.1 313.7 775.4 310.6 778.8 307.7 " +
  "C 782.1 304.8 785.5 302 788.8 299.2 C 792.1 296.3 795.5 293.2 798.7 290.4 C 802 287.6 805.3 285 808.5 282.4 " +
  "C 811.7 279.8 814.9 277.2 818.1 274.9 C 821.3 272.6 824.5 270.6 827.7 268.5 C 830.8 266.5 834 264.3 837.2 262.5 " +
  "C 840.3 260.7 843.5 259.2 846.7 257.6 C 849.8 256 853 254.4 856.2 253 C 859.4 251.6 862.4 250.4 865.7 249.2 " +
  "C 868.9 248 873.8 246.4 875.4 245.8";

/** Where along its horn each name is centred (mirrored: 82% from Lambda's
 *  tip is 18% from Gamma's base) */
const NAME_AT: Record<TeamId, string> = { lambda: "82%", gamma: "18%" };

type Props = {
  team: TeamId;
  onPick: (team: TeamId) => void;
  /** Each team's number, for screen readers, once the binder has loaded */
  numbers?: Record<TeamId, number>;
};

export function LambertLogo({ team, onPick, numbers }: Props) {
  const gearRef = useRef<SVGGElement>(null);
  const gear = useRef({ angle: 0, speed: 0 });
  const shownTeam = useRef(team);

  // Turns the gear every frame, so it can slow down and change direction
  // smoothly (a CSS animation would jump). Still for visitors whose device
  // asks for less motion
  useEffect(() => {
    if (motionQuery.matches) return;
    const direction = team === "lambda" ? -1 : 1;
    const state = gear.current;
    if (shownTeam.current !== team) {
      shownTeam.current = team;
      state.speed = direction * GEAR_KICK;
    }
    const target = direction * GEAR_SPEED;
    let last = performance.now();
    let frame = requestAnimationFrame(function turn(now) {
      // Capped, so coming back to a hidden tab doesn't jump the gear
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      state.speed = target + (state.speed - target) * Math.exp(-seconds / GEAR_SETTLE);
      state.angle = (state.angle + state.speed * seconds) % 360;
      gearRef.current?.setAttribute("transform", `rotate(${state.angle.toFixed(2)} ${GEAR_X} ${GEAR_Y})`);
      frame = requestAnimationFrame(turn);
    });
    return () => cancelAnimationFrame(frame);
  }, [team]);

  function half(id: TeamId) {
    const on = id === team;
    return (
      <a
        className={on ? "binder-logo-half is-on" : "binder-logo-half"}
        data-for={id}
        href={`?team=${id}`}
        aria-label={numbers ? `${TEAM_NAMES[id]} ${numbers[id]}` : TEAM_NAMES[id]}
        aria-current={on ? "true" : undefined}
        onClick={(event) => {
          event.preventDefault();
          onPick(id);
        }}
      >
        <g clipPath={`url(#binder-logo-${id}-side)`}>
          {/* Makes the whole half clickable, gaps included */}
          <polygon className="binder-logo-hit" points={id === "lambda" ? LAMBDA_SIDE : GAMMA_SIDE} />
          <use className="binder-logo-off" href="#binder-logo-shape" />
          <use className="binder-logo-colour" href="#binder-logo-shape" fill={`url(#binder-logo-${id}-fill)`} />
          <text className="binder-logo-name" aria-hidden="true">
            <textPath
              href={id === "lambda" ? "#binder-logo-lambda-horn" : "#binder-logo-gamma-horn"}
              startOffset={NAME_AT[id]}
              textAnchor="middle"
            >
              {id === "lambda" ? "LAMBDA" : "GAMMA"}
            </textPath>
          </text>
        </g>
      </a>
    );
  }

  return (
    <svg className="binder-logo" viewBox="32 223 860 399" role="group" aria-label="Pick a team">
      <defs>
        <path id="binder-logo-shape" d={LOGO_SHAPE} />
        <clipPath id="binder-logo-lambda-side">
          <polygon points={LAMBDA_SIDE} />
        </clipPath>
        <clipPath id="binder-logo-gamma-side">
          <polygon points={GAMMA_SIDE} />
        </clipPath>
        <linearGradient id="binder-logo-lambda-fill" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#d33c50" />
          <stop offset="1" stopColor="#8e1b2b" />
        </linearGradient>
        <linearGradient id="binder-logo-gamma-fill" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#d9d5ce" />
          <stop offset="1" stopColor="#a39f97" />
        </linearGradient>
        <path id="binder-logo-lambda-horn" d={LAMBDA_HORN} />
        <path id="binder-logo-gamma-horn" d={GAMMA_HORN} />
      </defs>
      <g className="binder-logo-gear" ref={gearRef} aria-hidden="true">
        <path d={GEAR} />
        <circle cx={GEAR_X} cy={GEAR_Y} r="98" />
      </g>
      {/* The letters in the page's colour, hiding the gear behind them. (A
          mask cutting the letters out of the gear drew wrongly in some
          browsers while the gear turned.) */}
      <use className="binder-logo-backing" href="#binder-logo-shape" aria-hidden="true" />
      {half("lambda")}
      {half("gamma")}
    </svg>
  );
}
