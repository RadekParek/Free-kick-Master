import * as THREE from "three";
import { PLAYSTYLE_LABELS, type PlayStyle } from "../players";

/** Projected, object-anchored broadcast data. No raycasts, layout reads, per-frame DOM creation,
 * or render targets. Text is changed only when its displayed value changes. */
export class WorldLabels {
  readonly root = document.createElement("div");
  private readonly label = document.createElement("div");
  private readonly title = document.createElement("small");
  private readonly value = document.createElement("b");
  private readonly unit = document.createElement("em");
  private readonly badge = document.createElement("div");
  private readonly icon = document.createElement("img");
  private readonly wipe = document.createElement("div");
  private readonly projected = new THREE.Vector3();
  private readonly visibility = new WeakMap<HTMLElement, boolean>();
  private readonly transforms = new WeakMap<HTMLElement, string>();
  private renderedValue = "";
  private settled = false;
  private lastTarget: number | undefined;
  private lastDecimals = -1;
  private metric = "";
  private age = 0;
  private style: PlayStyle | undefined;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  constructor(container: HTMLElement) {
    this.root.className = "world-labels";
    this.root.setAttribute("aria-hidden", "true");
    this.label.className = "world-stat";
    this.label.append(this.title, this.value, this.unit);
    this.badge.className = "world-playstyle";
    this.icon.alt = "";
    this.badge.append(this.icon);
    this.wipe.className = "world-transition";
    this.root.append(this.wipe, this.label, this.badge);
    container.append(this.root);
  }
  private visible(element: HTMLElement, on: boolean) {
    if ((this.visibility.get(element) ?? false) !== on) {
      this.visibility.set(element, on);
      element.classList.toggle("is-visible", on);
    }
  }
  private transform(element: HTMLElement, text: string) {
    if (this.transforms.get(element) !== text) {
      this.transforms.set(element, text);
      element.style.transform = text;
    }
  }
  private project(
    point: THREE.Vector3,
    camera: THREE.Camera,
    w: number,
    h: number,
  ) {
    this.projected.copy(point).project(camera);
    if (
      this.projected.z < -1 ||
      this.projected.z > 1 ||
      Math.abs(this.projected.x) > 1 ||
      Math.abs(this.projected.y) > 1
    )
      return false;
    this.projected.set(
      (this.projected.x * 0.5 + 0.5) * w,
      (-this.projected.y * 0.5 + 0.5) * h,
      0,
    );
    return true;
  }
  show(
    metric: string,
    title: string,
    target: number | undefined,
    decimals: number,
    unit: string,
    point: THREE.Vector3,
    camera: THREE.Camera,
    w: number,
    h: number,
    dt: number,
  ) {
    if (this.metric !== metric) {
      this.metric = metric;
      this.age = 0;
      this.settled = false;
      this.label.dataset.metric = metric;
      this.title.textContent = title;
      this.unit.textContent = unit;
    }
    this.age += dt;
    if (!this.settled || target !== this.lastTarget || decimals !== this.lastDecimals) {
      const t = this.reducedMotion ? 1 : Math.min(1, this.age / 0.36), smooth = t * t * (3 - 2 * t);
      const text = target === undefined ? "…" : (target * smooth).toFixed(decimals);
      if (text !== this.renderedValue) { this.renderedValue = text; this.value.textContent = text; }
      this.lastTarget = target; this.lastDecimals = decimals;
      this.settled = t === 1 || target === undefined;
    }
    const on = this.project(point, camera, w, h);
    this.visible(this.label, on);
    if (on) {
      const x = Math.max(14, Math.min(w - 174, this.projected.x + 18));
      const y = Math.max(
        h * 0.23,
        Math.min(h * 0.77 - 60, this.projected.y - 38),
      );
      this.transform(this.label, `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`);
    }
  }
  hideStats() {
    this.visible(this.label, false);
    this.metric = "";
  }
  playstyle(
    style: PlayStyle | undefined,
    on: boolean,
    head: THREE.Vector3,
    camera: THREE.Camera,
    w: number,
    h: number,
  ) {
    if (style !== this.style) {
      this.style = style;
      if (style) {
        this.icon.src = `./playstyles/${style}.png`;
        this.badge.setAttribute("aria-label", PLAYSTYLE_LABELS[style]);
        this.badge.dataset.playstyle = style;
      } else delete this.badge.dataset.playstyle;
    }
    const visible = !!style && on && this.project(head, camera, w, h);
    this.visible(this.badge, visible);
    if (visible)
      this.transform(this.badge, `translate3d(${this.projected.x.toFixed(1)}px,${(this.projected.y - 24).toFixed(1)}px,0) translate(-50%,-100%)`);
  }
  transition(stage: string) {
    this.root.dataset.stage = stage;
    if (this.reducedMotion) return;
    for (const a of this.wipe.getAnimations()) a.cancel();
    this.wipe.animate(
      [
        { transform: "translate3d(-110%,0,0)", opacity: 0 },
        { opacity: 0.38, offset: 0.4 },
        { transform: "translate3d(110%,0,0)", opacity: 0 },
      ],
      { duration: 300, easing: "cubic-bezier(.18,.7,.2,1)" },
    );
  }
  setPaused(paused: boolean) {
    for (const a of this.root.getAnimations({ subtree: true }))
      paused ? a.pause() : a.play();
  }
  dispose() {
    for (const a of this.root.getAnimations({ subtree: true })) a.cancel();
    this.root.remove();
  }
}
