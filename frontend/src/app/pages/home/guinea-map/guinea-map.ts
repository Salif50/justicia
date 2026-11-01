import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, ViewChild,
} from '@angular/core';
import type * as THREE_NS from 'three';
import { GUINEA_REGIONS } from './guinea-geo';

/* ═══════════════════════════════════════════════════════════════════
   Carte de Guinée — version épurée (Three.js chargé à la demande).

   Uniquement des points : le territoire, les frontières des 8 régions et
   Conakry. Encre sur blanc en mode clair, blanc sur noir en mode sombre ;
   l'orange ne sert qu'à signaler (région mise en avant, pointeur, capitale).
   Vue presque zénithale : la forme du pays reste exacte.
   ═══════════════════════════════════════════════════════════════════ */

type Three = typeof import('./three-lite');

interface City { name: string; lon: number; lat: number; region: number; }

const LON0 = -11.35;
const LAT0 = 9.95;
const KX = Math.cos((LAT0 * Math.PI) / 180);
const FOV = 30;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

const CITIES: City[] = [
  { name: 'Conakry',   lon: -13.678, lat: 9.537,  region: 1 },
  { name: 'Boké',      lon: -14.300, lat: 10.940, region: 0 },
  { name: 'Kindia',    lon: -12.865, lat: 10.057, region: 4 },
  { name: 'Labé',      lon: -12.283, lat: 11.318, region: 5 },
  { name: 'Mamou',     lon: -12.091, lat: 10.375, region: 6 },
  { name: 'Faranah',   lon: -10.743, lat: 10.041, region: 2 },
  { name: 'Kankan',    lon: -9.306,  lat: 10.385, region: 3 },
  { name: 'Nzérékoré', lon: -8.818,  lat: 7.756,  region: 7 },
];

function px(lon: number) { return (lon - LON0) * KX; }
function py(lat: number) { return lat - LAT0; }

function gauss(lon: number, lat: number, cx: number, cy: number, s: number) {
  const dx = lon - cx;
  const dy = lat - cy;
  return Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
}

/** Relief normalisé 0…1 (Fouta-Djalon, dorsale guinéenne, Simandou, Nimba) : module la taille des points. */
function relief(lon: number, lat: number): number {
  const v = 0.85 * gauss(lon, lat, -12.2, 11.0, 0.8) + 0.45 * gauss(lon, lat, -11.55, 10.45, 0.55)
    + 0.9 * gauss(lon, lat, -8.45, 7.65, 0.2) + 0.55 * gauss(lon, lat, -8.95, 8.75, 0.25)
    + 0.4 * gauss(lon, lat, -9.9, 8.75, 0.7);
  const coast = Math.max(0, Math.min(1, (lon + 14.7) / 1.5));
  return Math.max(0, Math.min(1, (v + 0.05) * coast));
}

function inRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function regionAt(lon: number, lat: number): number {
  for (let r = 0; r < GUINEA_REGIONS.length; r++) {
    for (const ring of GUINEA_REGIONS[r].rings) if (inRing(lon, lat, ring)) return r;
  }
  return -1;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* aKind : 0 territoire · 1 frontière · 2 Conakry */
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uAssemble;
  uniform float uRegion;
  uniform vec3 uPointer;
  uniform float uPointerOn;
  uniform vec3 uInk;
  uniform vec3 uAccent;
  attribute vec3 aStart;
  attribute float aSize;
  attribute float aSeed;
  attribute float aRegion;
  attribute float aKind;
  attribute float aHeight;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 target = position;
    float d = distance(target.xy, uPointer.xy);
    float near = uPointerOn * exp(-d * d * 2.4);
    target.z = aHeight * 0.12 + near * 0.08;

    float hl = 1.0 - step(0.5, abs(aRegion - uRegion));

    float t = clamp((uAssemble - aSeed * 0.45) / 0.55, 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    vec3 p = mix(aStart, target, t);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float pulse = aKind > 1.5 ? 1.0 + 0.25 * sin(uTime * 2.2) : 1.0;
    gl_PointSize = aSize * uSize * pulse * (1.0 + near * 0.7) / -mv.z;

    float accent = aKind > 1.5 ? 1.0 : clamp(near * 1.2 + hl * (aKind > 0.5 ? 0.9 : 0.55), 0.0, 1.0);
    vColor = mix(uInk, uAccent, accent);
    float base = aKind > 0.5 ? 0.95 : 0.38 + 0.4 * aHeight;
    vAlpha = min(1.0, base + accent * 0.4) * t;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.36, r));
  }
`;

@Component({
  selector: 'app-guinea-map',
  templateUrl: './guinea-map.html',
  styleUrl: './guinea-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuineaMap implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) private hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('overlay', { static: true }) private overlayRef!: ElementRef<HTMLDivElement>;

  readonly cities = CITIES;
  readonly silhouette = buildSvgPath();

  private three?: Three;
  private renderer?: THREE_NS.WebGLRenderer;
  private scene?: THREE_NS.Scene;
  private camera?: THREE_NS.PerspectiveCamera;
  private group?: THREE_NS.Group;
  private mat?: THREE_NS.ShaderMaterial;
  private raycaster?: THREE_NS.Raycaster;
  private plane?: THREE_NS.Plane;
  private cityVecs: THREE_NS.Vector3[] = [];
  private cityEls: HTMLElement[] = [];

  private raf = 0;
  private visible = true;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private mo?: MutationObserver;
  private startTime = 0;
  private progress = 0;
  private progressEased = 0;
  private shift = 0;
  private shiftEased = 0;
  private pointerNdc = { x: 0, y: 0, on: 0 };
  private pointerOnEased = 0;
  private parallax = { x: 0, y: 0 };
  private region = -1;
  private regionClock = 0;
  private destroyed = false;
  private readonly reduced =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  constructor(private zone: NgZone, private el: ElementRef<HTMLElement>) {}

  /** Avancement du défilement (0 → 1) : légère inclinaison. */
  setProgress(p: number) { this.progress = Math.max(0, Math.min(1, p)); }

  /** Décalage horizontal du centre de la carte, en fraction de la largeur visible. */
  setShift(s: number) { this.shift = s; }

  ngAfterViewInit() {
    if (typeof window === 'undefined') return;
    this.cityEls = Array.from(this.overlayRef.nativeElement.querySelectorAll<HTMLElement>('[data-city]'));
    this.zone.runOutsideAngular(() => { void this.boot(); });
  }

  private async boot() {
    if (!hasWebGL()) return;
    const THREE = await import('./three-lite');
    if (this.destroyed) return;
    this.three = THREE;
    const host = this.hostRef.nativeElement;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    this.camera.up.set(0, 0, 1);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.buildPoints(THREE, window.innerWidth < 760 ? 4200 : 7000);
    this.applyTheme();

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.loop();
    }, { rootMargin: '120px' });
    this.io.observe(host);
    this.mo = new MutationObserver(() => { this.applyTheme(); if (!this.raf) this.renderFrame(); });
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const target = this.el.nativeElement;
    target.addEventListener('pointermove', this.onPointer, { passive: true });
    target.addEventListener('pointerleave', this.onLeave, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    this.startTime = performance.now();
    target.classList.add('is-live');
    this.loop();
  }

  /** Couleurs suivant le thème : encre sur blanc, ou blanc sur noir. */
  private applyTheme() {
    if (!this.mat || !this.three) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    (this.mat.uniforms['uInk'].value as THREE_NS.Color).set(dark ? '#F2F2F2' : '#111111');
    (this.mat.uniforms['uAccent'].value as THREE_NS.Color).set(dark ? '#F58A2E' : '#E8650A');
  }

  private buildPoints(THREE: Three, fillCount: number) {
    const rand = rng(7);
    const pos: number[] = [];
    const start: number[] = [];
    const size: number[] = [];
    const seed: number[] = [];
    const region: number[] = [];
    const kind: number[] = [];
    const height: number[] = [];

    const push = (lon: number, lat: number, r: number, k: number, s: number) => {
      pos.push(px(lon), py(lat), 0);
      const th = rand() * Math.PI * 2;
      const rad = 4 + rand() * 6;
      start.push(Math.cos(th) * rad, Math.sin(th) * rad, (rand() - 0.5) * 2);
      const h = relief(lon, lat);
      size.push(s * (k === 0 ? 0.85 + h * 0.5 : 1));
      seed.push(rand());
      region.push(r);
      kind.push(k);
      height.push(h);
    };

    // Territoire : trame régulière légèrement agitée (lecture nette, aspect « imprimé »)
    const step = Math.sqrt((7.5 * 5.6 * 0.55) / fillCount);
    for (let lat = 7.1; lat <= 12.8; lat += step) {
      const row = Math.round((lat - 7.1) / step);
      for (let lon = -15.2 + (row % 2 ? step / 2 : 0); lon <= -7.6; lon += step) {
        const jl = lon + (rand() - 0.5) * step * 0.35;
        const jt = lat + (rand() - 0.5) * step * 0.35;
        const r = regionAt(jl, jt);
        if (r >= 0) push(jl, jt, r, 0, 7);
      }
    }

    // Frontières des régions (la côte et la frontière nationale en font partie)
    GUINEA_REGIONS.forEach((reg, r) => {
      for (const ring of reg.rings) {
        for (let i = 0; i < ring.length; i++) {
          const [x1, y1] = ring[i];
          const [x2, y2] = ring[(i + 1) % ring.length];
          const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 0.022));
          for (let s = 0; s < n; s++) {
            const t = s / n;
            push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, 1, 5.5);
          }
        }
      }
    });

    // Conakry
    const c = CITIES[0];
    push(c.lon, c.lat, c.region, 2, 26);
    for (const city of CITIES) this.cityVecs.push(new THREE.Vector3(px(city.lon), py(city.lat), relief(city.lon, city.lat) * 0.12));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    geo.setAttribute('aRegion', new THREE.Float32BufferAttribute(region, 1));
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    geo.setAttribute('aHeight', new THREE.Float32BufferAttribute(height, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 1 },
        uAssemble: { value: this.reduced ? 1 : 0 },
        uRegion: { value: -1 },
        uPointer: { value: new THREE.Vector3(99, 99, 0) },
        uPointerOn: { value: 0 },
        uInk: { value: new THREE.Color('#111111') },
        uAccent: { value: new THREE.Color('#E8650A') },
      },
    });
    const points = new THREE.Points(geo, this.mat);
    points.frustumCulled = false;
    this.group!.add(points);
  }

  private resize() {
    if (!this.renderer || !this.camera) return;
    const host = this.hostRef.nativeElement;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.raf) this.renderFrame();
  }

  private onPointer = (e: PointerEvent) => {
    const r = this.hostRef.nativeElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.pointerNdc.on = e.pointerType === 'mouse' ? 1 : 0;
  };

  private onLeave = () => { this.pointerNdc.on = 0; };

  private onVisibility = () => { if (!document.hidden) this.loop(); };

  private loop = () => {
    if (this.raf || this.destroyed) return;
    const tick = () => {
      this.raf = 0;
      if (this.destroyed || !this.visible || document.hidden) return;
      this.renderFrame();
      if (this.reduced) return;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };

  private renderFrame() {
    const THREE = this.three;
    if (!THREE || !this.renderer || !this.scene || !this.camera || !this.group || !this.mat) return;
    const t = this.reduced ? 6 : (performance.now() - this.startTime) / 1000;
    const host = this.hostRef.nativeElement;
    const w = host.clientWidth;
    const h = host.clientHeight;

    const k = this.reduced ? 1 : 0.08;
    this.progressEased += (this.progress - this.progressEased) * k;
    this.shiftEased += (this.shift - this.shiftEased) * k;
    this.pointerOnEased += (this.pointerNdc.on - this.pointerOnEased) * 0.08;
    this.parallax.x += (this.pointerNdc.x * this.pointerNdc.on - this.parallax.x) * 0.04;
    this.parallax.y += (this.pointerNdc.y * this.pointerNdc.on - this.parallax.y) * 0.04;
    const p = this.progressEased;

    // Cadrage : la Guinée occupe ~80 % de la zone, quel que soit le format.
    const aspect = this.camera.aspect;
    const visH = Math.max(5.7 / 0.8, 7.4 / 0.82 / aspect);
    const dist = visH / (2 * TAN);
    const tilt = 0.06 + p * 0.32 + this.parallax.y * 0.03;
    const yaw = this.parallax.x * 0.035;
    this.camera.position.set(
      Math.sin(yaw) * dist * Math.sin(tilt),
      -Math.cos(yaw) * dist * Math.sin(tilt),
      dist * Math.cos(tilt),
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.group.position.x = this.shiftEased * visH * aspect;

    const ppu = h / visH;
    this.mat.uniforms['uSize'].value = this.renderer.getPixelRatio() * ppu * dist * 0.0056;

    if (!this.reduced && t > 3 && t - this.regionClock > 2.6) {
      this.regionClock = t;
      this.region = (this.region + 1) % GUINEA_REGIONS.length;
    }

    const u = this.mat.uniforms;
    u['uTime'].value = t;
    u['uAssemble'].value = this.reduced ? 1 : Math.min(1, t / 2.4);
    u['uRegion'].value = this.region;
    u['uPointerOn'].value = this.pointerOnEased;
    if (this.raycaster && this.plane && this.pointerNdc.on) {
      this.raycaster.setFromCamera(new THREE.Vector2(this.pointerNdc.x, this.pointerNdc.y), this.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.plane, hit)) {
        hit.x -= this.group.position.x;
        (u['uPointer'].value as THREE_NS.Vector3).copy(hit);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.placeLabels(THREE, w, h, t);
  }

  /** Étiquettes : Conakry en permanence, et le chef-lieu de la région mise en avant. */
  private placeLabels(THREE: Three, w: number, h: number, t: number) {
    if (!this.camera || !this.group) return;
    const v = new THREE.Vector3();
    const ready = this.reduced || t > 2.6;
    this.cityEls.forEach((el, i) => {
      const c = this.cityVecs[i];
      if (!c) return;
      v.set(c.x + this.group!.position.x, c.y, c.z).project(this.camera!);
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0)`;
      el.classList.toggle('is-on', ready && (i === 0 || CITIES[i].region === this.region));
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.mo?.disconnect();
    const target = this.el.nativeElement;
    target.removeEventListener('pointermove', this.onPointer);
    target.removeEventListener('pointerleave', this.onLeave);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene?.traverse((o) => {
      const m = o as THREE_NS.Points;
      m.geometry?.dispose();
      (m.material as THREE_NS.Material | undefined)?.dispose?.();
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Silhouette SVG (repli sans WebGL et affiche avant chargement). viewBox 0 0 750 575. */
function buildSvgPath(): string {
  const parts: string[] = [];
  for (const reg of GUINEA_REGIONS) {
    for (const ring of reg.rings) {
      const d = ring.map(([lon, lat], i) => {
        const x = (px(lon) + 3.75) * 100;
        const y = (2.85 - py(lat)) * 100;
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join('');
      parts.push(d + 'Z');
    }
  }
  return parts.join('');
}
