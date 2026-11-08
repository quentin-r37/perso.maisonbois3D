/**
 * Frame rate of the 3D view, measured on the frames really drawn (the scene renders on
 * demand: when nothing moves, nothing is drawn and the counter says so).
 */
export const fps = $state({
  /** Frames drawn per second over the last window (0 = idle). */
  rate: 0,
  /** Longest gap between two frames in the window (ms): the stutters an average hides. */
  worst: 0
});

const WINDOW = 500;
/** A gap longer than this isn't a slow frame, the scene was just idle in between. */
const IDLE_GAP = 250;

let start = 0;
let last = 0;
let frames = 0;
let worst = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function flush() {
  const now = performance.now();
  if (now - last > IDLE_GAP * 2) {
    // nothing drawn for a while
    fps.rate = 0;
    fps.worst = 0;
    frames = 0;
    worst = 0;
    start = now;
    return;
  }
  if (now - start < WINDOW) return;
  fps.rate = Math.round((frames * 1000) / (now - start));
  fps.worst = Math.round(worst * 10) / 10;
  start = now;
  frames = 0;
  worst = 0;
}

/** To call once per frame drawn. */
export function countFrame() {
  const now = performance.now();
  const gap = now - last;
  if (last && gap < IDLE_GAP) {
    frames++;
    worst = Math.max(worst, gap);
  } else {
    // first frame after a pause: the window starts here
    start = now;
    frames = 0;
    worst = 0;
  }
  last = now;
  // (also refreshed on a timer, so the display falls back to "idle" when drawing stops)
  timer ??= setInterval(flush, WINDOW / 2);
  flush();
}
