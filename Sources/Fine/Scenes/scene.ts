// Fine's playback/transition adapter. All artwork and the renderer stay upstream originals.
import { mount } from "./ascii-rest/mount.ts";
import { scenes } from "./catalog.ts";
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const outgoing = document.querySelector<HTMLCanvasElement>("#outgoing")!;
const composite = document.createElement("canvas");
let name = location.hash.slice(1);
if (!scenes[name]) name = "misty-forest";
let source = scenes[name];
let frame = source.default();
const frames = new Map([[name, frame]]);
let elapsed = 0, current = 0, draws = 0;
let playing = false;
let fade: Animation | undefined;
let stop: () => void = () => {};
const times = new Map<string, number>();
const piece = () => ({
  meta: source.meta,
  default: () => (time: number, env: Parameters<typeof frame>[1]) => {
    current = time;
    draws++;
    return frame(elapsed + time, env);
  },
});
function paint() {
  stop = mount(canvas, piece(), { fps: playing ? source.meta.fps : 0 });
  document.title = source.meta.name + " — ascii.rest";
}
function freezePresentation() {
  composite.width = canvas.width;
  composite.height = canvas.height;
  const ctx = composite.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  const opacity = Number(getComputedStyle(outgoing).opacity);
  if (opacity > 0 && outgoing.width > 0) {
    ctx.globalAlpha = opacity;
    ctx.drawImage(outgoing, 0, 0, composite.width, composite.height);
  }
  fade?.cancel();
  fade = undefined;
  outgoing.width = composite.width;
  outgoing.height = composite.height;
  outgoing.getContext("2d")!.drawImage(composite, 0, 0);
}
paint();
(window as any).fineScene = {
  names: Object.keys(scenes),
  setScene(next: string, animated = true) {
    if (!scenes[next] || next === name) return;
    // Flatten the presentation, including a partially completed fade. Retargeting
    // never resurrects the previous target, blocks input, or creates another WebView.
    freezePresentation();
    stop();
    times.set(name, elapsed + current);
    name = next;
    source = scenes[name];
    frame = frames.get(name) ?? source.default();
    frames.set(name, frame);
    elapsed = times.get(name) ?? 0;
    current = 0;
    paint(); // The next scene is fully drawn before the old pixels are released.
    outgoing.style.opacity = "0";
    if (animated) {
      fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "none",
      });
    }
  },
  setPlaying(value: boolean) {
    if (playing === value) return;
    stop();
    elapsed += current;
    current = 0;
    playing = value;
    paint();
  },
  thumbnail() { return canvas.toDataURL("image/png"); },
  get state() {
    return { id: name, name: source.meta.name, playing, time: elapsed + current, draws,
      width: canvas.width, height: canvas.height, transitioning: fade?.playState === "running",
      outgoingOpacity: Number(getComputedStyle(outgoing).opacity), layers: document.querySelectorAll("canvas").length };
  },
};
