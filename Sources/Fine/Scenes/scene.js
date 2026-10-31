(() => {
  var __defProp = Object.defineProperty;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // Sources/Fine/Scenes/ascii-rest/mount.ts
  function mount(el, piece, options = {}) {
    const make = typeof piece === "function" ? piece : piece.default;
    const meta = typeof piece === "function" ? {} : piece.meta;
    const { fps = meta.fps ?? 30, motion = false, ...rest } = { ...meta.options, ...options };
    const frame = make(rest);
    const { cols = 80, rows = 24, palette, ground, cell = 2 } = meta;
    const canvas = el instanceof HTMLCanvasElement ? el : null;
    const color = palette && canvas ? new Uint8Array(cols * rows) : undefined;
    const rgb = (css) => css[0] === "#" ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16)) : (css.match(/[\d.]+/g) || []).map(Number);
    const dark = (css) => {
      const c = rgb(css);
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 128;
    };
    const env = () => ({ paper: canvas && ground ? !dark(ground) : dark(getComputedStyle(el).color), color });
    let t = 0;
    let draw = () => {
      el.textContent = frame(t, env());
    };
    let ro;
    if (canvas) {
      const font = (px) => `${px}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      const ctx = canvas.getContext("2d");
      const atlas = document.createElement("canvas");
      const actx = atlas.getContext("2d");
      const slots = new Map;
      let w = 0, h = 0, sw = 0, sh = 0, pw = 0, ph = 0, width = -1, ink = "";
      let xs = new Int32Array(0), ys = new Int32Array(0), gx = new Int32Array(0), gy = new Int32Array(0);
      let last2 = "", full = true;
      const lastColor = color && new Uint8Array(cols * rows);
      canvas.style.display ||= "block";
      canvas.style.width ||= "100%";
      canvas.style.aspectRatio = `${cols} / ${rows * cell}`;
      const size = () => {
        width = canvas.clientWidth;
        w = width * (devicePixelRatio || 1) / cols;
        h = w * cell;
        sw = Math.ceil(w);
        sh = Math.ceil(h);
        pw = sw + 2;
        ph = sh + 2;
        canvas.width = Math.round(w * cols);
        canvas.height = Math.round(h * rows);
        atlas.width = pw * 32;
        atlas.height = ph * 32;
        xs = Int32Array.from({ length: cols + 1 }, (_, x) => Math.round(x * w));
        ys = Int32Array.from({ length: rows + 1 }, (_, y) => Math.round(y * h));
        gx = Int32Array.from({ length: cols }, (_, x) => Math.round(x * w + (w - sw) / 2));
        gy = Int32Array.from({ length: rows }, (_, y) => Math.round(y * h + (h - sh) / 2));
        slots.clear();
        full = true;
      };
      const glyph = (code, i) => {
        const key = code * 256 + i;
        let s = slots.get(key);
        if (s !== undefined)
          return s;
        if (slots.size === 1024) {
          actx.clearRect(0, 0, atlas.width, atlas.height);
          slots.clear();
        }
        s = slots.size;
        const x = s % 32 * pw + 1, y = Math.floor(s / 32) * ph + 1;
        actx.font = font(w / 0.6);
        actx.textAlign = "center";
        actx.textBaseline = "middle";
        actx.fillStyle = palette ? palette[i] || palette[0] : ink;
        actx.save();
        actx.beginPath();
        actx.rect(x - 1, y - 1, pw, ph);
        actx.clip();
        actx.fillText(String.fromCharCode(code), x + sw / 2, y + sh / 2);
        actx.restore();
        slots.set(key, s);
        return s;
      };
      draw = () => {
        if (!palette && getComputedStyle(canvas).color !== ink) {
          ink = getComputedStyle(canvas).color;
          slots.clear();
          actx.clearRect(0, 0, atlas.width, atlas.height);
          full = true;
        }
        const text = frame(t, env());
        if (ground)
          ctx.fillStyle = ground;
        if (full) {
          if (ground)
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          else
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        for (let k = 0, x = 0, y = 0;k < text.length; k++) {
          const c = text.charCodeAt(k);
          if (c === 10) {
            x = 0;
            y++;
            continue;
          }
          const i = y * cols + x;
          if (full || c !== last2.charCodeAt(k) || color && color[i] !== lastColor[i]) {
            const x0 = xs[x], y0 = ys[y], cw = xs[x + 1] - x0, ch = ys[y + 1] - y0;
            if (!full) {
              if (ground)
                ctx.fillRect(x0, y0, cw, ch);
              else
                ctx.clearRect(x0, y0, cw, ch);
            }
            if (c !== 32) {
              const s = glyph(c, color ? color[i] : 0);
              ctx.drawImage(atlas, s % 32 * pw + 1 + x0 - gx[x], Math.floor(s / 32) * ph + 1 + y0 - gy[y], cw, ch, x0, y0, cw, ch);
            }
          }
          x++;
        }
        last2 = text;
        if (color)
          lastColor.set(color);
        full = false;
      };
      size();
      ro = new ResizeObserver(() => {
        if (canvas.clientWidth !== width) {
          size();
          draw();
        }
      });
      ro.observe(canvas);
    }
    draw();
    if (!fps)
      return () => ro?.disconnect();
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let seen = false;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      if (dt < 1000 / fps - 2)
        return;
      last = now;
      t += Math.min(dt, 100) / 1000;
      draw();
    };
    const run = () => {
      const go = seen && !document.hidden && (motion || !still.matches);
      if (go && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (!go && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const io = new IntersectionObserver((entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      run();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", run);
    still.addEventListener("change", run);
    return () => {
      io.disconnect();
      ro?.disconnect();
      cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener("visibilitychange", run);
      still.removeEventListener("change", run);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/alpine-dawn.ts
  var exports_alpine_dawn = {};
  __export(exports_alpine_dawn, {
    default: () => alpineDawn,
    meta: () => meta
  });
  var meta = {
    name: "alpine dawn",
    category: "scenes",
    note: "snow peaks catching first light above a still, misty mountain lake",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#090c18",
    palette: [
      "#0e1430",
      "#151d40",
      "#1d2752",
      "#263365",
      "#314179",
      "#3e508c",
      "#4f62a0",
      "#6577b3",
      "#8090c4",
      "#9eaad3",
      "#bec6e2",
      "#4b3e6c",
      "#6a5482",
      "#8c6a92",
      "#b0829c",
      "#cf96a4",
      "#e8a9a8",
      "#f5bcaa",
      "#ffd0b0",
      "#ffe2c2",
      "#fff1e0",
      "#fdfaf6",
      "#ffc887",
      "#f7a965",
      "#f2a08f",
      "#e58a87",
      "#f8b59d",
      "#d97b7e",
      "#7a4c4a",
      "#a5654f",
      "#523a4a",
      "#1b2034",
      "#262c45",
      "#363c59",
      "#0a1418",
      "#0f1f24",
      "#162a2f",
      "#203a3c",
      "#a3a7c6",
      "#c6c3d8",
      "#e0d4dc",
      "#5a4f7e",
      "#7b6c9c",
      "#9a8cb6",
      "#b8a8c8",
      "#d8bccb"
    ]
  };
  var W = 200;
  var H = 100;
  var K = 0.62;
  var HZ = 56.5;
  var CAM = 1.5;
  var SHORE_Z = 46;
  var SHORE = 62;
  var SUN = [151, 50];
  var DOTS = " ·•●";
  var COVER = [0, 0.3, 0.6, 1];
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash(x0, yi), b = hash(x1, yi), c = hash(x0, yi + 1), d = hash(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  function ridged(x, y, octaves) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      const v = 1 - Math.abs(2 * noise(x * f + i * 17.3, y * f, 0) - 1);
      s += amp * v * v;
      n += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return s / n;
  }
  var clamp = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth = (a, b, v) => {
    const k = clamp((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix = (a, b, k) => a + (b - a) * k;
  var hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var PEAKS = [
    [66, 11, 140, 0.95, 0.3],
    [38, 26, 115, 1.1, -0.15],
    [116, 22, 175, 0.9, 0.2],
    [92, 33, 150, 1, 0.1],
    [96, 25, 340, 1.1, 0.4],
    [180, 38, 200, 1.5, -0.1],
    [8, 30, 160, 1.2, 0.25]
  ].map(([sx, row, z, f, a]) => {
    const h = CAM + (HZ - row) / 100 * K * z - 1.5;
    return [(sx - 100) / 100 * K * z, z, h, h * f, Math.cos(a), Math.sin(a)];
  });
  function terrain(x, z) {
    let h = 0;
    for (const [px, pz, ph, pr, c, s] of PEAKS) {
      const dx = x - px, dz = z - pz;
      const rx = dx * c - dz * s, rz = dx * s + dz * c;
      const v = ph * (1 - (Math.abs(rx) + Math.abs(rz)) / pr);
      if (v > h)
        h = v;
    }
    const hills = (1 + 3 * fbm(x * 0.04, z * 0.04, 3, 0)) * smooth(SHORE_Z, SHORE_Z + 15, z);
    if (hills > h)
      h = hills;
    h += ((ridged(x * 0.06, z * 0.06, 3) - 0.45) * 6 + (ridged(x * 0.2, z * 0.2, 2) - 0.45) * 1.6) * smooth(4, 22, h);
    return h;
  }
  function march(u, v, oy) {
    let z = SHORE_Z, prev = z;
    for (let i = 0;i < 260 && z < 520; i++) {
      const gap = oy + v * z - terrain(u * z, z);
      if (gap < 0) {
        let a = prev, b = z;
        for (let j = 0;j < 7; j++) {
          const m = (a + b) / 2;
          if (oy + v * m - terrain(u * m, m) < 0)
            b = m;
          else
            a = m;
        }
        return b;
      }
      prev = z;
      z += Math.max(0.35, gap * 0.45) + z * 0.002;
    }
    return 0;
  }
  function alpineDawn() {
    const P = meta.palette.map(hex);
    const N = W * H;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const L = (() => {
      const v = [0.9, 0.3, 0.14];
      const n = Math.hypot(...v);
      return v.map((c) => c / n);
    })();
    const SR = SHORE;
    const depth = new Float32Array(SR * W);
    const alt = new Float32Array(SR * W);
    const sun = new Float32Array(SR * W);
    const snow = new Float32Array(SR * W);
    const up = new Float32Array(SR * W);
    for (let r = 0;r < SR; r++) {
      const v = (HZ - (r + 0.5)) / 100 * K;
      for (let x = 0;x < W; x++) {
        const u = (x + 0.5 - 100) / 100 * K;
        const z = march(u, v, CAM);
        const k = r * W + x;
        if (!z)
          continue;
        const px = u * z, py = CAM + v * z;
        const e = 0.35;
        const hx = (terrain(px + e, z) - terrain(px - e, z)) / (2 * e);
        const hz2 = (terrain(px, z + e) - terrain(px, z - e)) / (2 * e);
        const nl = Math.hypot(hx, 1, hz2);
        const nx = -hx / nl, ny = 1 / nl, nz = -hz2 / nl;
        let lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        if (lit > 0) {
          for (let s = 0.8;s < 160; s += 0.6 + s * 0.04) {
            const qx = px + L[0] * s, qy = py + L[1] * s + 0.15, qz = z + L[2] * s;
            if (qz < SHORE_Z)
              break;
            if (qy < terrain(qx, qz)) {
              lit = 0;
              break;
            }
          }
        }
        depth[k] = z;
        alt[k] = py;
        sun[k] = lit;
        up[k] = ny;
        const grain = fbm(px * 0.4, py * 0.25, 2, 0);
        const gully = ridged(px * 0.22 + z * 0.05, py * 0.045, 2);
        snow[k] = smooth(0.36, 0.52, ny + 0.3 * (grain - 0.5)) * smooth(5, 11, py + 5 * grain) * (1 - 0.75 * smooth(0.62, 0.85, gully));
      }
    }
    const rim = new Uint8Array(SR * W);
    for (let k = W;k < SR * W; k++)
      rim[k] = depth[k] && !depth[k - W] && sun[k] > 0 ? 1 : 0;
    const treeTop = new Float32Array(W);
    for (let x = 0;x < W; x++)
      treeTop[x] = SHORE - 0.6 - 1.2 * fbm(x * 0.06, 2.3, 2, 0);
    for (let tx = -2;tx < W + 2; tx += 1.6 + hash(tx * 9, 7) * 2.2) {
      const tip = SHORE - 2.6 - hash(tx * 3, 8) * 4 - 1.5 * smooth(60, 0, tx);
      const slope = 1.1 + hash(tx * 5, 9) * 0.5;
      for (let x = Math.max(0, Math.floor(tx - 6));x < Math.min(W, tx + 6); x++) {
        treeTop[x] = Math.min(treeTop[x], tip + Math.abs(x + 0.5 - tx) * slope);
      }
    }
    const LR = H - SHORE;
    const src = new Float32Array(LR * W);
    for (let r = SHORE;r < H; r++) {
      const v = (HZ - (r + 0.5)) / 100 * K;
      for (let x = 0;x < W; x++) {
        const u = (x + 0.5 - 100) / 100 * K;
        const z = march(u, -v, -CAM);
        const vs = -v - (z ? 2 * CAM / z : 0);
        let row = HZ - vs * 100 / K - 0.5;
        const mirror = 2 * SHORE - 1 - r;
        if (mirror >= treeTop[x])
          row = mirror;
        src[(r - SHORE) * W + x] = row;
      }
    }
    const fg = new Uint8Array(N);
    const fgShade = new Float32Array(N);
    const fgRim = new Float32Array(N);
    const PINES = [
      [9, 5, 1.15],
      [20, 38, 0.85],
      [32, 66, 0.5],
      [192, 10, 1.15],
      [181, 40, 0.75],
      [204, 26, 1]
    ];
    for (let r = 0;r < H; r++) {
      for (let x = 0;x < W; x++) {
        const k = r * W + x;
        const y = r + 0.5;
        const bankL = 88 + 14 * smooth(0, 52, x) + 2 * fbm(x * 0.2, 1, 2, 0);
        const bankR = 90 + 12 * smooth(W, W - 40, x) + 2 * fbm(x * 0.2, 4, 2, 0);
        if (y > bankL || y > bankR)
          fg[k] = 1, fgShade[k] = 0.15 * hash(x, r);
        for (const [px, tip, s] of PINES) {
          const d = y - tip;
          if (d < 0)
            continue;
          const tier = 3.4 * s;
          const f = d / tier - Math.floor(d / tier);
          const hw = (0.4 + d * 0.2) * (0.5 + 0.5 * f) * (1 + 0.6 * (hash(r, Math.floor(px) * 7) - 0.5) * smooth(0, 8, d));
          const dx = x + 0.5 - px;
          if (Math.abs(dx) <= hw) {
            fg[k] = 2;
            const edge = hw - Math.abs(dx) < 1;
            const sunward = px < SUN[0] ? dx > 0 : dx < 0;
            fgShade[k] = edge ? sunward ? 1 : 0.5 : 0.3 * hash(x * 3, r * 5);
            fgRim[k] = edge ? smooth(70, 44, y) * (0.75 + 0.25 * hash(x, r * 7)) : 0;
          }
        }
      }
    }
    const MW = 480, M0 = 36, MR = SHORE + 2 - M0;
    const mist = new Float32Array(MW * MR);
    for (let r = 0;r < MR; r++) {
      for (let x = 0;x < MW; x++) {
        const y = r + M0;
        const q = fbm(x * 0.0125, y * 0.1, 2, MW * 0.0125);
        mist[r * MW + x] = fbm(x * 0.025 + q * 1.4, y * 0.22 + q, 4, MW * 0.025);
      }
    }
    const CW = 640, CR = 34;
    const cloud = new Float32Array(CW * CR);
    for (let r = 0;r < CR; r++) {
      for (let x = 0;x < CW; x++) {
        const y = r + 0.5;
        const q = fbm(x * 0.0125, y * 0.12, 2, 8);
        const c = fbm(x * 0.025 + q * 2, y * 0.2 + q * 0.8, 4, 16);
        cloud[r * CW + x] = smooth(0.52, 0.7, c - 0.06 * Math.abs(y - 18) / 10) * smooth(5, 13, y) * smooth(33, 24, y);
      }
    }
    const hz = new Float32Array(N);
    for (let k = 0;k < N; k++)
      hz[k] = fbm(k % W * 0.03, Math.floor(k / W) * 0.06, 3, 0);
    const skyR = new Float32Array(SR * W), skyG = new Float32Array(SR * W), skyB = new Float32Array(SR * W);
    const glowA = new Float32Array(SR * W);
    for (let r = 0;r < SR; r++) {
      for (let x = 0;x < W; x++) {
        const y = r + 0.5;
        const v = clamp(y / 52);
        const east = smooth(20, 190, x);
        const dx = x + 0.5 - SUN[0], dy = (y - SUN[1]) * 2.2;
        const ds = Math.sqrt(dx * dx + dy * dy);
        const low = Math.pow(v, 1.9);
        const veil = (hz[r * W + x] - 0.5) * 0.1 * (1 - v);
        let cr = 0.03 + veil + low * (0.56 + 0.2 * east);
        let cg = 0.04 + veil + low * (0.48 + 0.02 * east);
        let cb = 0.13 + veil * 1.6 + low * (0.62 - 0.12 * east);
        skyR[r * W + x] = cr;
        skyG[r * W + x] = cg;
        skyB[r * W + x] = cb;
        glowA[r * W + x] = Math.exp(-ds / 6) * 0.65 + Math.exp(-ds / 15) * 0.2 + Math.exp(-ds / 50) * 0.1;
      }
    }
    const AR = new Float32Array(SR * W), AG = new Float32Array(SR * W), AB = new Float32Array(SR * W);
    const FR = new Float32Array(N), FG = new Float32Array(N), FB = new Float32Array(N);
    const floor = new Float32Array(N);
    const fade = new Float32Array(N).fill(1);
    const wisp = new Float32Array(W);
    return (t, { color } = {}) => {
      const warm = 0.75 - 0.5 * Math.exp(-t / 60);
      const line = 6 + 4 * Math.exp(-t / 70);
      const drift = t * 1.1;
      const pulse = 1 + 0.06 * Math.sin(t / 8 * Math.PI * 2);
      for (let x = 0;x < W; x++)
        wisp[x] = noise((x + drift * 0.6) * 0.06, 3.7, 0);
      const lr = 1, lg = mix(0.6, 0.8, warm), lb = mix(0.55, 0.4, warm);
      for (let r = 0;r < SR; r++) {
        const y = r + 0.5;
        for (let x = 0;x < W; x++) {
          const k = r * W + x;
          const gl = glowA[k] * pulse;
          const gg = 0.62 + 0.28 * smooth(0.15, 0.7, gl);
          let cr = skyR[k] + gl, cg = skyG[k] + gl * gg, cb = skyB[k] + gl * (gg - 0.22), fl = 0.21;
          const z = depth[k];
          if (z) {
            const sn = snow[k];
            const lit = sun[k] * smooth(line, line + 7, alt[k]);
            const amb = (0.55 + 0.45 * up[k]) * (0.55 + 0.5 * smooth(4, 34, alt[k]));
            const sl = smooth(0.08, 0.24, lit);
            const gold = clamp(0.6 * smooth(0.25, 0.8, lit) + 0.5 * smooth(14, 36, alt[k]));
            const br = 0.78 + 0.3 * lit;
            const sr = mix(0.13 * amb, lr * br, sl);
            const sg = mix(0.17 * amb, mix(lg - 0.12, lg + 0.14, gold) * br, sl);
            const sb = mix(0.36 * amb, mix(lb + 0.02, lb + 0.12, gold) * br, sl);
            const rr = mix(0.06, 0.4, sl), rg = mix(0.07, 0.2, sl), rb = mix(0.14, 0.2, sl);
            cr = mix(rr, sr, sn);
            cg = mix(rg, sg, sn);
            cb = mix(rb, sb, sn);
            const wood = smooth(9, 4, alt[k]) * smooth(110, 75, z);
            cr = mix(cr, 0.07, wood);
            cg = mix(cg, 0.09, wood);
            cb = mix(cb, 0.18, wood);
            const fog = smooth(16, 3, alt[k]) * smooth(70, 150, z) * 0.6;
            const haze = Math.max(fog, clamp(1 - Math.exp(-(z - SHORE_Z) / 260)) * 0.45);
            cr = mix(cr, skyR[k] + gl, haze);
            cg = mix(cg, skyG[k] + gl * gg, haze);
            cb = mix(cb, skyB[k] + gl * (gg - 0.22), haze);
            if (rim[k] && sl > 0.3) {
              const a = rim[k] * sl;
              cr = mix(cr, 1, a);
              cg = mix(cg, mix(0.89, 0.95, warm), a);
              cb = mix(cb, mix(0.76, 0.88, warm), a);
            }
            fl = mix(mix(0.42, 0.3, wood), 0.04, sl);
          } else {
            if (y < 34 && hash(x, r * 3 + 11) > 0.985) {
              const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + hash(x, r) * 3) + hash(r, x) * 6.28);
              const s = tw * smooth(150, 40, x) * smooth(34, 6, y) * 0.75;
              cr = Math.max(cr, s * 0.9);
              cg = Math.max(cg, s * 0.92);
              cb = Math.max(cb, s);
            }
            if (r < CR) {
              const sx = x + t * 0.8, ix = Math.floor(sx), fx = sx - ix;
              const c0 = cloud[r * CW + ix % CW], c1 = cloud[r * CW + (ix + 1) % CW];
              const c = (c0 + (c1 - c0) * fx) * (0.35 + 0.65 * smooth(40, 150, x));
              if (c > 0.01) {
                const g = Math.exp(-Math.hypot(x + 0.5 - SUN[0], (y - SUN[1]) * 1.6) / 55);
                const b = clamp(0.25 + 0.9 * g);
                const kr = mix(0.32, 1, b), kg = mix(0.24, mix(0.62, 0.74, warm), b), kb = mix(0.4, 0.5, b);
                cr = mix(cr, kr, c * 0.75);
                cg = mix(cg, kg, c * 0.75);
                cb = mix(cb, kb, c * 0.75);
              }
            }
            const dx = x + 0.5 - SUN[0], dy = y - SUN[1];
            const ds = Math.sqrt(dx * dx + dy * dy);
            if (ds < 4.5) {
              const a = smooth(4.5, 3.3, ds);
              cr = mix(cr, 1, a);
              cg = mix(cg, 0.96, a);
              cb = mix(cb, 0.86, a);
            }
          }
          const e = smooth(20, 170, x) * (0.6 + 0.4 * warm);
          const near = Math.exp(-Math.abs(x + 0.5 - SUN[0]) / 22) * 0.3;
          const mr = mix(0.48, 0.9, e) + near, mg = mix(0.46, 0.7, e) + near * 0.75, mb = mix(0.7, 0.7, e) + near * 0.5;
          if (r >= M0) {
            const m = mist[(r - M0) * MW + Math.floor(x + drift) % MW];
            const edge = 5 * (m - 0.5) + 4 * (wisp[x] - 0.5);
            const band = smooth(M0 + 14, SHORE - 3, y + edge);
            const a = (0.3 + 0.7 * smooth(0.32, 0.64, m)) * band * 0.6;
            cr = mix(cr, mr, a);
            cg = mix(cg, mg, a);
            cb = mix(cb, mb, a);
            if (a > 0.05)
              fl = Math.max(fl, 0.2);
          }
          if (y >= treeTop[x]) {
            const s = 0.4 + 0.6 * hash(x * 7, r * 3);
            cr = 0.04 + 0.03 * s;
            cg = 0.06 + 0.04 * s;
            cb = 0.1 + 0.05 * s;
            fl = 0;
            const m = mist[(r - M0) * MW + Math.floor(x * 0.7 + drift * 1.9 + 211) % MW];
            const a = smooth(0.45, 0.72, m) * smooth(treeTop[x] + 1, SHORE, y) * 0.6;
            cr = mix(cr, mr, a);
            cg = mix(cg, mg, a);
            cb = mix(cb, mb, a);
          }
          AR[k] = cr;
          AG[k] = cg;
          AB[k] = cb;
          FR[k] = cr;
          FG[k] = cg;
          FB[k] = cb;
          floor[k] = fl;
        }
      }
      for (let r = SHORE;r < H; r++) {
        const y = r + 0.5;
        const d = (y - SHORE) / LR;
        for (let x = 0;x < W; x++) {
          const k = r * W + x;
          const w1 = noise(x * 0.045 + t * 0.06, y * 0.5 - t * 0.35, 0);
          const w2 = noise(x * 0.12 - t * 0.1, y * 1.1 - t * 0.7, 0);
          const sway = (w1 - 0.5) * (0.4 + 1.4 * d) + (w2 - 0.5) * 0.5;
          const sx = Math.max(0, Math.min(W - 1, Math.round(x + sway)));
          const sr = Math.max(0, Math.min(SR - 1, Math.round(src[(r - SHORE) * W + x] + (w2 - 0.5) * 0.6 * d)));
          const sk = sr * W + sx;
          const refl = 0.68 - 0.32 * d;
          const w3 = noise(x * 0.03 + t * 0.04, y * 1.9 - t * 0.45, 0);
          const lift = 1 + (w3 - 0.5) * (0.4 + 0.5 * d);
          const ar = AR[sk], ag = AG[sk], ab = AB[sk];
          const grey = (ar + ag + ab) / 3;
          const deep = (hz[k] - 0.5) * 0.1 * d;
          let cr = 0.02 + deep + mix(grey, ar, 0.75) * refl * lift;
          let cg = 0.035 + deep + mix(grey, ag, 0.75) * refl * lift;
          let cb = 0.07 + deep * 1.6 + mix(grey, ab, 0.75) * refl * lift;
          const roadW = 1.5 + (y - SHORE) * 0.45;
          const road = Math.exp(-(((x + 0.5 - SUN[0]) / roadW) ** 2));
          const glint = smooth(0.55, 0.85, w2) * road * (0.5 + 0.5 * warm);
          cr += glint;
          cg += glint * 0.8;
          cb += glint * 0.6;
          FR[k] = cr;
          FG[k] = cg;
          FB[k] = cb;
          floor[k] = 0.26;
          fade[k] = smooth(H + 2, H - 22, y);
          if (r === SHORE) {
            FR[k] = 0.06;
            FG[k] = 0.12;
            FB[k] = 0.14;
            floor[k] = 0;
          }
        }
      }
      for (let k = 0;k < N; k++) {
        if (!fg[k])
          continue;
        const s = fgShade[k];
        FR[k] = 0.02 + 0.05 * s;
        FG[k] = 0.04 + 0.06 * s;
        FB[k] = 0.05 + 0.06 * s;
        floor[k] = 0;
        const e = fgRim[k];
        if (e > 0 && s === 1) {
          FR[k] = mix(FR[k], 0.62, e), FG[k] = mix(FG[k], 0.4, e), FB[k] = mix(FB[k], 0.38, e);
          floor[k] = 0.12 * e;
        } else if (e > 0 && s === 0.5) {
          FR[k] = mix(FR[k], 0.2, e), FG[k] = mix(FG[k], 0.22, e), FB[k] = mix(FB[k], 0.36, e);
          floor[k] = 0.22 * e;
        }
        fade[k] = 1;
      }
      for (let r = 0;r < H; r++) {
        for (let x = 0;x < W; x++) {
          const k = r * W + x;
          const cr = FR[k], cg = FG[k], cbl = FB[k], fl = floor[k];
          const peak = Math.max(cr, cg, cbl, 0.0001);
          const level = clamp(fl + (1 - fl) * Math.pow(peak, 1.1)) * fade[k];
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER[step]) : 0;
            const s = (0.3 + 0.7 * want) * mix(0.5, 1, smooth(0.08, 0.5, peak)) / peak;
            color[k] = nearest(clamp(cr * s), clamp(cg * s), clamp(cbl * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H; r++)
        lines.push(out.slice(r * W, (r + 1) * W).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/aurora-fjord.ts
  var exports_aurora_fjord = {};
  __export(exports_aurora_fjord, {
    default: () => auroraFjord,
    meta: () => meta2
  });
  var meta2 = {
    name: "aurora fjord",
    category: "scenes",
    note: "aurora curtains rippling over a still fjord, a cabin lit on the shore",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#05080f",
    palette: [
      "#0b1322",
      "#101b30",
      "#16243f",
      "#1e3050",
      "#2a3f63",
      "#0e3a33",
      "#11573f",
      "#167a4c",
      "#22a05c",
      "#3ccb73",
      "#7cf0a0",
      "#c8ffdc",
      "#0f5f5c",
      "#16877f",
      "#2cb5a6",
      "#7fe6d6",
      "#2a1f52",
      "#432b78",
      "#6a3c9f",
      "#9558c6",
      "#c48ae4",
      "#363a72",
      "#4f5596",
      "#1b4f63",
      "#1a2236",
      "#283350",
      "#3b4a6e",
      "#566a92",
      "#7d91b8",
      "#a9bad9",
      "#d6e0f2",
      "#9fc9cf",
      "#0f1a1c",
      "#173128",
      "#24493a",
      "#4a1517",
      "#7c2420",
      "#b23a2a",
      "#d65aa8",
      "#ffd27c",
      "#ffb04a",
      "#fff2c4",
      "#eef3ff"
    ]
  };
  var W2 = 200;
  var H2 = 100;
  var WL = 62;
  var DOTS2 = " ·•●";
  var COVER2 = [0, 0.3, 0.6, 1];
  var BAYER2 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var AIR = 0;
  var NEAR = 1;
  var FAR = 2;
  var SHORE2 = 3;
  var WALL = 4;
  var ROOF = 5;
  var PANE = 6;
  var TREE = 7;
  var DOOR = 8;
  var CAB = [142, 161];
  var PANES = [[145, 148], [156, 159]];
  var DOOR_X = [150, 152];
  var LAMPS = [[147, 1], [158, 0.8]];
  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm2(x, y, octaves) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise2(x * f, y * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp2 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth2 = (a, b, v) => {
    const k = clamp2((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix2 = (a, b, k) => a + (b - a) * k;
  var hex2 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var LEFT = [[25, 38, 1.3], [6, 29, 0.9], [50, 25, 1], [72, 13, 0.6]];
  var RIGHT = [[172, 30, 1.15], [194, 24, 0.85], [151, 16, 1], [212, 22, 0.6]];
  var DISTANT = [[100, 10, 0.5], [119, 12, 0.55], [86, 7, 0.45], [134, 8, 0.5]];
  function range(x, peaks, seed, rough) {
    let m = -99, px = 0;
    for (const [cx, h, s] of peaks) {
      const v = h - Math.abs(x - cx) * s;
      if (v > m)
        m = v, px = cx;
    }
    const j = rough * (fbm2(x * 0.09, seed, 3) - 0.5) + rough * 0.45 * (noise2(x * 0.45, seed + 5) - 0.5);
    return [m + j * Math.min(1, Math.max(0, m) / 6), px];
  }
  function auroraFjord() {
    const P = meta2.palette.map(hex2);
    const N = W2 * H2;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const mat = new Uint8Array(N);
    const sr = new Float32Array(N), sg = new Float32Array(N), sb = new Float32Array(N);
    const rec = new Float32Array(N);
    const rim = new Float32Array(N);
    const nearTop = new Float32Array(W2), farTop = new Float32Array(W2), peakX = new Float32Array(W2);
    for (let x = 0;x < W2; x++) {
      const [hl, pl] = range(x + 0.5, LEFT, 3.1, 4);
      const [hr, pr] = range(x + 0.5, RIGHT, 7.7, 4);
      const [hd] = range(x + 0.5, DISTANT, 11.3, 2.2);
      nearTop[x] = WL - Math.max(hl, hr, 0);
      peakX[x] = hl > hr ? pl : pr;
      farTop[x] = WL - Math.max(hd, 0);
    }
    const shoreTop = (x) => WL - 2.2 * smooth2(134, 140, x) * smooth2(178, 168, x) - 0.6 * noise2(x * 0.3, 2);
    const cabBase = WL - 2.2;
    for (let r = 0;r < WL; r++) {
      for (let x = 0;x < W2; x++) {
        const k = r * W2 + x;
        const y = r + 0.5;
        if (y >= nearTop[x]) {
          mat[k] = NEAR;
          const px = peakX[x];
          const side = x + 0.5 - px;
          const depth = y - nearTop[x];
          const height = WL - nearTop[x];
          const ridge = px + (depth + 1) * 0.6 * (noise2(y * 0.1, px) - 0.5);
          const inward = px < 100 ? 1 : -1;
          const face = smooth2(-4, 4, (x + 0.5 - ridge) * inward);
          const u = x + depth * 0.45 * Math.sign(side || 1);
          const rib = (v) => fbm2(v * 0.13, px * 0.37, 3);
          const grad = (rib(u + 1) - rib(u - 1)) * 7 * inward;
          const reach = 3 + height * (0.62 + 0.42 * rib(u + 40));
          const streak = smooth2(0.56, 0.64, fbm2(u * 0.32, y * 0.035 + px, 3)) * smooth2(1, 5, depth);
          const cx = x + 0.5 - 152;
          const wood = WL - 18.5 + 9 * (cx / 19) ** 2 + 1.5 * (noise2(x * 0.7, 9) - 0.5) - 2.6 * hash2(x, 77) * (x & 1 ? 1 : 0.3);
          const snow = smooth2(reach + 1.6, reach - 1.6, depth) * (1 - smooth2(WL - 3, WL - 0.5, y)) * (1 - 0.5 * streak);
          const lit = clamp2(0.35 + 0.55 * face + grad * 0.5);
          const rv = 0.75 + 0.5 * fbm2(x * 0.4, y * 0.4, 2);
          const rr = (0.05 + 0.03 * lit) * rv, rg = (0.065 + 0.035 * lit) * rv, rb = (0.11 + 0.05 * lit) * rv;
          const s = 0.34 + 0.66 * Math.pow(lit, 1.5);
          sr[k] = mix2(rr, 0.62 * s + 0.04, snow);
          sg[k] = mix2(rg, 0.7 * s + 0.05, snow);
          sb[k] = mix2(rb, 0.86 * s + 0.09, snow);
          rec[k] = snow * (0.25 + 0.75 * lit) + 0.06;
          rim[k] = smooth2(2.2, 0.3, depth) * 0.5;
          if (y > wood && cx > -14 - 2 * hash2(r, 3) && cx < 13 + 2 * hash2(r, 4)) {
            mat[k] = TREE;
            const h = hash2(x * 13 + r, 5);
            sr[k] = 0.02 + 0.03 * h, sg[k] = 0.045 + 0.045 * h, sb[k] = 0.06 + 0.04 * h;
            rec[k] = 0.05;
            rim[k] = smooth2(wood + 1.6, wood + 0.2, y) * (0.7 + 0.3 * h);
          }
        } else if (y >= farTop[x]) {
          mat[k] = FAR;
          const depth = y - farTop[x];
          const snow = smooth2(0.5, 0.62, fbm2(x * 0.18, y * 0.25, 3) * 0.6 + (1 - depth / 7) * 0.55);
          const lit = 0.5 + 0.3 * (noise2(x * 0.25, y * 0.1) - 0.5);
          sr[k] = mix2(0.075, 0.22 * lit + 0.12, snow);
          sg[k] = mix2(0.1, 0.27 * lit + 0.15, snow);
          sb[k] = mix2(0.17, 0.36 * lit + 0.24, snow);
          rec[k] = 0.2 + 0.3 * snow;
        }
        if (x > 132 && x < 180 && y >= shoreTop(x)) {
          mat[k] = SHORE2;
          const f = 0.6 + 0.3 * fbm2(x * 0.3, y * 0.5, 2);
          sr[k] = 0.26 * f, sg[k] = 0.3 * f, sb[k] = 0.42 * f;
          rec[k] = 0.4;
          rim[k] = 0;
        }
      }
    }
    const spruce = (tx, th, tw, tb, guard) => {
      for (let r = Math.max(0, Math.floor(tb - th));r < WL; r++) {
        const y = r + 0.5, dy = y - (tb - th);
        if (dy < 0 || y >= tb + 0.5)
          continue;
        const tier = (dy + th * 0.3) / 1.8;
        const w = dy / th * tw * (0.7 + 0.45 * (tier - Math.floor(tier))) + 0.35;
        for (let x = Math.max(0, Math.floor(tx - tw - 1));x <= Math.min(W2 - 1, tx + tw + 1); x++) {
          const k = r * W2 + x;
          const ex = x + 0.5 - tx;
          if (Math.abs(ex) > w || guard && guard(k))
            continue;
          mat[k] = TREE;
          const h = hash2(x * 13 + r, 5);
          const s = ex < 0 ? 0.7 : 0.3;
          sr[k] = 0.02 + 0.03 * s * h, sg[k] = 0.04 + 0.05 * s, sb[k] = 0.055 + 0.045 * s;
          rec[k] = 0.05;
          rim[k] = Math.max(smooth2(1.6, 0.2, dy), ex < 0 && ex < -w + 1 ? 0.45 * smooth2(th, 0, dy) : 0);
        }
      }
    };
    const solid = (k) => mat[k] === WALL || mat[k] === ROOF || mat[k] === PANE || mat[k] === DOOR || mat[k] === SHORE2;
    for (let x = -1;x < W2 + 2; ) {
      const h = hash2(Math.floor(x * 7), 21);
      const open = smooth2(96, 80, x) + smooth2(122, 136, x);
      const onShelf = x > 132 && x < 180;
      if (open > 0.05 && !(x > 136 && x < 166)) {
        const th = (3.2 + hash2(Math.floor(x * 3), 5) * 3 + (hash2(Math.floor(x * 5), 8) > 0.7 ? 2.4 : 0)) * Math.min(1, open) * (onShelf ? 0.7 : 1);
        if (th > 1.5)
          spruce(x + hash2(Math.floor(x), 2), th, 1 + hash2(Math.floor(x), 4) * 0.6, onShelf ? shoreTop(x) - 0.4 : WL + 0.3, onShelf ? solid : null);
      }
      x += 2 + 2.2 * h;
    }
    const eave = cabBase - 7;
    const roofTop = eave - 8;
    const CHIM = CAB[1] - 5, CHIM_TOP = eave - 8.5;
    for (let r = 0;r < WL; r++) {
      for (let x = CAB[0] - 3;x <= CAB[1] + 3; x++) {
        const k = r * W2 + x;
        const y = r + 0.5;
        const cx = (CAB[0] + CAB[1] + 1) / 2;
        if (x >= CAB[0] && x <= CAB[1] && y >= eave && y < cabBase + 0.5) {
          mat[k] = WALL;
          const boards = r & 1 ? 0.82 : 1;
          const s = (0.5 + 0.5 * ((CAB[1] - x) / (CAB[1] - CAB[0]))) * boards;
          sr[k] = 0.7 * s, sg[k] = 0.14 * s, sb[k] = 0.11 * s;
          rim[k] = 0;
          for (const [a, b] of PANES)
            if (x >= a && x <= b && y >= eave + 1.5 && y < cabBase - 2)
              mat[k] = PANE;
          if (x >= DOOR_X[0] && x <= DOOR_X[1] && y >= eave + 1.5) {
            mat[k] = DOOR;
            sr[k] = 0.16, sg[k] = 0.06, sb[k] = 0.05;
          }
        }
        const half = 12.5 - (eave - y) * 1.45;
        if (y >= roofTop && y < eave && Math.abs(x + 0.5 - cx) <= half) {
          mat[k] = ROOF;
          const snowy = y < eave - 1;
          const s = 0.78 + 0.22 * ((cx - x - 0.5) / 12);
          if (snowy)
            sr[k] = 0.78 * s, sg[k] = 0.84 * s, sb[k] = 0.96 * s;
          else
            sr[k] = 0.12, sg[k] = 0.05, sb[k] = 0.06;
          rec[k] = snowy ? 0.5 : 0;
          rim[k] = 0;
        }
        if (x >= CHIM && x <= CHIM + 1 && y >= CHIM_TOP && y < eave - 4) {
          mat[k] = WALL;
          const s = x === CHIM ? 1 : 0.55;
          sr[k] = 0.2 * s, sg[k] = 0.21 * s, sb[k] = 0.27 * s;
          rim[k] = 0;
        }
      }
    }
    for (const [tx, th] of [[134, 7], [137.8, 10], [166.5, 9], [170, 6], [174.5, 8]]) {
      spruce(tx, th, 2.2, shoreTop(tx) + 0.5, (k) => mat[k] === WALL || mat[k] === ROOF || mat[k] === PANE || mat[k] === DOOR);
    }
    const lampLand = new Float32Array(WL * W2);
    for (let r = 0;r < WL; r++) {
      for (let x = 0;x < W2; x++) {
        const k = r * W2 + x, m = mat[k];
        if (m === PANE || m === WALL || m === ROOF || m === DOOR)
          continue;
        let g = 0;
        for (const [lx, s] of LAMPS) {
          const wx = x + 0.5 - lx, wy = r + 0.5 - (cabBase - 2.5);
          const d = Math.sqrt(wx * wx * 0.6 + wy * wy * 2.2);
          g += s * Math.exp(-d / 5.5) * 0.6;
        }
        lampLand[k] = g * (m === AIR ? 0.3 : m === TREE ? 0.4 : 0.75 + 0.5 * hash2(x, r + 31));
      }
    }
    const haze = new Float32Array(WL * W2);
    for (let k = 0;k < WL * W2; k++)
      haze[k] = fbm2(k % W2 * 0.04, Math.floor(k / W2) * 0.07, 3);
    const star = new Float32Array(WL * W2);
    for (let k = 0;k < WL * W2; k++) {
      const h = hash2(k % W2, Math.floor(k / W2) + 101);
      if (h > 0.986)
        star[k] = 0.35 + (h - 0.986) * 45;
    }
    const gap = new Uint8Array(H2);
    for (let r = WL;r < H2; r++)
      gap[r] = hash2(r, 404) < 0.3 ? 1 : 0;
    const baseA = new Float32Array(W2), tallA = new Float32Array(W2), envA = new Float32Array(W2);
    const baseB = new Float32Array(W2), envB = new Float32Array(W2);
    const RAYS = 4 * W2;
    const raysA = new Float32Array(RAYS + 2), raysB = new Float32Array(RAYS + 2);
    const R = new Float32Array(WL * W2), G = new Float32Array(WL * W2), B = new Float32Array(WL * W2);
    const lightX = new Float32Array(W2);
    const ray = (arr, u) => {
      const s = u * 4;
      let i = Math.floor(s);
      const f = s - i;
      i = (i % RAYS + RAYS) % RAYS;
      return arr[i] + (arr[i + 1] - arr[i]) * f;
    };
    return (t, { color } = {}) => {
      for (let x = 0;x < W2; x++) {
        const u = x / W2;
        baseA[x] = 5 + 40 * Math.pow(Math.sin(Math.min(1, u / 0.6) * Math.PI / 2), 1.5) - 13 * smooth2(0.6, 0.95, u) + 2.6 * Math.sin(x * 0.07 - t * 0.55) + 1.4 * Math.sin(x * 0.17 + t * 0.9 + 1.3) + 2.2 * Math.sin(x * 0.22 + t * 1.2) + 4 * (fbm2(x * 0.015 + t * 0.03, 4.2, 2) - 0.5);
        tallA[x] = 11 + 8 * fbm2(x * 0.03 - t * 0.05, 1.7, 2);
        envA[x] = smooth2(0, 0.2, u) * smooth2(0.98, 0.72, u) * (0.4 + 0.8 * fbm2(x * 0.022 - t * 0.07, 8.8, 3));
        baseB[x] = 14 + 4 * Math.sin(x * 0.035 + t * 0.3 + 2) + 1.6 * Math.sin(x * 0.11 - t * 0.7);
        envB[x] = smooth2(0.45, 0.7, u) * smooth2(1.05, 0.85, u) * (0.25 + 0.5 * fbm2(x * 0.03 + t * 0.05, 3.3, 2));
      }
      for (let i = 0;i <= RAYS + 1; i++) {
        const u = i / 4;
        raysA[i] = 0.14 + Math.pow(fbm2(u * 0.6 + t * 0.35, t * 0.12, 3), 2.4) * 2.5;
        raysB[i] = 0.1 + Math.pow(fbm2(u * 0.45 - t * 0.2, 5 + t * 0.1, 3), 2.2) * 2;
      }
      for (let x = 0;x < W2; x++) {
        let s = 0;
        for (let d = -24;d <= 24; d += 6) {
          const xx = Math.min(W2 - 1, Math.max(0, x + d));
          s += envA[xx] + 0.4 * envB[xx];
        }
        lightX[x] = s / 9;
      }
      const flick = 0.92 + 0.05 * Math.sin(t * 2.3) + 0.03 * Math.sin(t * 7.1);
      for (let r = 0;r < WL; r++) {
        const y = r + 0.5;
        const v = y / WL;
        for (let x = 0;x < W2; x++) {
          const k = r * W2 + x;
          const m = mat[k];
          let cr, cg, cb;
          if (m === AIR) {
            const hz = 0.85 + 0.3 * haze[k];
            cr = (0.025 + 0.03 * v * v) * hz;
            cg = (0.04 + 0.07 * v * v) * hz;
            cb = (0.1 + 0.11 * v * v) * hz;
            let a = 0;
            const d = baseA[x] - y;
            if (d > -4 && d < 46) {
              const bend = Math.abs(baseA[Math.min(W2 - 1, x + 1)] - baseA[Math.max(0, x - 1)]);
              const hc = tallA[x];
              const lean = ray(raysA, x + d * 0.22);
              const prof = d < 0 ? Math.exp(-d * d * 0.9) : (1 - Math.exp(-(d + 0.4) * 1.1)) * Math.exp(-d / hc);
              const band = d < 0 ? Math.exp(-d * d) : Math.exp(-d / 3);
              a = (prof * lean + 0.3 * band * (0.55 + 0.45 * Math.min(1.4, lean))) * envA[x] * (1.15 + 0.35 * bend);
              const up = clamp2(d / (hc * 1.6));
              const gk = 1 - smooth2(0, 0.5, up), vk = smooth2(0.4, 0.9, up);
              const tk = 1 - gk - vk;
              cr += a * (0.18 * gk + 0.06 * tk + 0.42 * vk);
              cg += a * (1 * gk + 0.78 * tk + 0.16 * vk);
              cb += a * (0.48 * gk + 0.7 * tk + 0.75 * vk);
              const hem = Math.exp(-((d + 0.6) ** 2) * 1.2) * smooth2(0.3, 0.8, a) * 0.8 * (0.45 + 0.55 * Math.min(1, lean));
              cr += hem * 0.95, cg *= 1 - 0.55 * Math.min(1, hem * 1.6), cb += hem * 0.4;
            }
            const db = baseB[x] - y;
            if (db > -3 && db < 30) {
              const prof = db < 0 ? Math.exp(-db * db) : (1 - Math.exp(-(db + 0.4))) * Math.exp(-db / 9);
              const b = prof * ray(raysB, x + db * 0.18) * envB[x] * 0.85 * smooth2(0, 8, y);
              const up = clamp2(db / 12);
              cr += b * (0.1 + 0.4 * up);
              cg += b * (0.75 - 0.5 * up);
              cb += b * (0.7 + 0.2 * up);
              a += b;
            }
            const below = y - baseA[x];
            const gl = envA[x] * (below > 0 ? Math.exp(-below / 6) * 0.1 : Math.exp(below / 8) * 0.18);
            cr += gl * 0.12, cg += gl * 0.62, cb += gl * 0.52;
            const ag = Math.exp(-(WL - y) / 10) * (0.1 + 0.16 * lightX[x]);
            cg += ag * 0.7, cb += ag * 0.75, cr += ag * 0.2;
            const st = star[k];
            if (st > 0) {
              const tw = 0.7 + 0.3 * Math.sin(t * (1.3 + 3 * hash2(x, r)) + 6.28 * hash2(r, x));
              const s = st * tw * clamp2(1 - a * 1.6) * smooth2(WL - 2, 30, y);
              cr = Math.max(cr, s * 0.9), cg = Math.max(cg, s * 0.94), cb = Math.max(cb, s);
            }
          } else {
            cr = sr[k], cg = sg[k], cb = sb[k];
            const L = lightX[x] * rec[k];
            cr += L * 0.03, cg += L * 0.14, cb += L * 0.1;
            const e = rim[k];
            if (e > 0) {
              const q = e * (m === TREE ? 0.2 + 0.45 * lightX[x] : 0.05 + 0.22 * lightX[x]);
              cr += q * 0.25, cg += q * 0.95, cb += q * 0.7;
            }
            if (m === PANE) {
              const f = flick + 0.04 * Math.sin(t * 5.3 + x);
              cr = f, cg = 0.76 * f, cb = 0.38 * f;
            } else if (m === DOOR) {
              if (x === DOOR_X[1] && r > eave + 1)
                cr = 0.55 * flick, cg = 0.36 * flick, cb = 0.14 * flick;
            }
          }
          const lg = lampLand[k] * flick;
          if (lg > 0)
            cr += lg, cg += lg * 0.62, cb += lg * 0.26;
          R[k] = cr, G[k] = cg, B[k] = cb;
        }
      }
      for (let r = 0;r < H2; r++) {
        const y = r + 0.5;
        let floor = 0.1, fade = 1;
        const dw = y - WL;
        const deep = r >= WL ? mix2(1, 0.45, dw / (H2 - WL)) : 1;
        const ry = WL - 1 - (r - WL) - Math.round(0.4 * Math.sin(r * 0.9 + t * 0.6));
        const r0 = Math.max(0, ry) * W2, r1 = Math.max(0, ry - 1) * W2, r2 = Math.max(0, ry - 2) * W2;
        for (let x = 0;x < W2; x++) {
          const k = r * W2 + x;
          let cr, cg, cb;
          if (r < WL) {
            cr = R[k], cg = G[k], cb = B[k];
            const m = mat[k];
            floor = m === AIR ? 0.1 : m === NEAR ? 0.05 : m === TREE ? 0.04 : 0.06;
          } else {
            const wave = noise2(x * 0.04 + t * 0.05, r * 0.55 - t * 0.35);
            const sx = x + (0.5 + dw * 0.12) * Math.sin(r * 1.3 + t * 1.6 + wave * 4);
            let ix = Math.floor(sx);
            const fx = sx - ix;
            ix = Math.max(0, Math.min(W2 - 2, ix));
            const a0 = r0 + ix, a1 = r1 + ix, a2 = r2 + ix;
            const sky = mat[a0] === AIR;
            let kr = (sky ? 0.55 : 0.64) * (0.82 + 0.3 * wave) * deep;
            if (sky && gap[r] && wave < 0.45)
              kr *= 0.12;
            const ms = mat[a0];
            if (ms === PANE)
              kr *= 0.4;
            else if (ms === WALL || ms === ROOF || ms === DOOR)
              kr *= 0.7;
            const gx = 1 - fx;
            cr = ((R[a0] * gx + R[a0 + 1] * fx) * 0.5 + (R[a1] * gx + R[a1 + 1] * fx) * 0.3 + (R[a2] * gx + R[a2 + 1] * fx) * 0.2) * kr;
            cg = ((G[a0] * gx + G[a0 + 1] * fx) * 0.5 + (G[a1] * gx + G[a1 + 1] * fx) * 0.3 + (G[a2] * gx + G[a2 + 1] * fx) * 0.2) * kr;
            cb = ((B[a0] * gx + B[a0 + 1] * fx) * 0.5 + (B[a1] * gx + B[a1 + 1] * fx) * 0.3 + (B[a2] * gx + B[a2 + 1] * fx) * 0.2) * kr;
            if (ms !== WALL && ms !== DOOR)
              cr += 0.02, cg += 0.035, cb += 0.065;
            if (r === WL) {
              const e = 0.3 * (0.3 + 0.7 * smooth2(0.25, 0.75, noise2(x * 0.3, t * 0.4)));
              cr += e * 0.6, cg += e * 0.85, cb += e;
            }
            if (dw < 14 && x > 138 && x < 166) {
              const rip = noise2(x * 0.5 - t * 0.2, r * 1.4 - t * 1.5);
              for (const [lx, s] of LAMPS) {
                const lw = 1 + dw * 0.1;
                const q = (x + 0.5 - lx) / lw;
                const g = Math.exp(-q * q) * Math.exp(-dw / 8) * smooth2(0.3, 0.65, rip) * s * 1.6 * flick;
                cr += g, cg += g * 0.68, cb += g * 0.28;
              }
            }
            floor = sky ? 0.07 * deep : 0.03;
            fade = smooth2(H2 + 3, H2 - 12, y);
          }
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp2(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95) * fade;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER2[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS2[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER2[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp2(cr * s), clamp2(cg * s), clamp2(cb * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H2; r++)
        lines.push(out.slice(r * W2, (r + 1) * W2).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/deep-reef.ts
  var exports_deep_reef = {};
  __export(exports_deep_reef, {
    default: () => deepReef,
    meta: () => meta3
  });
  var meta3 = {
    name: "deep reef",
    category: "scenes",
    note: "light shafts, swaying kelp and a turning school of fish over a reef",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#03101a",
    palette: [
      "#114a66",
      "#165c78",
      "#1d708a",
      "#27869b",
      "#3a9fae",
      "#58b9c0",
      "#80d2d2",
      "#b0e8e2",
      "#e2fbf5",
      "#5e6b62",
      "#87927f",
      "#aab39a",
      "#cfd2b4",
      "#38461a",
      "#5a6420",
      "#857f2a",
      "#b0a03c",
      "#d6c25a",
      "#efe08e",
      "#8e3355",
      "#c4506a",
      "#e0786e",
      "#f0a070",
      "#6a3a78",
      "#9a5aa8",
      "#c88ad0",
      "#6f8a98",
      "#9fb8c6",
      "#cfe3ea"
    ]
  };
  var W3 = 200;
  var H3 = 100;
  var SURF = 15;
  var HZ2 = 61;
  var SUNX = 136;
  var DOTS3 = " ·•●";
  var COVER3 = [0, 0.3, 0.6, 1];
  var BAYER3 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var NONE = 0;
  var SAND = 1;
  var REEF = 2;
  var FAR2 = 3;
  var FAN = 4;
  function hash3(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise3(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash3(xi, yi), b = hash3(xi + 1, yi), c = hash3(xi, yi + 1), d = hash3(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm3(x, y, octaves) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise3(x * f, y * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp3 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth3 = (a, b, v) => {
    const k = clamp3((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix3 = (a, b, k) => a + (b - a) * k;
  var hex3 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = s + 1831565813 >>> 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function deepReef() {
    const P = meta3.palette.map(hex3);
    const N = W3 * H3;
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const CT = 64, CC = 6, CS = CT / CC;
    const caus = new Float32Array(CT * CT);
    {
      const rnd2 = prng(7);
      const pts = [];
      for (let j = 0;j < CC; j++)
        for (let i = 0;i < CC; i++)
          pts.push([(i + 0.15 + 0.7 * rnd2()) * CS, (j + 0.15 + 0.7 * rnd2()) * CS]);
      for (let y = 0;y < CT; y++) {
        for (let x = 0;x < CT; x++) {
          let f1 = 1e9, f2 = 1e9;
          for (const [px, py] of pts) {
            for (let oy = -CT;oy <= CT; oy += CT) {
              for (let ox = -CT;ox <= CT; ox += CT) {
                const dx = x + 0.5 - px - ox, dy = y + 0.5 - py - oy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < f1)
                  f2 = f1, f1 = d;
                else if (d < f2)
                  f2 = d;
              }
            }
          }
          caus[y * CT + x] = Math.pow(1 - smooth3(0, 0.42 * CS, f2 - f1), 2.2);
        }
      }
    }
    const causAt = (u, v) => {
      u = (u % CT + CT) % CT;
      v = (v % CT + CT) % CT;
      const x0 = u | 0, y0 = v | 0, ax = u - x0, ay = v - y0;
      const x1 = (x0 + 1) % CT, y1 = (y0 + 1) % CT;
      const a = caus[y0 * CT + x0], b = caus[y0 * CT + x1], c = caus[y1 * CT + x0], d = caus[y1 * CT + x1];
      return a + (b - a) * ax + (c - a) * ay + (a - b - c + d) * ax * ay;
    };
    const wr = new Float32Array(N), wg = new Float32Array(N), wb = new Float32Array(N);
    const rayAt = new Uint16Array(N);
    const SUNY = -12, RAYS = 320;
    for (let r = 0;r < H3; r++) {
      for (let x = 0;x < W3; x++) {
        const k = r * W3 + x, v = (r + 0.5) / H3;
        const up = Math.pow(1 - v, 2.2);
        const sun = Math.exp(-(((x - SUNX) / 52) ** 2) - ((r - 4) / 34) ** 2);
        const haze = Math.exp(-(((r - 54) / 15) ** 2)) * (1 - 0.6 * smooth3(30, 100, Math.abs(x - 112)));
        const edge = 1 - 0.4 * smooth3(50, 104, Math.abs(x - 112)) * smooth3(8, 70, r) - 0.3 * smooth3(66, 100, r);
        const veil = 0.78 + 0.44 * fbm3(x * 0.022 + 5, r * 0.04, 4);
        wr[k] = (0.012 + 0.09 * up + 0.05 * sun + 0.04 * haze) * edge * veil;
        wg[k] = (0.1 + 0.32 * up + 0.14 * sun + 0.15 * haze) * edge * veil;
        wb[k] = (0.15 + 0.27 * up + 0.12 * sun + 0.17 * haze) * edge * veil;
        const a = Math.atan2(x + 0.5 - SUNX, r + 0.5 - SUNY);
        rayAt[k] = Math.max(0, Math.min(RAYS - 1, Math.round((a + 1.6) * 100)));
      }
    }
    const RAY0 = 160;
    const mat = new Uint8Array(N);
    const ar = new Float32Array(N), ag = new Float32Array(N), ab = new Float32Array(N);
    const fog = new Float32Array(N);
    const cu = new Float32Array(N), cv = new Float32Array(N), cw = new Float32Array(N);
    const dome = (u) => 1 - Math.sqrt(Math.max(0, 1 - u * u));
    const leftTop = (x) => 47 + 56 * dome(Math.min(1, x / 86)) - 8 * fbm3(x * 0.06, 3.1, 4) + 3 * Math.max(0, (10 - x) / 10);
    const rightTop = (x) => 69 + 34 * dome(Math.min(1, (196 - x) / 48)) - 5 * fbm3(x * 0.08, 8.3, 3) - 3 * Math.exp(-(((x - 191) / 6) ** 2));
    const farTop = (x) => HZ2 - 1 - 6 * fbm3(x * 0.035 + 2, 1.7, 3) - 3 * Math.exp(-(((x - 120) / 18) ** 2));
    const domes = [[16, 3, 7, 0], [41, 2.5, 6.5, 1], [53, 2, 4.5, 3], [65, 2, 5, 2], [158, 2, 4, 2], [186, 3, 5, 1], [196, 3, 4.5, 3]].map(([x, d, r, kind]) => [x, (x < 100 ? leftTop(x) : rightTop(x)) + d, r, kind]);
    const coral = [
      [0.86, 0.36, 0.44],
      [0.93, 0.55, 0.3],
      [0.6, 0.36, 0.72],
      [0.78, 0.7, 0.35]
    ];
    const rock = [0.016, 0.03, 0.042];
    const BOMMIES = [[114, 69, 9, 0.18, 0], [94, 63.6, 4, 0.5, 2], [139, 64.4, 4, 0.42, 1]];
    const FAN_C = [167, rightTop(167) + 1.5], FAN_R = 27;
    for (let r = 0;r < H3; r++) {
      for (let x = 0;x < W3; x++) {
        const k = r * W3 + x, y = r + 0.5;
        if (r >= HZ2 + 2) {
          const d = y - HZ2;
          const z = 300 / d;
          const near = 0.4 + 0.6 * (d / 38);
          const sx = (x + 0.5 - 100) / near;
          const sy = 30 * Math.log(d);
          const aa = smooth3(2.2, 1.4, 30 / d);
          const ph = sy + 7 * fbm3(sx * 0.07, sy * 0.06, 2) + sx * 0.05;
          const crest = Math.pow(0.5 + 0.5 * Math.sin(ph), 3) * smooth3(0.3, 0.6, fbm3(sx * 0.09 + 7, sy * 0.12, 2));
          const rip = 0.74 + aa * (0.5 * crest - 0.12) + 0.12 * (fbm3(sx * 0.08, sy * 0.15, 3) - 0.5);
          mat[k] = SAND;
          const lit = 0.6 + 0.15 * smooth3(100, 130, x) - 0.3 * smooth3(84, 100, r);
          ar[k] = 0.38 * rip * lit, ag[k] = 0.37 * rip * lit, ab[k] = 0.3 * rip * lit;
          fog[k] = 1 - Math.exp(-z / 40);
          cu[k] = sx * 0.9, cv[k] = sy * 2.3, cw[k] = 0.5 * smooth3(14, 26, d);
        }
        if (y >= farTop(x) && r < HZ2 + 6) {
          mat[k] = FAR2;
          const s = (0.45 + 0.55 * fbm3(x * 0.15, y * 0.15, 2)) * (0.5 + 0.8 * Math.exp(-(y - farTop(x)) / 2));
          ar[k] = 0.06 * s, ag[k] = 0.11 * s, ab[k] = 0.14 * s;
          fog[k] = 0.68;
          cw[k] = 0;
        }
        {
          const dx = x + 0.5 - FAN_C[0], dy = FAN_C[1] - y;
          const d = Math.hypot(dx, dy), a = Math.atan2(dx, dy);
          const reach = FAN_R * (0.68 + 0.36 * fbm3(a * 2.6 + 5, 1, 3));
          if (dy > -1 && Math.abs(a) < 1.2 && d < reach) {
            const aw = a + 0.08 * (fbm3(d * 0.2, a * 2, 2) - 0.5) * 4;
            const ray = Math.abs((aw * 7.5 / Math.PI + 100) % 1 - 0.5);
            const ring = Math.abs((d / 3.2 + 100) % 1 - 0.5);
            const mesh = hash3(x * 3, r * 5) < 0.08;
            const vein = ray > 0.42 || ring > 0.45 && d > 5 || mesh || d < 4 && Math.abs(dx) < 1.2 || d > reach - 1.2;
            mat[k] = FAN;
            const o = smooth3(2, reach, d);
            const s = (0.35 + 0.75 * o) * (vein ? 1 : 0.22);
            ar[k] = mix3(0.32, 0.72, o) * s, ag[k] = mix3(0.12, 0.38, o) * s, ab[k] = mix3(0.38, 0.8, o) * s;
            fog[k] = vein ? 0.2 : 0.4;
            cw[k] = 0;
          }
        }
        for (const [bx, crest, hw, f0, kind] of BOMMIES) {
          const u = (x + 0.5 - bx) / hw;
          const top2 = crest + u * u * u * u * hw * 0.5 - 1.6 * fbm3(x * 0.35, crest, 2);
          if (Math.abs(u) < 1.1 && y >= top2 && y < crest + hw * 0.5 + 1.5 * fbm3(x * 0.3, crest + 5, 2) - 0.6 * u * u) {
            mat[k] = REEF;
            const below = y - top2;
            const living = smooth3(2.2, 0.6, below) * smooth3(0.45, 0.6, fbm3(x * 0.25 + bx, y * 0.3, 2));
            const lit = 0.3 + 0.6 * Math.exp(-below / 1.5);
            const [cr0, cg0, cb0] = coral[kind];
            ar[k] = mix3(rock[0], cr0, living) * lit;
            ag[k] = mix3(rock[1], cg0, living) * lit;
            ab[k] = mix3(rock[2], cb0, living) * lit;
            fog[k] = f0;
            cu[k] = x * 0.5, cv[k] = y * 0.9, cw[k] = 0.5 * Math.exp(-below / 1.5);
          }
        }
        const tl = leftTop(x), tr = rightTop(x);
        const top = x < 100 ? tl : tr;
        if (y >= top && (x < 87 || x > 147)) {
          mat[k] = REEF;
          const below = y - top;
          const n = fbm3(x * 0.18, y * 0.22, 4);
          const lump = fbm3(x * 0.07, y * 0.1, 3), lumpUp = fbm3(x * 0.07, (y - 1.5) * 0.1, 3);
          const face = clamp3(0.5 + (lumpUp - lump) * 14);
          const lit = (0.25 + 0.5 * face + 0.6 * Math.exp(-below / 5) + 0.14 * (n - 0.5)) * (0.55 + 0.45 * smooth3(100, 40, r));
          const kind = Math.floor(fbm3(x * 0.06 + 11, y * 0.09, 3) * 7) % 4;
          const patch = fbm3(x * 0.12 + 4, y * 0.12, 3);
          const living = Math.max(smooth3(0.44, 0.56, patch) * smooth3(7, 1.5, below), smooth3(0.66, 0.72, patch) * 0.35 * smooth3(24, 6, below));
          const [cr0, cg0, cb0] = coral[kind];
          const rim = smooth3(2.4, 0.3, below) * 0.6;
          const ledge = smooth3(0.66, 0.9, face) * smooth3(3, 8, below) * 0.55;
          const rr = mix3(mix3(rock[0], 0.05, ledge), 0.12, rim), rg = mix3(mix3(rock[1], 0.11, ledge), 0.24, rim), rb = mix3(mix3(rock[2], 0.13, ledge), 0.25, rim);
          ar[k] = mix3(rr, cr0, living) * lit;
          ag[k] = mix3(rg, cg0, living) * lit;
          ab[k] = mix3(rb, cb0, living) * lit;
          fog[k] = x < 100 ? 0.04 + 0.04 * smooth3(0, 80, x) : 0.08;
          cu[k] = x * 0.5, cv[k] = y * 0.9, cw[k] = 0.8 * Math.exp(-below / 1.5);
        }
        for (const [dx0, dy0, dr, kind] of domes) {
          const dx = x + 0.5 - dx0, dy = y - dy0;
          const d = Math.hypot(dx, dy * 1.25);
          if (d < dr && dy < dr * 0.3) {
            mat[k] = REEF;
            const nz = Math.sqrt(Math.max(0, 1 - (d / dr) ** 2));
            const lamb = clamp3(0.15 + 0.85 * (nz * 0.6 - dy / dr * 0.55 + dx / dr * 0.25));
            const groove = 0.75 + 0.25 * Math.sin(d * 2.4 + 2 * fbm3(x * 0.3, y * 0.3, 2) * 3);
            const [cr0, cg0, cb0] = coral[(kind + 1) % 4];
            const s = (0.15 + 0.9 * lamb) * groove;
            ar[k] = cr0 * s, ag[k] = cg0 * s, ab[k] = cb0 * s;
            fog[k] = dx0 < 100 ? 0.04 + 0.04 * smooth3(0, 80, dx0) : 0.08;
            cu[k] = x * 0.5, cv[k] = y * 0.9, cw[k] = 0.5 * clamp3(-dy / dr + 0.6);
          }
        }
      }
    }
    for (const [seed, count, x0, span, topAt] of [[31, 10, 3, 60, leftTop], [53, 3, 178, 20, rightTop]]) {
      const rnd2 = prng(seed);
      for (let i = 0;i < count; i++) {
        const bx = x0 + rnd2() * span;
        if (Math.abs(bx - FAN_C[0]) < 3)
          continue;
        const base = topAt(bx);
        const h = 2 + rnd2() * 3.5;
        const lean = (rnd2() - 0.5) * 0.5;
        const kind = rnd2() < 0.5 ? 1 : 3;
        for (let s = 0;s < h; s += 0.5) {
          const x = Math.round(bx + lean * s + (s > h * 0.55 ? (i % 2 ? 1 : -1) * (s - h * 0.55) * 0.6 : 0));
          const r = Math.round(base - s);
          if (x < 0 || x >= W3 || r < 0)
            continue;
          const k = r * W3 + x;
          mat[k] = REEF;
          const tip = s / h;
          const [cr0, cg0, cb0] = coral[kind];
          const sh = 0.4 + 0.6 * tip;
          ar[k] = cr0 * sh, ag[k] = cg0 * sh, ab[k] = cb0 * sh;
          fog[k] = 0.06;
          cu[k] = x * 0.5, cv[k] = r * 0.9, cw[k] = 0.4;
        }
      }
    }
    const br = new Float32Array(N), bg = new Float32Array(N), bb = new Float32Array(N);
    for (let k = 0;k < N; k++) {
      if (mat[k] === NONE) {
        br[k] = wr[k], bg[k] = wg[k], bb[k] = wb[k];
        continue;
      }
      const f = fog[k];
      const tint = 1 - f;
      const ex = 1.9;
      br[k] = mix3(ar[k] * ex * (0.55 + 0.45 * tint), wr[k], f);
      bg[k] = mix3(ag[k] * ex * (0.85 + 0.15 * tint), wg[k], f);
      bb[k] = mix3(ab[k] * ex, wb[k], f);
    }
    const rnd = prng(1234);
    const gauss = () => {
      let s = 0;
      for (let i = 0;i < 4; i++)
        s += rnd();
      return (s - 2) * 1.7;
    };
    const fish = [];
    for (let i = 0;i < 150; i++)
      fish.push({ a: gauss() * 10, b: gauss() * 3.8, ph: rnd() * 6.28, sp: 0.8 + rnd() * 0.6 });
    const kelp = [];
    for (const [bx, base, len, sz, ph, haze] of [
      [14, 100, 96, 3.5, 0, 0],
      [189, 100, 96, 3.5, 5.2, 0]
    ])
      kelp.push({ bx, base, len, sz, ph, haze });
    const streams = [[44, 52, 8], [168, 66, 7], [116, 96, 6]];
    const bubbles = [];
    for (const [x0, y0, n] of streams)
      for (let i = 0;i < n; i++)
        bubbles.push({ x0, y0, ph: rnd(), sp: 4 + rnd() * 3, w: rnd() * 6.28 });
    const snow = [];
    for (let i = 0;i < 90; i++)
      snow.push({ x: rnd() * W3, y: rnd() * H3, sp: 0.3 + rnd() * 0.7, ph: rnd() * 6.28, b: 0.12 + rnd() * 0.22 });
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), floor = new Float32Array(N);
    const rays = new Float32Array(RAYS);
    const out = new Array(N);
    const add = (x, r, R, G, B) => {
      if (x < 0 || x >= W3 || r < 0 || r >= H3)
        return;
      const k = r * W3 + x;
      cr[k] += R, cg[k] += G, cb[k] += B;
    };
    const put = (x, r, R, G, B, a) => {
      if (x < 0 || x >= W3 || r < 0 || r >= H3)
        return;
      const k = r * W3 + x;
      cr[k] = mix3(cr[k], R, a), cg[k] = mix3(cg[k], G, a), cb[k] = mix3(cb[k], B, a);
    };
    return (t, { color } = {}) => {
      for (let u = 0;u < RAYS; u++) {
        const s = Math.pow(smooth3(0.5, 0.62, fbm3(u * 0.06 + t * 0.025, 3.3, 3)), 1.2);
        const shimmer = 0.6 + 0.4 * noise3(u * 0.18 - t * 0.7, t * 0.3);
        rays[u] = s * shimmer * (0.35 + 0.65 * Math.exp(-(((u - RAY0) / 60) ** 2)));
      }
      const cx0 = t * 0.9, cy0 = t * 0.35, cx1 = -t * 0.6 + 21, cy1 = t * 0.5 + 9;
      const hx = SUNX + 1.6 * Math.sin(t * 0.6) + 0.8 * Math.sin(t * 1.7 + 1);
      for (let r = 0;r < H3; r++) {
        const y = r + 0.5;
        const depthFade = Math.exp(-r / 30) * smooth3(0, 14, r + 6);
        for (let x = 0;x < W3; x++) {
          const k = r * W3 + x;
          let R = br[k], G = bg[k], B = bb[k];
          const m = mat[k];
          const ray = rays[rayAt[k]] * depthFade;
          if (m === NONE) {
            if (r < SURF + 6) {
              const dist = SURF + 7 - y;
              const q = 30 / dist;
              const a = causAt((x - 100) / dist * 1.6 + t * 1.6, q * 6 + t * 0.8);
              const b2 = causAt((x - 100) / dist * 1.2 - t * 1.1 + 31, q * 4.5 - t * 0.6 + 17);
              const lit = Math.pow(smooth3(SURF + 6, 0, y), 1.3);
              const c = Math.pow(Math.max(a, b2), 1.6);
              const near = Math.exp(-(((x - hx) / 34) ** 2));
              const dim = 1 - lit * 0.7 * (1 - c);
              R *= dim, G *= dim, B *= dim;
              const v = lit * c * (0.1 + 0.42 * near);
              const dx = x + 0.5 - hx;
              const hot = Math.exp(-((dx / 8) ** 2) - ((y - 6) / 3.6) ** 2) * (1 + 0.3 * c);
              const halo = Math.exp(-((dx / 15) ** 2) - ((y - 6) / 7) ** 2) * 0.3 * (0.6 + 0.6 * c);
              R += 0.55 * v + 0.9 * hot + 0.35 * halo;
              G += 0.85 * v + 1 * hot + 0.6 * halo;
              B += 0.8 * v + 0.97 * hot + 0.58 * halo;
            }
            R += 0.42 * ray, G += 0.86 * ray, B += 0.78 * ray;
            floor[k] = 0;
          } else {
            const f = fog[k];
            if (cw[k] > 0) {
              const c = Math.min(causAt(cu[k] + cx0, cv[k] + cy0), 1) * 0.6 + causAt(cu[k] * 0.8 + cx1, cv[k] * 0.8 + cy1) * 0.6;
              const s = cw[k] * c * c * (1 - f) * (0.6 + 0.6 * ray + 0.3 * depthFade);
              if (m === SAND)
                R += 0.62 * s, G += 0.66 * s, B += 0.5 * s;
              else
                R += 0.55 * s, G += 0.72 * s, B += 0.62 * s;
            }
            R += 0.16 * ray * f, G += 0.3 * ray * f, B += 0.28 * ray * f;
            floor[k] = 0.02;
          }
          cr[k] = R, cg[k] = G, cb[k] = B;
        }
      }
      const pathX = (s) => 95 + 24 * Math.sin(0.11 * s + 0.4);
      const pathY = (s) => 44 + 8 * Math.sin(0.17 * s + 2.2);
      for (const f of fish) {
        const s = t - f.a * 0.08;
        const vx = 24 * 0.11 * Math.cos(0.11 * s + 0.4), vy = 8 * 0.17 * Math.cos(0.17 * s + 2.2);
        const th = Math.atan2(vy, vx);
        const ct = Math.cos(th), st = Math.sin(th);
        const wob = Math.sin(t * 1.3 * f.sp + f.ph);
        const px = pathX(s) + f.a * ct - f.b * st + wob * 0.6;
        const py = pathY(s) + f.a * st + f.b * ct + Math.cos(t * f.sp + f.ph) * 0.4;
        const h = th + 0.15 * wob;
        const dx = Math.cos(h), dy = Math.sin(h);
        const flash = smooth3(0.72, 0.97, Math.abs(Math.sin(th * 1.6 + f.a * 0.35 + f.b * 0.4 - t * 0.5 + 0.6)));
        const R0 = mix3(0.008, 0.85, flash), G0 = mix3(0.018, 0.97, flash), B0 = mix3(0.026, 1, flash);
        for (let j = 0;j < 2; j++) {
          const gx = Math.round(px - dx * j * 0.9), gy = Math.round(py - dy * j * 0.9);
          put(gx, gy, R0, G0, B0, j === 0 ? 1 : 0.85);
        }
      }
      for (const kp of kelp) {
        const { bx, base, len, sz, ph, haze } = kp;
        const side = bx < 100 ? 1 : -1;
        for (let r = base - 1;r >= base - len; r--) {
          if (r < 0)
            break;
          const s01 = (base - r) / len;
          const lean = side * 2.5 * sz * s01 * s01;
          const bend = Math.sin(t * 0.55 + ph - s01 * 4.2) * 2.2 * sz * Math.pow(s01, 1.2) + Math.sin(t * 0.21 + ph) * 1.5 * s01 + lean;
          const x = bx + bend;
          const stem = 0.8 + 0.4 * sz * (1 - s01);
          const beat = s01 * len * 0.32 + ph;
          const lobeL = Math.pow(Math.max(0, Math.sin(beat)), 1.2) * sz * 2.3 * (1 - 0.35 * s01);
          const lobeR = Math.pow(Math.max(0, -Math.sin(beat)), 1.2) * sz * 2.3 * (1 - 0.35 * s01);
          const drag = Math.cos(t * 0.55 + ph - s01 * 4.2) * 0.8 * sz;
          const x0 = x - stem - lobeL + Math.min(0, drag), x1 = x + stem + lobeR + Math.max(0, drag);
          const ray = rays[rayAt[r * W3 + Math.max(0, Math.min(W3 - 1, Math.round(x)))]] * Math.exp(-r / 30);
          const lit = smooth3(0.3, 0.6, ray);
          const xa = Math.round(x0), xb = Math.round(x1);
          for (let xx = xa;xx <= xb; xx++) {
            if (xx < 0 || xx >= W3)
              continue;
            const k = r * W3 + xx;
            const sun = side > 0 ? xx === xb : xx === xa;
            const rim = xx === xa || xx === xb;
            const blade = Math.abs(xx - x) > stem ? 1 : 0;
            const through = blade * 0.12 * smooth3(0, 1, Math.abs(xx - x) - stem) * (0.5 + 0.5 * hash3(xx * 7, r * 3));
            const g = 0.02 + through + (rim ? 0.16 : 0) + (sun ? 0.34 + 0.66 * lit * (0.4 + 0.6 * blade) : 0);
            put(xx, r, mix3(0.62 * g, wr[k], haze), mix3(0.58 * g, wg[k], haze), mix3(0.18 * g, wb[k], haze), 1);
            floor[k] = 0.02;
          }
        }
      }
      for (const b of bubbles) {
        const span = b.y0 - SURF;
        const p = (t * b.sp / span + b.ph) % 1;
        const y = b.y0 - p * span;
        const x = b.x0 + Math.sin(y * 0.35 + b.w) * 1.2 + p * 3;
        const v = 0.55 + 0.45 * p;
        add(Math.round(x), Math.round(y), 0.7 * v, 0.95 * v, 1 * v);
      }
      for (const s of snow) {
        const x = ((s.x + t * s.sp + 2 * Math.sin(t * 0.3 + s.ph)) % W3 + W3) % W3;
        const y = ((s.y + t * s.sp * 0.4) % H3 + H3) % H3;
        add(Math.floor(x), Math.floor(y), s.b * 0.7, s.b * 0.9, s.b);
      }
      for (let r = 0;r < H3; r++) {
        for (let x = 0;x < W3; x++) {
          const k = r * W3 + x;
          const R = cr[k], G = cg[k], B = cb[k];
          const peak = Math.max(R, G, B, 0.0001);
          const level = clamp3(floor[k] + (1 - floor[k]) * Math.pow(peak, 0.85) * 0.95);
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER3[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS3[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER3[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp3(R * s), clamp3(G * s), clamp3(B * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H3; r++)
        lines.push(out.slice(r * W3, (r + 1) * W3).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/desert-night.ts
  var exports_desert_night = {};
  __export(exports_desert_night, {
    default: () => desertNight,
    meta: () => meta4
  });
  var meta4 = {
    name: "desert night",
    category: "scenes",
    note: "the milky way over a lone acacia on moonless dunes, meteors falling",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#04060c",
    palette: [
      "#0a1024",
      "#101830",
      "#16213f",
      "#1e2b50",
      "#283864",
      "#34477a",
      "#45598f",
      "#5a6fa6",
      "#7488bd",
      "#93a5d2",
      "#b6c3e4",
      "#d8e0f2",
      "#f4f6fb",
      "#fff3dc",
      "#ffe2b4",
      "#f5c98e",
      "#e2a86e",
      "#c4864f",
      "#9c6440",
      "#74492f",
      "#2a2230",
      "#3d2f3a",
      "#56404a",
      "#735358",
      "#946a62",
      "#b6836c",
      "#4a3b48",
      "#6b5562",
      "#8a6f7a",
      "#a88590",
      "#c9a3a3",
      "#e2bfb4",
      "#2a2448",
      "#3d3466",
      "#57498a",
      "#7a68a8",
      "#ffd8a8",
      "#cfe0ff",
      "#a9c4ff",
      "#ff9a52",
      "#e07a3e",
      "#0d0f1a",
      "#151827"
    ]
  };
  var W4 = 200;
  var H4 = 100;
  var K2 = 0.62;
  var HZ3 = 64;
  var CAM2 = 6;
  var HMAX = 16;
  var TOWN = [30, 66];
  var CORE = [152, 38];
  var ARC = [50, 209.8, 199.8];
  var ARC_S = [-1.035, 0.8];
  var ACACIA = 150;
  var DOTS4 = " ·•●";
  var COVER4 = [0, 0.3, 0.6, 1];
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  function hash4(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise4(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash4(xi, yi), b = hash4(xi + 1, yi), c = hash4(xi, yi + 1), d = hash4(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm4(x, y, octaves) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise4(x * f + i * 31.7, y * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp4 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth4 = (a, b, v) => {
    const k = clamp4((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix4 = (a, b, k) => a + (b - a) * k;
  var hex4 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  function phase(x, z) {
    const p = x * 0.9 + z * 0.42 + 26 * fbm4(x * 0.014, z * 0.014, 3);
    const q = p / 19;
    return q - Math.floor(q);
  }
  var crestX = (z) => {
    const k = clamp4((z - 22) / 52);
    return -4 + 26 * k * k * (3 - 2 * k) + 5 * Math.sin((z - 22) * 0.09);
  };
  function ridge(x, z) {
    if (z < 8)
      return 0;
    const hc = z <= 74 ? 0.5 + 13 * Math.pow(clamp4((z - 12) / 62), 1.25) : 13.5 * (1 - (z - 74) / 9);
    const dx = x - crestX(z);
    return hc - (dx < 0 ? -dx * 0.36 : dx * 0.8);
  }
  function dunes(x, z) {
    const u = phase(x, z);
    const prof = u < 0.72 ? Math.pow(u / 0.72, 1.5) : Math.pow((1 - u) / 0.28, 0.75);
    const rg = ridge(x, z);
    const amp = (1 + 4.5 * fbm4(x * 0.008 + 5, z * 0.008, 2)) * (1 - 0.8 * smooth4(-3, 3, rg));
    return Math.max(prof * amp, rg) + 0.3 * fbm4(x * 0.05, z * 0.05, 2);
  }
  function march2(u, v) {
    let z = 3, prev = z;
    for (let i = 0;i < 300 && z < 600; i++) {
      const y = CAM2 + v * z;
      if (v > 0 && y > HMAX)
        return 0;
      const gap = y - dunes(u * z, z);
      if (gap < 0) {
        let a = prev, b = z;
        for (let j = 0;j < 7; j++) {
          const m = (a + b) / 2;
          if (CAM2 + v * m - dunes(u * m, m) < 0)
            b = m;
          else
            a = m;
        }
        return b;
      }
      prev = z;
      z += Math.max(0.25, gap * 0.5) + z * 0.004;
    }
    return 0;
  }
  function desertNight() {
    const P = meta4.palette.map(hex4);
    const N = W4 * H4;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const unit = (v) => {
      const n = Math.hypot(...v);
      return v.map((c) => c / n);
    };
    const L = unit([-0.8, 0.32, 0.5]);
    const G = unit([0.6, 0.5, 0.4]);
    const SKY = 0, SAND2 = 1, TREE2 = 2;
    const mat = new Uint8Array(N);
    const depth = new Float32Array(N);
    const sR = new Float32Array(N), sG = new Float32Array(N), sB = new Float32Array(N);
    const crest = new Float32Array(N);
    const top = new Int16Array(W4).fill(H4);
    for (let r = 0;r < H4; r++) {
      const v = (HZ3 - (r + 0.5)) / 100 * K2;
      for (let x = 0;x < W4; x++) {
        const u = (x + 0.5 - 100) / 100 * K2;
        const z = march2(u, v);
        if (!z)
          continue;
        const k = r * W4 + x;
        mat[k] = SAND2;
        depth[k] = z;
        if (r < top[x])
          top[x] = r;
        const px = u * z, py = CAM2 + v * z;
        const e = 0.2;
        const hx = (dunes(px + e, z) - dunes(px - e, z)) / (2 * e);
        const hz = (dunes(px, z + e) - dunes(px, z - e)) / (2 * e);
        const nl = Math.hypot(hx, 1, hz);
        const nx = -hx / nl, ny = 1 / nl, nz = -hz / nl;
        let lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        if (lit > 0) {
          let sh = 1;
          for (let s = 0.6;s < 90; s += 0.5 + s * 0.05) {
            const qx = px + L[0] * s, qy = py + L[1] * s + 0.05, qz = z + L[2] * s;
            if (qy > HMAX)
              break;
            sh = Math.min(sh, (qy - dunes(qx, qz)) / (0.08 * s));
            if (sh <= 0)
              break;
          }
          lit *= clamp4(sh);
        }
        lit = Math.min(1, Math.pow(lit, 1.4) * 1.45);
        const ph = phase(px, z);
        const onRidge = ridge(px, z) >= dunes(px, z) - 0.35;
        const dxc = px - crestX(z);
        const fall = onRidge ? 0.5 + 0.5 * Math.exp(-Math.abs(dxc) / 7) : 0.55 + 0.45 * smooth4(0.2, 0.72, ph);
        const near = 0.72 + 0.28 * smooth4(5, 25, z);
        const reach = (0.55 + 0.45 * Math.exp(-Math.abs(x - TOWN[0]) / 90)) * fall * near * smooth4(300, 120, z);
        const fill = 0.045 * Math.max(0, nx * G[0] + ny * G[1] + nz * G[2]);
        const ripple = (fbm4(px * 0.6 + z * 0.2, z * 0.6, 2) - 0.5) * 0.05;
        const amb = (0.02 + 0.03 * ny + ripple) * near;
        let cr = amb * 0.7 + fill * 0.45 + lit * 1 * reach;
        let cg = amb * 0.62 + fill * 0.65 + lit * 0.63 * reach;
        let cb = amb * 1.35 + fill * 1.2 + lit * 0.53 * reach;
        if (onRidge && z < 76 && dxc > 0) {
          const cellW = z * K2 * 0.01;
          const rim = smooth4(2.2 * cellW, 0.6 * cellW, dxc) * smooth4(10, 20, z);
          cr += 0.1 * rim;
          cg += 0.14 * rim;
          cb += 0.24 * rim;
        }
        const haze = clamp4(1 - Math.exp(-z / 260)) * mix4(0.7, 0.92, smooth4(120, 300, z));
        const hg = Math.exp(-Math.abs(x - TOWN[0]) / 40) * 0.18;
        cr = mix4(cr, 0.07 + hg, haze);
        cg = mix4(cg, 0.085 + hg * 0.6, haze);
        cb = mix4(cb, 0.15 + hg * 0.3, haze);
        sR[k] = cr;
        sG[k] = cg;
        sB[k] = cb;
        const big = ridge(px, z) > 0.5 && z < 76 ? smooth4(0.9, 0, Math.abs(dxc)) : 0;
        crest[k] = Math.max(smooth4(0.07, 0, Math.abs(ph - 0.72)) * smooth4(260, 30, z), big) * (0.3 + 0.7 * smooth4(0, 0.2, lit));
      }
    }
    const bark = new Float32Array(N);
    {
      const base = top[ACACIA];
      const canopyTop = base - 16;
      const SPAN = 17;
      const canopy = (x, px, py) => {
        const q = (px - ACACIA) / SPAN;
        if (Math.abs(q) > 1.08)
          return false;
        const topY = canopyTop + 0.4 + 2.6 * q * q + 1.3 * (noise4(px * 0.3, 7.1) - 0.5);
        const botY = canopyTop + 3.8 + 1.4 * (1 - q * q) - 1.4 * smooth4(0.8, 1.08, Math.abs(q)) + 1.2 * (noise4(px * 0.45, 3.3) - 0.5) + (hash4(x, 51) < 0.2 ? 0.9 : 0);
        return py > topY && py < botY;
      };
      const fork = [ACACIA + 0.3, base - 5];
      const limbs = [
        [[ACACIA, base + 1], fork, 1.3],
        [fork, [ACACIA - 9, canopyTop + 3], 0.8],
        [fork, [ACACIA + 1.5, canopyTop + 2], 0.75],
        [fork, [ACACIA + 10, canopyTop + 3.2], 0.8],
        [fork, [ACACIA - 4, canopyTop + 2.6], 0.55],
        [[ACACIA - 4, base - 9], [ACACIA - 14, canopyTop + 3.5], 0.55],
        [[ACACIA + 3, base - 8], [ACACIA + 15, canopyTop + 3.6], 0.5]
      ];
      for (let r = Math.max(0, canopyTop - 3);r <= base + 1; r++) {
        for (let x = ACACIA - 26;x <= ACACIA + 26; x++) {
          if (x < 0 || x >= W4)
            continue;
          const px = x + 0.5, py = r + 0.5;
          let on = canopy(x, px, py);
          for (const [[ax, ay], [bx, by], w] of limbs) {
            const lx = bx - ax, ly = by - ay;
            const t = clamp4(((px - ax) * lx + (py - ay) * ly) / (lx * lx + ly * ly));
            const dx = px - (ax + lx * t), dy = py - (ay + ly * t);
            if (dx * dx + dy * dy < (w * (1 - 0.4 * t)) ** 2)
              on = true;
          }
          if (on)
            mat[r * W4 + x] = TREE2;
        }
      }
      for (let r = 1;r < H4; r++) {
        for (let x = 0;x < W4; x++) {
          const k = r * W4 + x;
          if (mat[k] !== TREE2 || mat[k - W4] !== SKY)
            continue;
          const dx = x + 0.5 - CORE[0], dy = (r - CORE[1]) * 1.3;
          bark[k] = 0.25 + 0.75 * Math.exp(-Math.sqrt(dx * dx + dy * dy) / 18);
        }
      }
    }
    const lamps = [];
    for (let x = TOWN[0] - 9;x <= TOWN[0] + 9 && lamps.length < 5; x++) {
      const r = top[x];
      if (r >= H4 || depth[r * W4 + x] < 140 || hash4(x, 91) > 0.45)
        continue;
      if (lamps.some(([k]) => Math.abs(k % W4 - x) < 2))
        continue;
      lamps.push([r * W4 + x, hash4(x, 92) * 6.28, 0.7 + hash4(x, 93) * 1.4]);
    }
    const kR = new Float32Array(N), kG = new Float32Array(N), kB = new Float32Array(N);
    const air = new Float32Array(N);
    const band = new Float32Array(N);
    for (let r = 0;r < H4; r++) {
      for (let x = 0;x < W4; x++) {
        const k = r * W4 + x;
        const y = r + 0.5;
        const v = clamp4(y / HZ3);
        let cr = 0.02 + 0.03 * v * v, cg = 0.035 + 0.045 * v * v, cb = 0.1 + 0.08 * v * v;
        const tx = x + 0.5 - TOWN[0], ty = (y - TOWN[1]) * 1.9;
        const td = Math.sqrt(tx * tx + ty * ty);
        const glow = Math.exp(-td / 16) * 0.4 + Math.exp(-td / 60) * 0.22;
        const cool = 1 - 0.85 * clamp4(Math.exp(-td / 22) * 1.5);
        cr = cr * cool + glow;
        cg = cg * cool + glow * 0.5;
        cb = cb * cool + glow * 0.16;
        const along = 0.72 + 0.5 * fbm4(x * 0.025 + 3, y * 0.04, 2);
        air[k] = Math.pow(smooth4(0.3, 0.94, v), 3) * (1 - 0.3 * smooth4(0.92, 1.02, v)) * 0.32 * cool * along;
        const ax = x + 0.5 - ARC[0], ay = y - ARC[1];
        const d = Math.sqrt(ax * ax + ay * ay) - ARC[2];
        const sRaw = (ARC_S[0] - Math.atan2(ay, ax)) / ARC_S[1];
        const s = clamp4(sRaw);
        const end = sRaw < 0 ? Math.exp(-((sRaw / 0.05) ** 2)) : 1;
        const laneEnd = sRaw < 0 ? Math.exp(-((sRaw / 0.11) ** 2)) : 1;
        const w = 9 + 8 * Math.pow(1 - s, 1.4);
        const lane0 = (noise4(s * 9, 3.3) - 0.5) * w * 0.5 * smooth4(0, 0.25, s);
        let b = Math.exp(-((d / w) ** 2));
        const clump = fbm4(x * 0.09, y * 0.09, 4);
        b *= 0.35 + 1.1 * smooth4(0.3, 0.75, clump);
        b *= (0.55 + 0.55 * (1 - s)) * end;
        const cx = x + 0.5 - CORE[0], cy = (y - CORE[1]) * 1.3;
        const cd = Math.sqrt(cx * cx + cy * cy);
        const core = Math.exp(-cd / 6) * 0.5 + Math.exp(-cd / 22) * 0.25;
        b += core;
        const nearCore = Math.exp(-cd / 16);
        const lane = Math.exp(-(((d - lane0) / (w * 0.12)) ** 2)) * mix4((0.55 + 0.6 * fbm4(x * 0.12, y * 0.12, 3)) * (0.55 + 0.45 * (1 - s)), 1, nearCore) * laneEnd;
        const fil = smooth4(0.58, 0.78, fbm4(x * 0.16 + 9, y * 0.16, 3)) * 0.6;
        b *= clamp4(1 - mix4(0.92, 0.97, nearCore) * lane) * (1 - fil * Math.exp(-((d / (w * 1.3)) ** 2)));
        band[k] = Math.exp(-((d / (w * 1.2)) ** 2)) * end + core;
        const warm = clamp4(Math.exp(-cd / 26) * 1.2 + (1 - s) * 0.25);
        cr += b * mix4(0.62, 1, warm) * 0.75;
        cg += b * mix4(0.68, 0.9, warm) * 0.75;
        cb += b * mix4(0.95, 0.74, warm) * 0.75;
        kR[k] = cr;
        kG[k] = cg;
        kB[k] = cb;
      }
    }
    const dith = new Float32Array(N);
    const floor0 = new Float32Array(N);
    for (let r = 0;r < H4; r++) {
      for (let x = 0;x < W4; x++) {
        const k = r * W4 + x;
        const bay = BAYER4[(r & 3) * 4 + (x & 3)];
        if (mat[k] === SKY) {
          const inb = clamp4(band[k]);
          const soft = Math.max(inb, clamp4(air[k] / 0.2));
          const rnd = (hash4(x * 3 + 1, r * 5 + 2) - 0.5) * mix4(0.6, 0.94, soft);
          dith[k] = mix4(rnd, bay, 0.5 * soft);
          floor0[k] = 0.1 * inb;
        } else {
          dith[k] = bay;
          floor0[k] = mat[k] === SAND2 ? 0.02 : 0;
        }
      }
    }
    const stars = [];
    for (let r = 0;r < HZ3 + 2; r++) {
      for (let x = 0;x < W4; x++) {
        const k = r * W4 + x;
        if (mat[k] !== SKY)
          continue;
        const p = 0.015 + 0.12 * clamp4(band[k]);
        if (hash4(x * 7 + 3, r * 13 + 1) > p)
          continue;
        const m = Math.pow(hash4(x * 5 + 1, r * 3 + 7), 12);
        const bright = (0.2 + 0.95 * m) * smooth4(HZ3 + 1, HZ3 - 6, r + 0.5);
        const c = hash4(x * 11, r * 17 + 5);
        const tint = c < 0.2 ? [0.78, 0.86, 1] : c < 0.9 ? [1, 1, 1] : [1, 0.82, 0.6];
        stars.push([k, bright, tint, 1.5 + hash4(x, r * 9) * 4, hash4(r, x * 3) * 6.28]);
      }
    }
    const FR = new Float32Array(N), FG = new Float32Array(N), FB = new Float32Array(N);
    const floor = new Float32Array(N);
    const AIR0 = Math.floor(HZ3 * 0.3);
    const meteor = (n) => {
      const start = n === 0 ? -0.35 : 7 * (n - 1) + 2.5 + hash4(n, 71) * 2.5;
      const x0 = n === 0 ? 199 : 30 + hash4(n, 72) * 140;
      const y0 = n === 0 ? 4 : 4 + hash4(n, 73) * 18;
      const a = n === 0 ? 2.65 : (x0 > 100 ? 2.6 : 0.55) + (hash4(n, 75) - 0.5) * 0.4;
      return [start, x0, y0, Math.cos(a), Math.sin(a), 52 + hash4(n, 76) * 30];
    };
    return (t, { color } = {}) => {
      FR.set(kR);
      FG.set(kG);
      FB.set(kB);
      floor.set(floor0);
      for (let r = AIR0;r < HZ3 + 2; r++) {
        for (let x = 0;x < W4; x++) {
          const k = r * W4 + x;
          if (mat[k] !== SKY)
            continue;
          const a = air[k] * (0.86 + 0.28 * noise4((x - t * 0.3) * 0.03, r * 0.08));
          FR[k] += a * 0.3;
          FG[k] += a * 0.5;
          FB[k] += a * 1.2;
        }
      }
      for (let k = 0;k < N; k++) {
        const m = mat[k];
        if (m === SAND2) {
          FR[k] = sR[k];
          FG[k] = sG[k];
          FB[k] = sB[k];
          const c = crest[k];
          if (c > 0) {
            const h = hash4(k, 5);
            const g = c * Math.pow(Math.max(0, Math.sin(t * (0.8 + 2.2 * h) + h * 40)), 8) * 0.5;
            FR[k] += g;
            FG[k] += g * 0.85;
            FB[k] += g * 0.7;
          }
        } else if (m === TREE2) {
          const e = bark[k];
          FR[k] = e * 0.42;
          FG[k] = e * 0.3;
          FB[k] = e * 0.2;
          floor[k] = e > 0 ? 0.1 : 0;
        }
      }
      for (const [k, b, tint, rate, ph] of stars) {
        const tw = b > 0.35 ? 0.72 + 0.28 * Math.sin(t * rate + ph) : 0.6 + 0.4 * Math.sin(t * rate + ph);
        const s = b * tw;
        FR[k] += s * tint[0];
        FG[k] += s * tint[1];
        FB[k] += s * tint[2];
        floor[k] = 0.28;
      }
      for (const [k, ph, rate] of lamps) {
        const g = 0.42 + 0.14 * Math.sin(t * rate + ph) * Math.sin(t * rate * 2.3 + ph * 3);
        FR[k] = g;
        FG[k] = 0.85 * g;
        FB[k] = 0.66 * g;
        floor[k] = 0.12;
      }
      const n = Math.floor((t - 2.5) / 7) + 1;
      for (let i = Math.max(0, n - 1);i <= n + 1; i++) {
        const [start, x0, y0, dx, dy, speed] = meteor(i);
        const age = t - start;
        if (age < 0 || age > 0.9)
          continue;
        const fadeIn = smooth4(0, 0.12, age), fadeOut = smooth4(0.9, 0.6, age);
        const hx = x0 + dx * speed * age, hy = y0 + dy * speed * age * 0.75;
        const len = Math.min(28, speed * age);
        for (let j = 0;j < len * 2; j++) {
          const f = j / (len * 2);
          const px = Math.round(hx - dx * f * len), py = Math.round(hy - dy * f * len * 0.75);
          if (px < 0 || px >= W4 || py < 0 || py >= H4)
            continue;
          const k = py * W4 + px;
          if (mat[k] !== SKY)
            continue;
          const s = (1 - f) * fadeIn * fadeOut * 1.25;
          FR[k] = Math.max(FR[k], s * 0.9);
          FG[k] = Math.max(FG[k], s * 0.96);
          FB[k] = Math.max(FB[k], s);
          floor[k] = Math.max(floor[k], s > 0.12 ? 0.4 : 0);
        }
      }
      for (let r = 0;r < H4; r++) {
        const edge = smooth4(H4 + 1, H4 - 12, r + 0.5);
        for (let x = 0;x < W4; x++) {
          const k = r * W4 + x;
          const cr = FR[k], cg = FG[k], cbl = FB[k], fl = floor[k];
          const peak = Math.max(cr, cg, cbl, 0.0001);
          const sky = mat[k] === SKY;
          const level = clamp4(fl + (1 - fl) * Math.pow(peak, sky ? 0.92 : 0.75)) * edge;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + dith[k])));
          out[k] = DOTS4[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER4[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp4(cr * s), clamp4(cg * s), clamp4(cbl * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H4; r++)
        lines.push(out.slice(r * W4, (r + 1) * W4).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/earthrise.ts
  var exports_earthrise = {};
  __export(exports_earthrise, {
    default: () => earthrise,
    meta: () => meta5
  });
  var meta5 = {
    name: "earthrise",
    category: "scenes",
    note: "the earth rising over a cratered lunar horizon in long low sunlight",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#030408",
    palette: [
      "#18181b",
      "#232326",
      "#303033",
      "#414143",
      "#555556",
      "#6b6a69",
      "#83817d",
      "#9c9993",
      "#b6b2aa",
      "#cfcac1",
      "#e6e1d8",
      "#f7f4ee",
      "#0c1120",
      "#131a2e",
      "#1b2540",
      "#262f4a",
      "#dfe9ff",
      "#0a2259",
      "#0f2f72",
      "#15408c",
      "#1d53a6",
      "#2a69bf",
      "#4386d3",
      "#6eaeea",
      "#a8d3f6",
      "#e8f0fa",
      "#c2d0e3",
      "#8b9fbc",
      "#2f4a26",
      "#3b5a2c",
      "#5b7238",
      "#7a9150",
      "#77783f",
      "#8f8550",
      "#a8955e",
      "#6b5634",
      "#b9774a",
      "#8a4838"
    ]
  };
  var W5 = 200;
  var H5 = 100;
  var EYE = 37;
  var F = 112;
  var CAM_H = 20;
  var RM = 1500;
  var ZMAX = 520;
  var EC = [141, 32];
  var ER = 22;
  var LON0 = 3.5;
  var RISE = 5;
  var RISE_T = 150;
  var DOTS5 = " ·•●";
  var COVER5 = [0, 0.3, 0.6, 1];
  var BAYER5 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var BRIGHT = [[24, 9, 1, 4.6], [67, 27, 0.85, 3.4], [99, 12, 0.95, 5.8], [189, 7, 0.8, 4.1]];
  var SUN2 = (() => {
    const v = [0.94, 0.14, -0.3];
    const l = Math.hypot(...v);
    return v.map((c) => c / l);
  })();
  function hash5(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise5(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash5(x0, yi), b = hash5(x1, yi), c = hash5(x0, yi + 1), d = hash5(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm5(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise5(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp5 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth5 = (a, b, v) => {
    const k = clamp5((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix5 = (a, b, k) => a + (b - a) * k;
  var hex5 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var bowl = (q, r) => r * ((q < 1 ? -0.36 * (1 - q * q) : 0) + 0.14 * Math.exp(-(((q - 1) / 0.25) ** 2)));
  function craters(X, Z, cell, salt, r0, r1, p) {
    const ci = Math.floor(X / cell), cj = Math.floor(Z / cell);
    let h = 0;
    for (let j = cj - 1;j <= cj + 1; j++) {
      for (let i = ci - 1;i <= ci + 1; i++) {
        if (hash5(i + salt, j - salt) > p)
          continue;
        const cx = (i + hash5(i, j + salt * 3)) * cell, cz = (j + hash5(i + salt * 5, j)) * cell;
        const e = hash5(j + salt, i - salt * 7);
        const r = cell * (r0 + (r1 - r0) * e * e);
        const dx = X - cx, dz = Z - cz, d2 = dx * dx + dz * dz;
        if (d2 > 4 * r * r)
          continue;
        h += bowl(Math.sqrt(d2) / r, r) * 0.95;
      }
    }
    return h;
  }
  var ROCKS = [[30, 50, 2.4], [62, 63, 1.8], [12, 70, 1.3], [-4, 45, 1.2], [90, 55, 1.6], [46, 90, 1.4]];
  function height(X, Z) {
    let h = 6 * fbm5(X * 0.006 + 50, Z * 0.006 + 50, 3, 0) + 0.6 * fbm5(X * 0.04, Z * 0.04, 2, 0);
    if (Z > 150) {
      const lift = smooth5(150, 300, Z);
      const m = 1 - Math.abs(2 * fbm5(X * 0.006 + 7, Z * 0.006, 4, 0) - 1);
      h += lift * (28 * Math.exp(-(((X + 260) / 230) ** 2)) + 45 * (m * m - 0.35));
      const ridge2 = Math.exp(-(((Z - 205) / 20) ** 2)) * Math.exp(-(((X + 140) / 130) ** 2));
      h += ridge2 * 22 * (0.35 + fbm5(X * 0.018 + 3, Z * 0.01, 3, 0));
    }
    if (Z > 90)
      h += craters(X, Z, 110, 11, 0.14, 0.34, 0.55) * smooth5(90, 150, Z);
    if (Z < 300)
      h += craters(X, Z, 34, 23, 0.12, 0.36, 0.85);
    if (Z < 170)
      h += craters(X, Z, 10, 37, 0.12, 0.34, 0.85) * smooth5(170, 110, Z);
    {
      const dx = X + 24, dz = Z - 58;
      const q = Math.sqrt(dx * dx + dz * dz) / 16;
      if (q < 2)
        h += bowl(q, 16);
    }
    if (Z < 90) {
      const c = 5, ci = Math.floor(X / c), cj = Math.floor(Z / c);
      if (hash5(ci + 91, cj) < 0.14) {
        const bx = (ci + 0.2 + 0.6 * hash5(ci, cj + 92)) * c, bz = (cj + 0.2 + 0.6 * hash5(ci + 93, cj)) * c;
        const br = 0.3 + 0.5 * hash5(ci + 94, cj + 95) ** 2;
        const d2 = ((X - bx) ** 2 + (Z - bz) ** 2) / (br * br);
        if (d2 < 4)
          h += br * 0.9 * Math.exp(-d2 * 1.4);
      }
      for (const [bx, bz, br] of ROCKS) {
        const d2 = ((X - bx) ** 2 + (Z - bz) ** 2) / (br * br);
        if (d2 < 1)
          h += br * (0.85 + 0.3 * noise5(X * 1.3, Z * 1.3, 0)) * Math.sqrt(1 - d2);
      }
    }
    return h;
  }
  function earthrise() {
    const P = meta5.palette.map(hex5);
    const N = W5 * H5;
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const chars = new Array(N).fill(" ");
    const cols = new Uint8Array(N);
    const dot = (k, x, r, cr, cg, cb, floor, cap) => {
      const peak = Math.max(cr, cg, cb, 0.0001);
      const level = clamp5(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95);
      const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER5[(r & 3) * 4 + (x & 3)])));
      chars[k] = DOTS5[step];
      const want = step ? Math.min(1, (level + 0.06) / COVER5[step]) : 0;
      const s = Math.min(cap, 0.3 + 0.7 * want) / peak;
      cols[k] = nearest(clamp5(cr * s), clamp5(cg * s), clamp5(cb * s));
    };
    const ground = new Uint8Array(N);
    const top = new Int16Array(W5).fill(H5);
    const gx = new Float32Array(N), gz = new Float32Array(N), gy = new Float32Array(N);
    const camY = height(0, 7) + CAM_H;
    for (let c = 0;c < W5; c++) {
      const dir = (c + 0.5 - W5 / 2) / F;
      let topR = H5, Z = 26, prevY = 0, prevZ = 0, prevF = 1e9;
      while (Z < ZMAX && topR > 0) {
        const X = dir * Z;
        const hy = height(X, Z);
        const Y = hy - Z * Z / (2 * RM);
        const yf = EYE - F * (Y - camY) / Z;
        let r0 = Math.max(0, Math.ceil(yf - 0.5));
        for (let r = r0;r < topR; r++) {
          const a = prevF > yf + 0.000001 ? clamp5((prevF - (r + 0.5)) / (prevF - yf)) : 1;
          const k = r * W5 + c;
          ground[k] = 1;
          gz[k] = prevZ ? mix5(prevZ, Z, a) : Z;
          gx[k] = dir * gz[k];
          gy[k] = prevZ ? mix5(prevY, hy, a) : hy;
        }
        if (r0 < topR)
          topR = r0;
        prevF = yf, prevY = hy, prevZ = Z;
        Z += 0.03 + Z * 0.012;
      }
      top[c] = topR;
    }
    const sr = new Float32Array(N), sg = new Float32Array(N), sb = new Float32Array(N), sf = new Float32Array(N), scap = new Float32Array(N).fill(1);
    for (let r = 0;r < H5; r++) {
      for (let x = 0;x < W5; x++) {
        const k = r * W5 + x;
        if (!ground[k])
          continue;
        const X = gx[k], Z = gz[k], Y = gy[k];
        const e = 0.1 + Z * 0.004;
        const hx = (height(X + e, Z) - height(X - e, Z)) / (2 * e);
        const hz = (height(X, Z + e) - height(X, Z - e)) / (2 * e);
        const nl = Math.hypot(hx, 1, hz);
        const lam = (-hx * SUN2[0] + SUN2[1] - hz * SUN2[2]) / nl;
        const vx = -X, vy = camY - Y, vz = -Z, vl = Math.hypot(vx, vy, vz);
        const mu = Math.max(0.02, (-hx * vx + vy - hz * vz) / (nl * vl));
        let lit = 0;
        if (lam > 0) {
          lit = 1;
          let s = 0.1 + Z * 0.003;
          while (s < 120) {
            const px = X + SUN2[0] * s, pz = Z + SUN2[2] * s, py = Y + SUN2[1] * s;
            const d = py - height(px, pz);
            if (d < 0) {
              lit = 0;
              break;
            }
            lit = Math.min(lit, d * 30 / s);
            s += 0.05 + s * 0.2;
          }
          lit = smooth5(0, 1, lit);
        }
        const albedo = 0.5 + 0.9 * fbm5(X * 0.025 + 3, Z * 0.025, 3, 0) + 0.3 * (fbm5(X * 0.35, Z * 0.35, 2, 0) - 0.5) - 0.22 * smooth5(0.46, 0.64, fbm5(X * 0.0035, Z * 0.0035 + 20, 3, 0));
        const ls = lam > 0 ? (0.2 * lam / (lam + mu) + 2.6 * lam) * lit : 0;
        const vig = 1 - 0.3 * smooth5(84, 102, r) * smooth5(30, 100, Math.abs(x - 100));
        let b = Math.pow((1 - Math.exp(-ls * 1.5)) * albedo, 1) * vig;
        const crest = r - top[x];
        if (crest < 2 && lit > 0.2)
          b = Math.max(b, (crest ? 0.55 : 0.85) * albedo);
        const fill = lit > 0.02 || b > 0.03 ? 0.008 + 0.007 * clamp5(-hz / nl + 0.5) : 0;
        sr[k] = b * 1 + fill * 0.75;
        sg[k] = b * 0.95 + fill * 0.85;
        sb[k] = b * 0.86 + fill * 1.2;
        sf[k] = 0;
        scap[k] = 0.42 + 0.62 * b;
      }
    }
    const near = (x, r) => Math.hypot(x + 0.5 - EC[0], r + 0.5 - (EC[1] - RISE / 2)) < 2 * ER;
    for (let r = 0;r < H5; r++) {
      for (let x = 0;x < W5; x++) {
        const k = r * W5 + x;
        if (ground[k])
          continue;
        const bandD = (r - (4 + x * 0.32)) / 1.05;
        const band = Math.exp(-((bandD / 10) ** 2)) * smooth5(0.35, 0.65, fbm5(x * 0.05, r * 0.08, 3, 0)) * smooth5(120, 70, x);
        let cr = 0, cg = 0, cb = 0, cap = 1;
        const hs = hash5(x * 3 + 1, r * 7 + 2);
        if (hs > 0.994 - 0.05 * band && !near(x, r)) {
          const m = Math.pow(hash5(x + 17, r + 29), 3);
          const s = 0.2 + 0.5 * m;
          const tint = hash5(x + 5, r + 77);
          const [tr2, tg2, tb2] = tint < 0.3 ? [0.84, 0.9, 1] : tint > 0.88 ? [1, 0.93, 0.84] : [0.96, 0.96, 0.98];
          cr = s * tr2, cg = s * tg2, cb = s * tb2;
        }
        sr[k] = cr, sg[k] = cg, sb[k] = cb, sf[k] = 0, scap[k] = cap;
      }
    }
    for (let k = 0;k < N; k++)
      dot(k, k % W5, k / W5 | 0, sr[k], sg[k], sb[k], sf[k], scap[k]);
    const TW = 192, TH = 96;
    const tr = new Float32Array(TW * TH), tg = new Float32Array(TW * TH), tb = new Float32Array(TW * TH), sea = new Float32Array(TW * TH);
    const cloud = new Float32Array(TW * TH);
    const storms = [[0.9, 0.8, 1], [3.1, -0.85, -1], [4.6, 0.62, 1], [1.9, 0.25, 1], [5.6, -0.55, -1]];
    const elev = new Float32Array(TW * TH);
    for (let j = 0;j < TH; j++) {
      const v = (j + 0.5) / TH, lat = (0.5 - v) * Math.PI, al = Math.abs(lat);
      for (let i = 0;i < TW; i++) {
        const u = i / TW, lon = u * Math.PI * 2, t = j * TW + i;
        const wx = fbm5(u * 6, v * 3 + 9, 3, 6);
        elev[t] = fbm5(u * 8 + 1.6 * wx, v * 4, 5, 8) - 0.04 * smooth5(1.2, 1.5, al);
        let cx = u * 14, cy = v * 7;
        for (const [slon, slat, spin] of storms) {
          let dl = lon - slon;
          dl -= Math.round(dl / (Math.PI * 2)) * Math.PI * 2;
          const lx = dl * Math.cos(lat), ly = lat - slat;
          const dd = Math.hypot(lx, ly);
          const a = spin * 5 * Math.exp(-dd / 0.2);
          if (a * spin > 0.02) {
            const ca = Math.cos(a), sa = Math.sin(a);
            cx += (lx * ca - ly * sa - lx) / (Math.PI * 2) * 14;
            cy -= (lx * sa + ly * ca - ly) / Math.PI * 7;
          }
        }
        const q = fbm5(cx * 0.5 + 3, cy * 1.2, 3, 7);
        const n0 = fbm5(cx + 1.6 * q, cy * 1.3 + 0.5 * q, 5, 14);
        const n = 0.4 * n0 + 0.6 * (1 - Math.abs(2 * fbm5(cx * 1.5 + 2.2 * q, cy * 1.6 + 9, 4, 21) - 1));
        const belt = 0.05 * Math.exp(-((lat / 0.12) ** 2)) - 0.07 * Math.exp(-(((al - 0.42) / 0.16) ** 2)) + 0.05 * Math.exp(-(((al - 0.95) / 0.25) ** 2));
        cloud[t] = n + belt;
      }
    }
    const quantile = (A, p) => {
      const s = Float32Array.from(A).sort();
      return s[Math.floor(p * (s.length - 1))];
    };
    const shore = quantile(elev, 0.7), c0 = quantile(cloud, 0.6), c1 = quantile(cloud, 0.86);
    for (let j = 0;j < TH; j++) {
      const v = (j + 0.5) / TH, lat = (0.5 - v) * Math.PI, al = Math.abs(lat);
      for (let i = 0;i < TW; i++) {
        const u = i / TW, t = j * TW + i, e = elev[t];
        const land = smooth5(shore - 0.004, shore + 0.006, e);
        const ice = smooth5(1.22, 1.32, al + 0.12 * fbm5(u * 12, v * 6, 2, 12));
        const grain = fbm5(u * 36 + 2, v * 18, 3, 36) - 0.5;
        const arid = clamp5(Math.exp(-(((al - 0.4) / 0.22) ** 2)) * (0.1 + 1.2 * fbm5(u * 10 + 4, v * 5, 3, 10)) + (e - shore - 0.04) * 4 + 0.8 * grain);
        const relief = 1 + 1.2 * grain - 2.5 * Math.max(0, e - shore - 0.08);
        let r = mix5(0.13, 0.4, arid) * relief, g = mix5(0.25, 0.34, arid) * relief, b = mix5(0.08, 0.19, arid) * relief;
        const shelf = smooth5(shore - 0.06, shore, e);
        const or = mix5(0.025, 0.07, shelf), og = mix5(0.11, 0.3, shelf), ob = mix5(0.38, 0.62, shelf);
        r = mix5(or, r, land), g = mix5(og, g, land), b = mix5(ob, b, land);
        r = mix5(r, 0.92, ice), g = mix5(g, 0.95, ice), b = mix5(b, 0.99, ice);
        tr[t] = r, tg[t] = g, tb[t] = b, sea[t] = (1 - land) * (1 - ice);
        cloud[t] = smooth5(c0, c1, cloud[t]);
      }
    }
    const sample = (A, lon, vy) => {
      const fx = (lon / (Math.PI * 2) % 1 + 1) % 1 * TW;
      const x0 = Math.floor(fx), ax = fx - x0, x1 = (x0 + 1) % TW;
      const y0 = Math.max(0, Math.min(TH - 2, Math.floor(vy))), ay = clamp5(vy - y0);
      const a = A[y0 * TW + x0], b = A[y0 * TW + x1], c = A[y0 * TW + TW + x0], d = A[y0 * TW + TW + x1];
      return a + (b - a) * ax + (c - a) * ay + (a - b - c + d) * ax * ay;
    };
    const L = [SUN2[0], SUN2[1], -SUN2[2]];
    const HV = (() => {
      const v = [L[0], L[1], L[2] + 1];
      const l = Math.hypot(...v);
      return v.map((c) => c / l);
    })();
    const tilt = 0.4, nod = 0.22;
    const ct = Math.cos(tilt), st = Math.sin(tilt), cn = Math.cos(nod), sn = Math.sin(nod);
    const box = [];
    for (let r = Math.max(0, EC[1] - RISE - ER - 13);r <= Math.min(H5 - 1, EC[1] + ER + 2); r++) {
      for (let x = EC[0] - ER - 13;x <= EC[0] + ER + 13; x++)
        if (!ground[r * W5 + x])
          box.push(r * W5 + x);
    }
    const twinkle = [];
    for (const [x, r, s, p] of BRIGHT) {
      for (const [ox, oy, w] of [[0, 0, 1], [-1, 0, 0.2], [1, 0, 0.2], [0, -1, 0.2], [0, 1, 0.2]]) {
        const k = (r + oy) * W5 + x + ox;
        if (!ground[k])
          twinkle.push([k, x + ox, r + oy, s * w, p, hash5(x, r) * 6.28, w === 1]);
      }
    }
    const dirty = new Uint8Array(H5);
    for (const k of box)
      dirty[k / W5 | 0] = 1;
    for (const [k] of twinkle)
      dirty[k / W5 | 0] = 1;
    const lines = [];
    for (let r = 0;r < H5; r++)
      lines.push(chars.slice(r * W5, (r + 1) * W5).join(""));
    return (t, { color } = {}) => {
      const spin = t * 0.045;
      const drift = t * 0.012;
      const ey = EC[1] - RISE * (0.5 - 0.5 * Math.cos(t / RISE_T * Math.PI * 2));
      for (const k of box) {
        const x = k % W5, r = k / W5 | 0;
        let cr = sr[k], cg = sg[k], cb = sb[k], cap = scap[k], floor = 0;
        const dx = x + 0.5 - EC[0], dy = r + 0.5 - ey;
        const d = Math.hypot(dx, dy);
        if (d >= ER - 1 && d < ER + 12) {
          const side = smooth5(-0.3, 0.75, (dx * L[0] - dy * L[1]) / d);
          let g = Math.exp(-Math.max(0, d - ER) / 1.2) * 0.55 * side;
          if (g < 0.05)
            g = 0;
          cr += 0.25 * g, cg += 0.52 * g, cb += 1 * g;
          if (g > 0)
            cap = 1;
        }
        if (d < ER) {
          const nx = dx / ER, ny = -dy / ER, q2 = nx * nx + ny * ny;
          const nz = Math.sqrt(1 - q2);
          const ax = nx * ct + ny * st;
          const ay0 = -nx * st + ny * ct;
          const ay = ay0 * cn - nz * sn;
          const az = ay0 * sn + nz * cn;
          const lat = Math.asin(Math.max(-1, Math.min(1, ay)));
          const lon = Math.atan2(ax, az) + LON0 + spin;
          const vy = (0.5 - lat / Math.PI) * TH - 0.5;
          const ndl = nx * L[0] + ny * L[1] + nz * L[2];
          const day = smooth5(-0.005, 0.06, ndl) * (0.45 + 0.8 * Math.sqrt(clamp5(ndl)));
          const dusk = Math.exp(-(((ndl - 0.02) / 0.035) ** 2));
          const cl = sample(cloud, lon + drift, vy);
          const sh = sample(cloud, lon + drift - 0.03, vy + 0.4);
          const sw = sample(sea, lon, vy);
          let er = sample(tr, lon, vy), eg = sample(tg, lon, vy), eb = sample(tb, lon, vy);
          const shade = 1 - 0.45 * sh * (1 - cl);
          er *= shade, eg *= shade, eb *= shade;
          er = mix5(er, 0.95, cl), eg = mix5(eg, 0.97, cl), eb = mix5(eb, 1, cl);
          er *= day * (1 + 0.06 * dusk), eg *= day * (1 - 0.03 * dusk), eb *= day * (1 - 0.1 * dusk);
          const glint = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 70) * 0.8 * sw * (1 - cl);
          const rim = Math.pow(1 - nz, 2.2) * smooth5(0, 0.3, ndl);
          er += glint * 0.95 + rim * 0.2;
          eg += glint * 0.92 + rim * 0.42;
          eb += glint * 0.85 + rim * 0.85;
          const edge = smooth5(1, 0.95, Math.sqrt(q2));
          cr = mix5(cr, er, edge), cg = mix5(cg, eg, edge), cb = mix5(cb, eb, edge);
          cap = mix5(1, 0.66, (1 - sw) * (1 - cl) * smooth5(0.95, 0.85, Math.abs(ay)));
          floor = 0.15 * Math.min(1, day) * edge;
        }
        dot(k, x, r, cr, cg, cb, floor, cap);
      }
      for (const [k, x, r, s, p, ph, core] of twinkle) {
        const v = s * (0.86 + 0.14 * Math.sin(t / p * Math.PI * 2 + ph));
        if (core)
          dot(k, x, r, v * 0.97, v * 0.98, v, 0, 1);
        else
          dot(k, x, r, Math.max(sr[k], v * 0.95), Math.max(sg[k], v), Math.max(sb[k], v * 1.15), 0, 0.6);
      }
      for (let r = 0;r < H5; r++)
        if (dirty[r])
          lines[r] = chars.slice(r * W5, (r + 1) * W5).join("");
      if (color)
        color.set(cols);
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/kyoto-dusk.ts
  var exports_kyoto_dusk = {};
  __export(exports_kyoto_dusk, {
    default: () => kyotoDusk,
    meta: () => meta6
  });
  var meta6 = {
    name: "kyoto dusk",
    category: "scenes",
    note: "a pagoda at dusk behind a cherry tree lit by a stone lantern",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#0b0a16",
    palette: [
      "#1c1d4a",
      "#262759",
      "#33316b",
      "#433d7c",
      "#574a8c",
      "#6e5a9a",
      "#8a5a92",
      "#a8668f",
      "#c4748f",
      "#db8a95",
      "#ec9f9c",
      "#f6b8a8",
      "#fbd0b8",
      "#fff1d8",
      "#fffaf0",
      "#7e5f9e",
      "#f9d3dc",
      "#f2b2c4",
      "#e28fab",
      "#c66e92",
      "#9c5279",
      "#74405f",
      "#ffd9a0",
      "#ffbb6a",
      "#f29a4a",
      "#d0763a",
      "#a35a35",
      "#2a2240",
      "#3a2c50",
      "#4a3860",
      "#5b4f86",
      "#7a6aa0",
      "#2c3a3a",
      "#3d4c46",
      "#56604f",
      "#9a6aa0",
      "#b47ea6",
      "#4a3038",
      "#6a4448",
      "#2b3a6a",
      "#3e4f86"
    ]
  };
  var W6 = 200;
  var H6 = 100;
  var SHORE3 = 80;
  var PX = 141;
  var MOON = [176, 17];
  var LX = 53;
  var LB = 98;
  var LS = 1.8;
  var LAMP = [LX, LB - (LB - 83) * LS];
  var DOTS6 = " ·•●";
  var COVER6 = [0, 0.3, 0.6, 1];
  var BAYER6 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var SKY = 0;
  var HILL = 1;
  var TOWN2 = 2;
  var PAGODA = 3;
  var POND = 4;
  var BANK = 5;
  var TREE2 = 6;
  var BLOOM = 7;
  var STONE = 8;
  var FLAME = 9;
  function hash6(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise6(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash6(x0, yi), b = hash6(x1, yi), c = hash6(x0, yi + 1), d = hash6(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm6(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise6(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp6 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth6 = (a, b, v) => {
    const k = clamp6((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix6 = (a, b, k) => a + (b - a) * k;
  var hex6 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  function seg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const k = clamp6(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
    const ex = ax + dx * k - px, ey = ay + dy * k - py;
    return [Math.sqrt(ex * ex + ey * ey), k];
  }
  var EAVE = [68.5, 58, 48.5, 40, 32.5];
  var ROOF2 = [14.5, 13.4, 12.3, 11.2, 10.1];
  var BODY = [6.4, 5.9, 5.4, 4.9, 4.4];
  function pagoda(dx, y) {
    const ax = Math.abs(dx);
    if (y >= 76 && y < SHORE3 + 0.5)
      return ax <= 9.5 - (y < 77 ? 1 : 0) ? 1 : 0;
    for (let i = 0;i < 5; i++) {
      const e = EAVE[i], R = ROOF2[i];
      const u = ax / R;
      if (u <= 1) {
        const lift = 3.5 * u * u * u * u;
        const bottom = e - lift + 0.6;
        const top2 = e - lift - 1.2 - 3.6 * Math.pow(1 - u, 1.7);
        if (y >= top2 && y < bottom) {
          if (y < top2 + 0.9)
            return 4;
          if (y > bottom - 1)
            return 3;
          return 2;
        }
      }
      const floor = i === 0 ? 76 : EAVE[i - 1] - 3.6;
      if (y >= e + 0.6 && y < floor && ax <= BODY[i]) {
        if (i === 0 && ax <= 1 && y > 72 && y < 75.5)
          return 6;
        if (y < e + 2 && ax <= BODY[i] + 1.2)
          return 3;
        return 1;
      }
      if (i > 0 && y >= e + 0.6 && y < e + 2 && ax <= BODY[i] + 1.2)
        return 3;
    }
    const top = EAVE[4] - 1.2 - 3.6 - 0.2;
    if (y < top && y >= 9) {
      if (y >= top - 1.5)
        return ax <= 2.4 ? 3 : 0;
      if (y >= 15 && y < top - 1.5) {
        const ring = Math.floor((y - 15) / 1.2) & 1;
        return ax <= (ring ? 1.4 : 0.55) ? 5 : 0;
      }
      if (y >= 12)
        return ax <= 1.3 - (y - 12) * 0.2 ? 5 : 0;
      return ax <= 0.6 ? 5 : 0;
    }
    return 0;
  }
  function kyotoDusk() {
    const P = meta6.palette.map(hex6);
    const N = W6 * H6;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const mat = new Uint8Array(N);
    const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    const floorA = new Float32Array(N).fill(0.12);
    const warmth = new Float32Array(N);
    const skyAt = (x, y) => {
      const v = clamp6(y / SHORE3);
      const west = Math.exp(-Math.abs(x - 80) / 120);
      let a = smooth6(0, 0.5, v);
      let r = mix6(0.07, 0.22, a), g = mix6(0.07, 0.14, a), b = mix6(0.25, 0.38, a);
      a = smooth6(0.42, 0.86, v);
      r = mix6(r, 0.52, a), g = mix6(g, 0.32, a), b = mix6(b, 0.58, a);
      a = smooth6(0.78, 0.98, v) * (0.55 + 0.45 * west);
      r = mix6(r, 1, a), g = mix6(g, 0.62, a), b = mix6(b, 0.48, a);
      const band = Math.exp(-Math.abs(y - 74) / 4) * west * 0.18;
      r += band, g += band * 0.66, b += band * 0.45;
      const veil = 0.86 + 0.28 * fbm6(x * 0.035, y * 0.09, 3, 0);
      r *= veil, g *= veil, b *= veil;
      const dx = x - MOON[0], dy = y - MOON[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      const halo = Math.exp(-d / 5) * 0.24 + Math.exp(-d / 16) * 0.07;
      r += halo * 0.75, g += halo * 0.72, b += halo;
      return [r, g, b];
    };
    const hillA = (x) => 77.5 - (3 + 13 * smooth6(70, 175, x)) * (0.3 + 1.1 * fbm6(x * 0.022 + 3, 1, 4, 0));
    const hillB = (x) => 77 - 2.5 * fbm6(x * 0.04 + 9, 2, 4, 0);
    const town = (x) => {
      const i = Math.floor((x + 3) / 11);
      const f = (x + 3) / 11 - i;
      const h = 2 + hash6(i, 5) * 2.5;
      const e = Math.abs(f - 0.5) * 2;
      return e > 0.86 ? SHORE3 : SHORE3 - 1 - h + Math.max(0, e - 0.35) * 6;
    };
    const branches = [
      [16, 101, 20, 86, 5.2, 4.4],
      [20, 86, 27, 70, 4.4, 3.6],
      [27, 70, 31, 58, 3.6, 3],
      [31, 58, 50, 46, 3, 2.1],
      [50, 46, 74, 37, 2.1, 1.4],
      [74, 37, 98, 31, 1.4, 0.9],
      [98, 31, 116, 30, 0.9, 0.5],
      [31, 58, 24, 40, 2.6, 1.8],
      [24, 40, 12, 26, 1.8, 1.1],
      [12, 26, 0, 18, 1.1, 0.7],
      [29, 50, 42, 30, 2, 1.3],
      [42, 30, 52, 19, 1.3, 0.8],
      [52, 19, 70, 13, 0.8, 0.5],
      [50, 46, 60, 52, 1.2, 0.7],
      [74, 37, 86, 44, 1, 0.5],
      [42, 30, 66, 24, 1, 0.6],
      [66, 24, 90, 21, 0.6, 0.4],
      [24, 40, 34, 25, 1, 0.6],
      [12, 26, 6, 16, 0.7, 0.4],
      [98, 31, 104, 40, 0.6, 0.35],
      [40, 51, 44, 58, 1.1, 0.4],
      [58, 43, 62, 55, 0.9, 0.35],
      [70, 38, 76, 47, 0.7, 0.3]
    ];
    const limbs = branches.length;
    for (let b = 3;b < limbs; b++) {
      const [ax, ay, bx, by, w0, w1] = branches[b];
      const ang = Math.atan2(by - ay, bx - ax);
      for (let j = 0;j < 3; j++) {
        const k = 0.25 + 0.65 * hash6(b * 7 + j, 31);
        const sx = mix6(ax, bx, k), sy = mix6(ay, by, k);
        const turn = (j & 1 ? 1 : -1) * (0.5 + 0.6 * hash6(b, j + 40));
        const len = 4 + 7 * hash6(b + j, 41);
        const a2 = ang + turn - 0.25;
        branches.push([sx, sy, sx + Math.cos(a2) * len, sy + Math.sin(a2) * len, mix6(w0, w1, k) * 0.55, 0.3]);
      }
    }
    const clusters = [];
    for (let b = 3;b < branches.length; b++) {
      const [ax, ay, bx, by, w0] = branches[b];
      const len = Math.hypot(bx - ax, by - ay);
      const n = 1 + Math.round(len / 1.7);
      for (let i = 0;i <= n; i++) {
        const k = i / n;
        if (k < 0.3 && w0 > 2)
          continue;
        const h1 = hash6(b * 13 + i, 7), h2 = hash6(b * 5 + i, 11), h3 = hash6(b * 3 + i, 17);
        const cx = mix6(ax, bx, k) + (h1 - 0.5) * 6, cy = mix6(ay, by, k) + (h2 - 0.5) * 4.5 - 1;
        const spray = b >= limbs - 3 && b < limbs || b >= limbs + 3 * (limbs - 6);
        const dome = 9 + 10 * Math.pow(clamp6(Math.abs(cx - 52) / 70), 1.6);
        if (cx > 122 || cy < dome || cy > (spray ? 55 : 47))
          continue;
        clusters.push([cx, cy, 1.4 + 1.6 * h3 + 0.8 * k]);
      }
    }
    const bankX = (y) => 38 + (y - SHORE3) * 2.3 + 4 * fbm6(y * 0.2, 4, 2, 0);
    for (let r = 0;r < H6; r++) {
      for (let x = 0;x < W6; x++) {
        const k = r * W6 + x;
        const y = r + 0.5, xc = x + 0.5;
        let m = SKY, cr, cg, cb, fl = 0.12, warm = 0;
        if (y < SHORE3) {
          [cr, cg, cb] = skyAt(xc, y);
          fl = 0.04;
          if (y >= hillA(xc)) {
            m = HILL;
            const s = skyAt(xc, hillA(xc));
            const d = smooth6(hillA(xc), hillA(xc) + 8, y);
            const tex = fbm6(xc * 0.3, y * 0.45, 3, 0);
            const a = 0.6 + 0.2 * d + 0.25 * (tex - 0.5);
            cr = mix6(s[0], 0.14, a), cg = mix6(s[1], 0.08, a), cb = mix6(s[2], 0.24, a);
            const lip = smooth6(hillA(xc) + 1.4, hillA(xc), y) * 0.3;
            cr = mix6(cr, s[0] * 1.1, lip), cg = mix6(cg, s[1] * 1.05, lip), cb = mix6(cb, s[2], lip);
          }
          if (y >= hillB(xc)) {
            m = HILL;
            const tex = fbm6(xc * 0.3, y * 0.3, 3, 0);
            cr = 0.1 + 0.05 * tex, cg = 0.07 + 0.03 * tex, cb = 0.17 + 0.05 * tex;
            const mist = smooth6(hillB(xc) + 1, SHORE3, y) * 0.5;
            cr = mix6(cr, 0.7, mist), cg = mix6(cg, 0.44, mist), cb = mix6(cb, 0.58, mist);
          }
          if (y >= town(xc) && xc > 70) {
            m = TOWN2;
            cr = 0.08, cg = 0.06, cb = 0.14;
            const tf = Math.abs((xc + 3) / 11 % 1 - 0.5) * 2;
            if (y < town(xc) + 0.9 && tf < 0.45)
              cr = 0.5, cg = 0.31, cb = 0.44, fl = 0.06;
            const wi = Math.floor(xc / 4);
            if (y > SHORE3 - 1.6 && y < SHORE3 - 0.5 && xc % 4 < 1.2 && hash6(wi, 7) > 0.74) {
              cr = 1, cg = 0.66, cb = 0.32;
              fl = 0.3;
            }
          }
          const p = pagoda(xc - PX, y);
          if (p) {
            m = PAGODA;
            const dx = xc - PX;
            const rim = Math.exp(-Math.abs(dx + 4) / 30);
            if (p === 1)
              cr = 0.07, cg = 0.05, cb = 0.12;
            else if (p === 2)
              cr = 0.2 + 0.08 * rim, cg = 0.13 + 0.03 * rim, cb = 0.27 + 0.04 * rim;
            else if (p === 3)
              cr = 0.05, cg = 0.04, cb = 0.1;
            else if (p === 4)
              cr = 0.9 * rim + 0.25, cg = 0.5 * rim + 0.15, cb = 0.5 * rim + 0.3;
            else if (p === 5)
              cr = 0.3 + 0.2 * (dx < 0 ? 1 : 0), cg = 0.22, cb = 0.32;
            else if (p === 6)
              cr = 0.7, cg = 0.42, cb = 0.24, fl = 0.2;
          }
        } else {
          if (xc < bankX(y)) {
            m = BANK;
            const tex = fbm6(xc * 0.3, y * 0.5, 3, 0);
            cr = 0.08 + 0.05 * tex, cg = 0.08 + 0.05 * tex, cb = 0.1 + 0.05 * tex;
            if (hash6(x * 7, r * 3) > 0.975 - 0.015 * smooth6(SHORE3 + 4, H6, y))
              cr = 0.42, cg = 0.22, cb = 0.3, fl = 0.06;
            if (xc > bankX(y) - 2.6) {
              const s = 0.85 + 0.3 * hash6(x * 3, r * 5);
              cr = 0.45 * s, cg = 0.38 * s, cb = 0.46 * s, fl = 0.1;
            }
            warm = 1;
          } else
            m = POND;
        }
        mat[k] = m;
        R[k] = cr || 0, G[k] = cg || 0, B[k] = cb || 0;
        floorA[k] = fl;
        warmth[k] = warm;
      }
    }
    const RR = R.slice(), RG = G.slice(), RB = B.slice(), RM2 = mat.slice();
    const lantern = (dx, y) => {
      const ax = Math.abs(dx);
      if (y >= 93.5 && y < LB)
        return ax <= 4.2 - (y < 94.5 ? 0.8 : 0) ? 1 : 0;
      if (y >= 87 && y < 93.5)
        return ax <= 1.4 ? 1 : 0;
      if (y >= 85.5 && y < 87)
        return ax <= 3.6 - (y < 86.2 ? 0.6 : 0) ? 1 : 0;
      if (y >= 80 && y < 85.5) {
        if (ax <= 1.7 && y >= 80.8 && y < 84.8)
          return 2;
        return ax <= 2.9 ? 1 : 0;
      }
      if (y >= 76.5 && y < 80) {
        const u = (80 - y) / 3.5;
        const hw = 5.6 - 4.1 * Math.pow(u, 0.8) + (y > 79.2 ? 0.6 : 0);
        return ax <= hw ? 3 : 0;
      }
      if (y >= 73.5 && y < 76.5)
        return ax <= 1.3 - Math.abs(y - 75) * 0.25 ? 3 : ax <= 0.5 ? 3 : 0;
      return 0;
    };
    const at = (xc, y) => lantern((xc - LX) / LS, LB - (LB - y) / LS);
    for (let r = 45;r < H6; r++) {
      for (let x = LX - 14;x <= LX + 14; x++) {
        const y = r + 0.5, xc = x + 0.5;
        const l = at(xc, y);
        if (!l)
          continue;
        const k = r * W6 + x;
        const py = LB - (LB - y) / LS, pdx = (xc - LX) / LS;
        if (l === 2) {
          mat[k] = FLAME;
          const c = Math.exp(-(pdx * pdx * 0.5 + (py - 82.8) * (py - 82.8) * 0.35));
          R[k] = 0.85 + 0.15 * c, G[k] = 0.5 + 0.38 * c, B[k] = 0.2 + 0.4 * c * c, floorA[k] = 0.35;
        } else {
          mat[k] = STONE;
          const g = 0.8 + 0.4 * hash6(x * 5, r * 3);
          const edge = !at(xc, y - 1) ? 1 : 0;
          R[k] = (0.05 + 0.22 * edge) * g, G[k] = (0.04 + 0.14 * edge) * g, B[k] = (0.08 + 0.2 * edge) * g;
          const under = l === 3 && py > 78.6 || py >= 85.5 && py < 86.4;
          if (under) {
            const f = Math.exp(-Math.abs(py - 82.8) / 3) * 0.75;
            R[k] += f, G[k] += f * 0.5, B[k] += f * 0.18;
          }
          floorA[k] = 0.02;
        }
        warmth[k] = l === 2 ? 0 : 0.75;
      }
    }
    for (let r = 0;r < H6; r++) {
      for (let x = 0;x < 130; x++) {
        const k = r * W6 + x;
        const y = r + 0.5, xc = x + 0.5;
        let d = 0, best = 0, up = 0;
        for (const [cx, cy, rad] of clusters) {
          const dx = xc - cx, dy = (y - cy) * 1.15;
          const q = (dx * dx + dy * dy) / (rad * rad);
          if (q < 3) {
            const c = Math.exp(-q * 1.4);
            d += c;
            if (c > best)
              best = c, up = (dy + dx * 0.4) / rad;
          }
        }
        const n = fbm6(xc * 0.11, y * 0.15, 3, 0), n2 = noise6(xc * 0.5, y * 0.6, 0);
        const bloom = (1 - Math.exp(-d * 1.5)) * (0.15 + 1.35 * n) * (0.75 + 0.5 * n2);
        let onBranch = false, bw = 0;
        for (const [ax, ay, bx, by, w0, w1] of branches) {
          const [dist, kk] = seg(xc, y, ax, ay, bx, by);
          const w = mix6(w0, w1, kk) * 0.5 + 0.15;
          if (dist < w) {
            onBranch = true;
            bw = Math.max(bw, dist / w * (xc < ax + (bx - ax) * kk ? -1 : 1));
          }
        }
        if (onBranch && bloom < 0.85) {
          mat[k] = TREE2;
          const lit = smooth6(0.35, 1, bw);
          R[k] = 0.05 + 0.03 * lit, G[k] = 0.035 + 0.01 * lit, B[k] = 0.07;
          floorA[k] = 0;
          warmth[k] = 0.8;
        } else if (bloom > 0.5) {
          mat[k] = BLOOM;
          const inner = hash6(x * 3, r * 7);
          let b = clamp6(0.62 - 0.6 * up + 0.26 * (inner - 0.5) - 0.3 * smooth6(0.75, 0.5, bloom));
          b = mix6(b, 0.12, smooth6(0.3, 1.1, up));
          b *= 1 - 0.3 * smooth6(28, 48, y);
          R[k] = 0.34 + 0.64 * b, G[k] = 0.08 + 0.62 * b * b, B[k] = 0.2 + 0.5 * b;
          floorA[k] = 0.1;
          warmth[k] = 1;
        }
      }
    }
    const glow = new Float32Array(N);
    for (let r = 0;r < H6; r++)
      for (let x = 0;x < W6; x++) {
        const dx = x + 0.5 - LAMP[0], dy = (r + 0.5 - LAMP[1]) * 1.1;
        const d = Math.sqrt(dx * dx + dy * dy);
        glow[r * W6 + x] = Math.exp(-d / 4) * 0.6 + Math.exp(-d / 11) * 0.32 + Math.exp(-d / 32) * 0.1;
        const m = mat[r * W6 + x];
        if (m === BLOOM || m === TREE2)
          glow[r * W6 + x] += Math.exp(-d / 11) * 1.6;
        if (m === BANK) {
          const px = (x + 0.5 - LX) / 20, py = (r + 0.5 - LB + 3) / 8;
          glow[r * W6 + x] += Math.exp(-(px * px + py * py)) * 0.6;
        }
      }
    const stars = [];
    for (let i = 0;i < 400; i++) {
      const x = Math.floor(hash6(i, 91) * W6), r = Math.floor(hash6(i, 92) * 40);
      const k = r * W6 + x;
      if (mat[k] === SKY && hash6(i, 93) > 0.72)
        stars.push([k, hash6(i, 94) * 6.28, 0.6 + hash6(i, 95) * 1.6]);
    }
    const CW = 500, C0 = 34, C1 = 68;
    const cdens = (x, y) => fbm6(x * 0.014, y * 0.13, 4, CW * 0.014) - 0.3 * (1 - smooth6(C0, C0 + 10, y) * smooth6(C1, C1 - 8, y));
    const ccov = new Float32Array(CW * (C1 - C0)), clit = new Float32Array(CW * (C1 - C0));
    for (let r = C0;r < C1; r++)
      for (let x = 0;x < CW; x++) {
        const y = r + 0.5, d = cdens(x, y);
        ccov[(r - C0) * CW + x] = smooth6(0.56, 0.7, d);
        clit[(r - C0) * CW + x] = clamp6(0.5 + (d - cdens(x - 1, y + 2.2)) * 7);
      }
    const petals = [];
    for (let i = 0;i < 50; i++)
      petals.push({
        x: Math.pow(hash6(i, 101), 2.2) * 140,
        y: hash6(i, 102) * (H6 + 20),
        vx: 3 + hash6(i, 103) * 4,
        vy: 1.6 + hash6(i, 104) * 2.2,
        sw: 1 + hash6(i, 105) * 2,
        sf: 0.6 + hash6(i, 106) * 1.2,
        ph: hash6(i, 107) * 6.28,
        tum: 2 + hash6(i, 108) * 4
      });
    const floaters = [];
    for (let i = 0;i < 26; i++)
      floaters.push([hash6(i, 111) * W6, SHORE3 + 3 + hash6(i, 112) * 20, 0.3 + hash6(i, 113) * 0.5]);
    const dith = new Float32Array(N);
    for (let k = 0;k < N; k++)
      dith[k] = BAYER6[(Math.floor(k / W6) & 3) * 4 + (k % W6 & 3)] * 0.4 + (hash6(k, 77) - 0.5) * 0.5;
    const tone = new Float32Array(1025);
    for (let i = 0;i <= 1024; i++) {
      const v = i / 256;
      tone[i] = v < 0.75 ? v : 0.75 + 0.25 * (1 - Math.exp(-(v - 0.75) * 4));
    }
    const pr = new Float32Array(N), pg = new Float32Array(N), pb = new Float32Array(N);
    const pmask = new Uint8Array(N);
    return (t, { color } = {}) => {
      const flick = 0.82 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1) + 0.12 * (noise6(t * 4, 3.3, 0) - 0.5) * 2;
      const cdrift = (t * 0.8 % CW + CW) % CW;
      pmask.fill(0);
      for (const p of petals) {
        const xx = ((p.x + p.vx * t + p.sw * Math.sin(t * p.sf + p.ph)) % (W6 + 40) + W6 + 40) % (W6 + 40) - 20;
        const yy = ((p.y + p.vy * t + 0.6 * Math.sin(t * p.sf * 1.7 + p.ph)) % (H6 + 20) + H6 + 20) % (H6 + 20) - 10;
        const x = Math.round(xx), r = Math.round(yy);
        if (x < 0 || x >= W6 || r < 0 || r >= H6)
          continue;
        const k = r * W6 + x;
        const face = (0.55 + 0.45 * Math.abs(Math.sin(t * p.tum + p.ph))) * (mat[k] === POND || mat[k] === BANK ? 0.6 : 1);
        const lg = glow[k] * flick * 1.6;
        pr[k] = 1 * face + lg * 0.6, pg[k] = 0.76 * face + lg * 0.35, pb[k] = 0.84 * face + lg * 0.1;
        pmask[k] = 1;
      }
      for (let r = 0;r < H6; r++) {
        const y = r + 0.5;
        for (let x = 0;x < W6; x++) {
          const k = r * W6 + x;
          const m = mat[k];
          let cr, cg, cb, fl = floorA[k], fade = 1;
          if (m === POND) {
            const depth = (y - SHORE3) / (H6 - SHORE3);
            const wob = Math.sin(y * 1.7 - t * 2 + Math.sin(x * 0.13 + t * 0.6) * 1.4) * (0.05 + 0.8 * depth);
            let sx = Math.round(x + wob);
            sx = sx < 0 ? 0 : sx > W6 - 1 ? W6 - 1 : sx;
            const w = noise6(x * 0.14 + t * 0.2, y * 1.1 - t * 0.8, 0);
            let sr = Math.round(SHORE3 - 1 - (r - SHORE3) * 1.35 + (w - 0.5) * 3 * depth);
            sr = sr < 0 ? 0 : sr > SHORE3 - 1 ? SHORE3 - 1 : sr;
            const j = sr * W6 + sx;
            const lit = mix6(0.95, 0.6, smooth6(SHORE3 + 1, SHORE3 + 6, y)) * (0.8 + 0.4 * w);
            cr = RR[j] * lit * 0.9, cg = RG[j] * lit * 0.92, cb = RB[j] * lit + 0.03;
            const glint = smooth6(0.74, 0.95, w) * 0.06;
            cr += glint, cg += glint * 0.8, cb += glint;
            const sl = Math.exp(-Math.abs(x + 0.5 - LX - 9 - (y - SHORE3) * 0.25) / (3.5 + depth * 3)) * smooth6(0.45, 0.8, w) * 1 * flick;
            cr += sl, cg += sl * 0.62, cb += sl * 0.25;
            fade = smooth6(H6 + 2, H6 - 9, y);
          } else {
            cr = R[k], cg = G[k], cb = B[k];
            if (m === SKY && r >= C0 && r < C1) {
              const sx = x + cdrift, ix = Math.floor(sx), fx = sx - ix;
              const i0 = (r - C0) * CW + ix % CW, i1 = (r - C0) * CW + (ix + 1) % CW;
              const c = ccov[i0] + (ccov[i1] - ccov[i0]) * fx;
              if (c > 0.01) {
                const l = clit[i0] + (clit[i1] - clit[i0]) * fx;
                const sun = l * (0.45 + 0.55 * smooth6(C0, C1, y)) * (0.6 + 0.4 * Math.exp(-Math.abs(x - 80) / 90));
                const a = c * 0.85;
                cr = mix6(cr, mix6(0.2, 1, sun), a), cg = mix6(cg, mix6(0.12, 0.58, sun), a), cb = mix6(cb, mix6(0.27, 0.5, sun), a);
              }
            }
          }
          const wm = warmth[k];
          if (wm > 0) {
            const g = glow[k] * flick * wm;
            cr += g * 1, cg += g * 0.58, cb += g * 0.22;
          } else if (m === SKY || m === POND) {
            const g = glow[k] * flick * 0.6;
            cr += g, cg += g * 0.6, cb += g * 0.3;
          }
          if (m === FLAME) {
            const f = 0.85 + 0.25 * flick;
            cr = f, cg = 0.72 * f, cb = 0.38 * f;
          }
          if (pmask[k] && m !== FLAME) {
            cr = pr[k], cg = pg[k], cb = pb[k], fl = 0.3;
          }
          cr = tone[Math.min(1024, cr * 256 | 0)], cg = tone[Math.min(1024, cg * 256 | 0)], cb = tone[Math.min(1024, cb * 256 | 0)];
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp6(fl + (1 - fl) * Math.pow(peak, 1.1) * 1.02) * fade;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + dith[k])));
          out[k] = DOTS6[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER6[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp6(cr * s), clamp6(cg * s), clamp6(cb * s));
          }
        }
      }
      for (let r = MOON[1] - 6;r <= MOON[1] + 6; r++) {
        for (let x = MOON[0] - 6;x <= MOON[0] + 6; x++) {
          const dx = x + 0.5 - MOON[0], dy = r + 0.5 - MOON[1];
          const inside = dx * dx + dy * dy < 5.2 * 5.2;
          const ex = dx - 2.2, ey = dy + 1.6;
          if (inside && ex * ex + ey * ey > 4.9 * 4.9) {
            const k = r * W6 + x;
            out[k] = "●";
            if (color)
              color[k] = nearest(1, 0.96, 0.86);
          }
        }
      }
      for (const [k, ph, sp] of stars) {
        const s = Math.sin(t * sp + ph);
        if (s > -0.3) {
          out[k] = s > 0.7 ? "•" : "·";
          if (color)
            color[k] = nearest(0.9, 0.88, 1);
        }
      }
      for (const [fx, fy, sp] of floaters) {
        const x = Math.round((fx + t * sp) % W6), r = Math.round(fy + 0.3 * Math.sin(t * 0.8 + fx));
        if (r >= H6)
          continue;
        const k = r * W6 + x;
        if (mat[k] !== POND)
          continue;
        out[k] = "•";
        if (color)
          color[k] = nearest(0.95, 0.72, 0.8);
      }
      const lines = [];
      for (let r = 0;r < H6; r++)
        lines.push(out.slice(r * W6, (r + 1) * W6).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/lantern-lake.ts
  var exports_lantern_lake = {};
  __export(exports_lantern_lake, {
    default: () => lanternLake,
    meta: () => meta7
  });
  var meta7 = {
    name: "lantern lake",
    category: "scenes",
    note: "sky lanterns rising over a still mountain lake, one let go from a boat",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#04060d",
    palette: [
      "#141b30",
      "#1c2a52",
      "#22346a",
      "#2a4080",
      "#324c96",
      "#3c58a8",
      "#33306e",
      "#433c88",
      "#54449a",
      "#62407e",
      "#7a4a88",
      "#934e86",
      "#a4546e",
      "#bc5e66",
      "#d06a62",
      "#dc7650",
      "#e88444",
      "#f09238",
      "#d4581a",
      "#ea6c1e",
      "#f78226",
      "#ff9530",
      "#ffa83c",
      "#ffbb4e",
      "#ffcc66",
      "#ffdc86",
      "#ffe8a8",
      "#fff3cf",
      "#fffbec",
      "#b8341a",
      "#d84420",
      "#2f3748",
      "#4f586c",
      "#5e5a7e",
      "#7a6a8c",
      "#5a3220",
      "#7c4628",
      "#4a5578",
      "#5d6a92",
      "#7381ab",
      "#c4cdec",
      "#e4e9fb",
      "#ffffff"
    ]
  };
  var W7 = 200;
  var H7 = 100;
  var WL2 = 64;
  var SRC = 100;
  var BX = 108.5;
  var BW = 90;
  var SC = 1.4;
  var FX = BX - 3 * SC;
  var CYCLE = 20;
  var LET_GO = 3;
  var LIT = 6;
  var HELD = 5 * SC;
  var DOTS7 = " ·•●";
  var COVER7 = [0, 0.3, 0.6, 1];
  var BAYER7 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var AIR2 = 0;
  var FAR3 = 1;
  var BACK = 2;
  var PEAK = 3;
  var TREE3 = 4;
  function hash7(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise7(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash7(xi, yi), b = hash7(xi + 1, yi), c = hash7(xi, yi + 1), d = hash7(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm7(x, y, octaves) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise7(x * f, y * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp7 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth7 = (a, b, v) => {
    const k = clamp7((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix7 = (a, b, k) => a + (b - a) * k;
  var hex7 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  function seg2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const k = clamp7(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
    const ex = ax + dx * k - px, ey = ay + dy * k - py;
    return Math.sqrt(ex * ex + ey * ey);
  }
  var PEAKS2 = [[22, 42, 1.2], [-4, 33, 0.9], [172, 33, 1.05], [215, 22, 0.6]];
  var SHOULDERS = [[50, 25, 1], [64, 12, 0.75], [150, 17, 0.95], [196, 21, 0.75]];
  var DISTANT2 = [[98, 17, 0.42], [122, 14, 0.5], [82, 12, 0.45], [140, 11, 0.5]];
  function range2(x, peaks, seed, rough) {
    let m = -99, px = 0;
    for (const [cx, h, s] of peaks) {
      const v = h - Math.abs(x - cx) * s;
      if (v > m)
        m = v, px = cx;
    }
    const j = rough * (fbm7(x * 0.09, seed, 3) - 0.5) + rough * 0.45 * (noise7(x * 0.45, seed + 5) - 0.5);
    return [m + j * Math.min(1, Math.max(0, m) / 6), px];
  }
  function inside(u, v) {
    if (v < 0 || v > 1)
      return false;
    let hw = 0.34 - 0.08 * v;
    if (v < 0.14)
      hw *= Math.sqrt(1 - 0.6 * ((0.14 - v) / 0.14) ** 2);
    return u <= hw && u >= -hw;
  }
  function lanternLake() {
    const P = meta7.palette.map(hex7);
    const STAR = P.length - 3;
    const SL = STAR - 3;
    const N = W7 * H7, S = WL2 * W7;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < SL; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const mat = new Uint8Array(S);
    const sR = new Float32Array(S), sG = new Float32Array(S), sB = new Float32Array(S);
    const take = new Float32Array(S);
    const backTop = new Float32Array(W7), backX = new Float32Array(W7);
    const frontTop = new Float32Array(W7), frontX = new Float32Array(W7), farTop = new Float32Array(W7);
    for (let x = 0;x < W7; x++) {
      const [hb, pb] = range2(x + 0.5, PEAKS2, 3.1, 4);
      const [hf, pf] = range2(x + 0.5, SHOULDERS, 7.7, 3);
      const [hd] = range2(x + 0.5, DISTANT2, 11.3, 2.2);
      backTop[x] = WL2 - Math.max(hb, 0), backX[x] = pb;
      frontTop[x] = WL2 - Math.max(hf, 0), frontX[x] = pf;
      farTop[x] = WL2 - Math.max(hd, 0);
    }
    const dome = (x, y) => {
      const up = Math.max(0, WL2 - 6 - y);
      const dx = (x - SRC - 0.3 * up) / (44 + up);
      return Math.exp(-dx * dx) * (0.6 * Math.exp(-up / 14) + 0.4 * Math.exp(-up / 40));
    };
    const HUES = [[0.22, 0.36, 1], [0.46, 0.36, 1], [0.76, 0.42, 0.92], [1, 0.48, 0.58], [1, 0.54, 0.34], [1, 0.58, 0.2]];
    const hue = (w, j) => {
      const f = clamp7(w) * 5, i = Math.min(4, Math.floor(f));
      return mix7(HUES[i][j], HUES[i + 1][j], f - i);
    };
    const slope = (k, x, y, top, px, haze, relief, edge, warm) => {
      const xc = x + 0.5, depth = y - top;
      const inward = px < SRC ? 1 : -1;
      const ridge2 = px + (depth + 1) * 0.6 * (noise7(y * 0.1, px) - 0.5);
      const face = smooth7(-4, 4, (xc - ridge2) * inward);
      const u = x + depth * 0.45 * Math.sign(xc - px || 1);
      const rib = (q) => fbm7(q * 0.13, px * 0.37, 3);
      const grad = (rib(u + 1) - rib(u - 1)) * 7 * inward;
      const lit = clamp7(0.3 + 0.5 * face + grad * 0.5);
      const tex = 0.8 + 0.4 * fbm7(x * 0.35, y * 0.35, 2);
      const w = lit * Math.exp(-(((xc - SRC) / 70) ** 2)) * (0.4 + 0.6 * smooth7(top + 2, WL2, y)) * 0.9;
      const b = (haze + relief * lit * lit) * tex + 0.16 * w;
      const rim = smooth7(1.8, 0.3, depth) * edge, sky = dome(xc, top - 1);
      const c = (j) => b * hue(w * warm, j) + rim * hue(sky, j);
      sR[k] = c(0), sG[k] = c(1), sB[k] = c(2);
      return w;
    };
    const far = new Uint8Array(S);
    for (let r = 0;r < WL2; r++) {
      for (let x = 0;x < W7; x++) {
        const k = r * W7 + x;
        const y = r + 0.5, xc = x + 0.5;
        if (y >= frontTop[x]) {
          mat[k] = PEAK;
          slope(k, x, y, frontTop[x], frontX[x], 0.05, 0.06, 0.3, 1);
        } else if (y >= backTop[x]) {
          mat[k] = BACK;
          if (slope(k, x, y, backTop[x], backX[x], 0.24, 0.3, 0.35, 0.5) < 0.3 && y - backTop[x] > 1.2)
            far[k] = 1;
        } else if (y >= farTop[x]) {
          mat[k] = FAR3;
          const tex = fbm7(x * 0.2, y * 0.3, 3);
          const w = dome(xc, y);
          const b = 0.06 + 0.04 * tex + 0.3 * w + 0.7 * w ** 3;
          sR[k] = b * hue(w, 0), sG[k] = b * hue(w, 1), sB[k] = b * hue(w, 2);
        } else {
          const v = Math.pow(y / WL2, 1.5);
          const hz = 0.85 + 0.3 * fbm7(x * 0.04, r * 0.07, 3);
          const w = dome(xc, y);
          const b = (0.18 + 0.32 * v) * hz + 0.5 * w;
          sR[k] = b * hue(w, 0), sG[k] = b * hue(w, 1), sB[k] = b * hue(w, 2);
          take[k] = w;
        }
      }
    }
    const scrub = (x) => WL2 - 2.4 - 1.4 * fbm7(x * 0.15, 5.5, 3);
    for (let r = 0;r < WL2; r++)
      for (let x = 0;x < W7; x++)
        if (r + 0.5 >= scrub(x + 0.5))
          mat[r * W7 + x] = TREE3;
    const spruce = (tx, th, tw, tb) => {
      for (let r = Math.max(0, Math.floor(tb - th));r < WL2; r++) {
        const y = r + 0.5, dy = y - (tb - th);
        if (dy < 0 || y >= tb + 0.5)
          continue;
        const tier = (dy + th * 0.3) / 1.6;
        const w = dy / th * tw * (0.7 + 0.45 * (tier - Math.floor(tier))) + 0.3;
        for (let x = Math.max(0, Math.floor(tx - tw - 1));x <= Math.min(W7 - 1, tx + tw + 1); x++) {
          if (Math.abs(x + 0.5 - tx) <= w)
            mat[r * W7 + x] = TREE3;
        }
      }
    };
    for (let x = -2;x < W7 + 2; ) {
      const h = hash7(Math.floor(x * 7), 21);
      const clearing = smooth7(22, 0, Math.abs(x - SRC));
      const th = (2.6 + 4.4 * hash7(Math.floor(x * 3), 5) ** 1.2) * (1 - 0.3 * clearing);
      spruce(x + hash7(Math.floor(x), 2), th, 1 + 0.8 * hash7(Math.floor(x), 4), scrub(x) + 1);
      x += 1.2 + 1.8 * h;
    }
    for (let k = 0;k < S; k++) {
      if (mat[k] !== TREE3)
        continue;
      const x = k % W7, r = k / W7 | 0;
      const h = hash7(x * 13 + r, 5);
      sR[k] = 0.004 + 0.004 * h, sG[k] = 0.006 + 0.006 * h, sB[k] = 0.012 + 0.008 * h;
      const edge = r === 0 || mat[k - W7] !== TREE3 ? 1 : r > 1 && mat[k - 2 * W7] !== TREE3 ? 0.35 : 0;
      const g = edge * dome(x + 0.5, r + 0.5) * 0.45;
      sR[k] += g, sG[k] += g * 0.5, sB[k] += g * 0.18;
      take[k] = edge * 0.5;
    }
    const floorS = new Float32Array(S);
    for (let k = 0;k < S; k++)
      floorS[k] = mat[k] === AIR2 ? 0.04 + 0.08 * (k / W7 | 0) / WL2 : mat[k] === FAR3 || mat[k] === BACK ? 0.03 : 0;
    const shoreLights = [];
    for (let i = 0, x = SRC - 24;i < 8; i++) {
      shoreLights.push([Math.round(x), WL2 - 1 - (hash7(i, 62) > 0.6 ? 1 : 0), hash7(i, 63) * 6.28]);
      x += 2 + 9 * hash7(i, 61) ** 2;
    }
    const stars = [];
    for (let k = 0;k < S; k++) {
      if (mat[k] !== AIR2)
        continue;
      const h = hash7(k % W7, Math.floor(k / W7) + 101);
      if (h > 0.985 && take[k] < 0.25)
        stars.push([k, hash7(k, 3) * 6.28, 0.8 + hash7(k, 4) * 2.5, (0.45 + (h - 0.985) * 40) * (1 - take[k] * 2.5)]);
    }
    const gap = new Uint8Array(H7);
    for (let r = WL2;r < H7; r++)
      gap[r] = hash7(r, 404) < 0.3 ? 1 : 0;
    const shore = [];
    for (let i = 0;i < 240; i++) {
      const near = i >= 196;
      const s = near ? 1.5 + 1.7 * hash7(i, 11) ** 1.5 : 0.45 + 0.9 * hash7(i, 11) ** 1.4;
      const v = 0.3 + 0.62 * s;
      const out2 = near && hash7(i, 12) < 0.7;
      const climb = out2 ? WL2 + 3 * s + 4 : 12 + 46 * hash7(i, 13) ** 0.8;
      shore.push({
        i,
        s,
        v,
        life: (climb + s + 1) / v,
        off: hash7(i, 14),
        wd: 0.12 + 0.3 * hash7(i, 15),
        sw: 0.25 * s + 0.2,
        sf: 0.3 + 0.5 * hash7(i, 16),
        ph: hash7(i, 17) * 6.28,
        f1: 2 + 3 * hash7(i, 18),
        f2: 5 + 4 * hash7(i, 19),
        out: out2,
        wide: near || hash7(i, 20) < 0.08
      });
    }
    shore.sort((a, b) => a.s - b.s);
    const startX = (f, lap) => {
      const n = f.i * 7 + lap * 131;
      if (f.wide)
        return 12 + 176 * hash7(n, 23);
      return SRC - 6 + 30 * (hash7(n, 23) + hash7(n, 24) + hash7(n, 25) - 1.5);
    };
    const lean = (f, climb) => climb * f.wd + climb * climb * 0.004;
    const NEAR2 = [
      [12.5, 34, 30],
      [8.5, 178, 14],
      [6.5, 66, 74],
      [5.2, 154, 46],
      [4.4, 18, 86],
      [4.6, 136, 4],
      [9.5, 190, 116],
      [10.5, 150, 160],
      [5.8, 80, 128],
      [7, 28, 190],
      [4.2, 172, 150]
    ];
    const close = NEAR2.map(([s, x, y], i) => {
      const v = 0.35 + 0.42 * s;
      const path = H7 + 5 * s;
      const life = path / v * (1.08 + 0.3 * hash7(i, 41));
      return { i, s, v, x, path, life, off: (H7 + 2.5 * s - y) / v / life, wd: s * 0.05, sw: 0.35 * s, sf: 0.2 + 0.2 * hash7(i, 42), ph: hash7(i, 43) * 6.28 };
    });
    const ARMS = {
      up: [[1.3, 9.4], [3, 11.5], [2, 14.1]],
      down: [[1.3, 9.4], [2, 6.6], [1.9, 4.4]],
      chest: [[1.3, 9.4], [2.4, 7.2], [1.2, 6]]
    };
    const gunwale = (dx) => 2.4 + (dx > 0 ? 3 : 1.8) * smooth7(4, 12.5, Math.abs(dx)) ** 2;
    const hull = (dx, up) => up <= gunwale(dx) && up > -0.6 && Math.abs(dx) <= 12.5 - Math.max(0, 1.8 - up) * 2.4;
    const body = (dx, up, arms2) => {
      if (dx * dx / 1.3 + (up - 11.2) ** 2 / 1.5 < 1)
        return true;
      if (up <= 9.8 && up > 1 && Math.abs(dx) <= 1.35 + 0.5 * smooth7(9.8, 2, up))
        return true;
      const ax = Math.abs(dx);
      return seg2(ax, up, arms2[0][0], arms2[0][1], arms2[1][0], arms2[1][1]) < 0.66 || seg2(ax, up, arms2[1][0], arms2[1][1], arms2[2][0], arms2[2][1]) < 0.58;
    };
    const BOX = [Math.floor(BX - 13 * SC), BW - Math.ceil(16 * SC), Math.ceil(27 * SC), Math.ceil(16 * SC) + 2];
    const hulls = new Uint8Array(BOX[2] * BOX[3]), shape = new Uint8Array(BOX[2] * BOX[3]);
    for (let j = 0;j < BOX[3]; j++) {
      for (let i = 0;i < BOX[2]; i++)
        if (hull((BOX[0] + i + 0.5 - BX) / SC, (BW - (BOX[1] + j + 0.5)) / SC))
          hulls[j * BOX[2] + i] = 1;
    }
    const arms = ARMS.up.map((p) => [...p]);
    const pose = (a, b, k) => {
      for (let i = 0;i < 3; i++)
        arms[i][0] = mix7(a[i][0], b[i][0], k), arms[i][1] = mix7(a[i][1], b[i][1], k);
      for (let j = 0;j < BOX[3]; j++) {
        for (let i = 0;i < BOX[2]; i++) {
          const q = j * BOX[2] + i;
          shape[q] = hulls[q] || (body((BOX[0] + i + 0.5 - FX) / SC, (BW - (BOX[1] + j + 0.5)) / SC, arms) ? 2 : 0);
        }
      }
    };
    const BOWX = BX + 11.2 * SC, BOWY = BW - (gunwale(11.2) + 1.2) * SC;
    const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    const FL = new Float32Array(N);
    const paint = (k, pr, pg, pb, a) => {
      R[k] += (pr - R[k]) * a, G[k] += (pg - G[k]) * a, B[k] += (pb - B[k]) * a;
      if (FL[k] < 0.12 * a)
        FL[k] = 0.12 * a;
    };
    const lantern = (cx, cy, h, I, a, limit, hide2) => {
      if (h < 1.4) {
        const x = Math.floor(cx), r = Math.floor(cy);
        if (x < 0 || x >= W7 || r < 0 || r >= limit)
          return;
        const k = r * W7 + x;
        if (hide2 && hide2[k])
          return;
        const q = I * (0.85 + 0.15 * h);
        paint(k, q, q * (0.42 + 0.3 * q), q * (0.1 + 0.18 * q * q), a);
        return;
      }
      if (h < 2.6) {
        const x = Math.floor(cx), top2 = cy - 1, r02 = Math.floor(top2);
        if (x < 0 || x >= W7)
          return;
        for (let r = r02;r <= r02 + 2; r++) {
          if (r < 0 || r >= limit)
            continue;
          const k = r * W7 + x;
          if (hide2 && hide2[k])
            continue;
          const up = Math.max(0, Math.min(r + 1, top2 + 1) - Math.max(r, top2));
          const dn = Math.max(0, Math.min(r + 1, top2 + 2) - Math.max(r, top2 + 1));
          if (up + dn < 0.02)
            continue;
          const q = I * (0.8 * up + 1.1 * dn) / (up + dn);
          paint(k, q, q * (0.34 + 0.36 * q), q * (0.06 + 0.2 * q * q), a * (up + dn));
        }
        return;
      }
      const top = cy - h / 2;
      const x0 = Math.max(0, Math.floor(cx - 0.36 * h)), x1 = Math.min(W7 - 1, Math.floor(cx + 0.36 * h));
      const r0 = Math.max(0, Math.floor(top)), r1 = Math.min(limit - 1, Math.floor(top + h));
      for (let r = r0;r <= r1; r++) {
        for (let x = x0;x <= x1; x++) {
          const k = r * W7 + x;
          if (hide2 && hide2[k])
            continue;
          let cov = 0;
          for (let sy = 0;sy < 3; sy++)
            for (let sx = 0;sx < 3; sx++)
              if (inside((x + (sx + 0.5) / 3 - cx) / h, (r + (sy + 0.5) / 3 - top) / h))
                cov++;
          if (!cov)
            continue;
          const u = (x + 0.5 - cx) / h, v = clamp7((r + 0.5 - top) / h);
          const xn = Math.min(1, Math.abs(u) / (0.34 - 0.08 * v));
          const q = I * (1 - 0.3 * xn * xn) * (0.78 + 0.42 * v);
          const fl = Math.exp(-((u / 0.13) ** 2) - ((v - 0.9) / 0.1) ** 2) * I;
          paint(k, q + fl * 0.3, q * (0.3 + 0.42 * q) + fl * 0.6, q * (0.04 + 0.2 * q * q) + fl * 0.5, cov / 9 * a);
        }
      }
    };
    const halo = (cx, cy, h, g, limit) => {
      const e = 0.4 + 0.32 * h;
      const reach = Math.ceil(e * 4);
      const r0 = Math.max(0, Math.floor(cy - reach)), r1 = Math.min(limit - 1, Math.floor(cy + reach));
      const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(W7 - 1, Math.floor(cx + reach));
      for (let r = r0;r <= r1; r++) {
        const dy = r + 0.5 - cy;
        for (let x = x0;x <= x1; x++) {
          const dx = x + 0.5 - cx;
          const d = Math.max(0, Math.sqrt(dx * dx + dy * dy) - 0.3 * h);
          const q = g * (Math.exp(-d / e) + 0.25 * Math.exp(-d / (e * 2.5)));
          const k = r * W7 + x;
          R[k] += q, G[k] += q * 0.5, B[k] += q * 0.17;
        }
      }
    };
    const hide = new Uint8Array(S);
    for (let k = 0;k < S; k++)
      hide[k] = mat[k] === TREE3 ? 1 : 0;
    const roadX = new Float32Array(H7), roadW = new Float32Array(H7), roadA = new Float32Array(H7);
    for (let r = WL2;r < H7; r++) {
      const dw = r + 0.5 - WL2;
      roadX[r] = SRC + 4 + dw * 0.12;
      roadW[r] = 7 + dw * 0.9;
      roadA[r] = 0.9 * smooth7(3, 16, dw) * Math.exp(-dw / 60);
    }
    return (t, { color } = {}) => {
      const breathe = 0.06 * Math.sin(t * 0.5) + 0.04 * Math.sin(t * 1.7 + 1);
      for (let k = 0;k < S; k++) {
        const g = 1 + take[k] * breathe;
        R[k] = sR[k] * g, G[k] = sG[k] * g, B[k] = sB[k] * g;
        FL[k] = floorS[k];
      }
      for (const f of shore) {
        const u = t / f.life + f.off;
        const lap = Math.floor(u);
        const a = (u - lap) * f.life;
        const cx = startX(f, lap) + lean(f, f.v * a) + f.sw * (Math.sin(a * f.sf + f.ph) - Math.sin(f.ph));
        const cy = WL2 + f.s * 0.5 + 0.6 - f.v * a;
        if (cy < -2 * f.s - 2)
          continue;
        let I = (0.7 + 0.45 * Math.min(1, f.s)) * (0.88 + 0.08 * Math.sin(t * f.f1 + f.ph) + 0.04 * Math.sin(t * f.f2));
        let alpha = 1;
        if (!f.out) {
          const end = smooth7(f.life - 4, f.life, a);
          I *= 1 - 0.55 * end * (0.6 + 0.4 * Math.sin(a * 11 + f.ph));
          alpha = 1 - end;
        }
        if (alpha <= 0.01)
          continue;
        if (f.s >= 1.4)
          halo(cx, cy, f.s, 0.07 * I * alpha * smooth7(0, 2, a), WL2);
        lantern(cx, cy, f.s, I, alpha, WL2, hide);
      }
      for (const [x, r, ph] of shoreLights) {
        const k = r * W7 + x;
        const q = 0.9 + 0.15 * Math.sin(t * 3.1 + ph) + 0.1 * Math.sin(t * 7.3 + ph * 2);
        R[k] = q, G[k] = q * 0.62, B[k] = q * 0.24, FL[k] = 0.2;
      }
      for (let r = WL2;r < H7; r++) {
        const y = r + 0.5;
        const dw = y - WL2;
        const deep = mix7(1, 0.65, dw / (H7 - WL2));
        const ry = WL2 - 1 - (r - WL2);
        const r0 = Math.max(0, ry) * W7, r1 = Math.max(0, ry - 1) * W7, r2 = Math.max(0, ry - 2) * W7;
        const fade = smooth7(H7 + 4, H7 - 7, y);
        const rx = roadX[r], rw = roadW[r], ra = roadA[r];
        for (let x = 0;x < W7; x++) {
          const k = r * W7 + x;
          const wave = noise7(x * 0.04 + t * 0.05, r * 0.55 - t * 0.35);
          const sx = x + (0.45 + dw * 0.075) * Math.sin(r * 1.3 + t * 1.6 + wave * 4);
          let ix = Math.floor(sx);
          const fx = sx - ix;
          ix = Math.max(0, Math.min(W7 - 2, ix));
          const a0 = r0 + ix, a1 = r1 + ix, a2 = r2 + ix;
          const sky = mat[a0] !== TREE3;
          const streak = smooth7(0.25, 0.75, noise7(x * 0.035 + t * 0.04, r * 0.75 - t * 0.3));
          let kr = 0.9 * (0.5 + 0.5 * streak) * (0.85 + 0.25 * wave) * deep;
          if (gap[r] && wave < 0.45)
            kr *= 0.2;
          const gx = 1 - fx;
          let cr = ((R[a0] * gx + R[a0 + 1] * fx) * 0.5 + (R[a1] * gx + R[a1 + 1] * fx) * 0.3 + (R[a2] * gx + R[a2 + 1] * fx) * 0.2) * kr + 0.006;
          let cg = ((G[a0] * gx + G[a0 + 1] * fx) * 0.5 + (G[a1] * gx + G[a1 + 1] * fx) * 0.3 + (G[a2] * gx + G[a2 + 1] * fx) * 0.2) * kr + 0.012;
          let cb = ((B[a0] * gx + B[a0 + 1] * fx) * 0.5 + (B[a1] * gx + B[a1 + 1] * fx) * 0.3 + (B[a2] * gx + B[a2 + 1] * fx) * 0.2) * kr + 0.028;
          let g = 0;
          const qx = (x + 0.5 - rx) / rw;
          if (qx > -2.2 && qx < 2.2) {
            const dash = smooth7(0.42, 0.72, noise7(x * 0.11 + t * 0.1, r * 0.9 - t * 0.55));
            g = ra * Math.exp(-qx * qx) * (0.3 + 0.7 * dash) * (gap[r] ? 0.55 : 1);
          }
          if (dw < 10) {
            for (const [lx, , ph] of shoreLights) {
              const d = x - lx;
              if (d > 3 || d < -3)
                continue;
              g += Math.exp(-d * d * 1.5) * Math.exp(-dw / 4) * smooth7(0.35, 0.7, noise7(x * 0.6 + ph, y * 1.3 - t * 1.4)) * 0.8;
            }
          }
          if (g > 0) {
            const keep = 1 - Math.min(0.9, g * 4);
            cr = cr * keep + g, cg = cg * keep + g * 0.56, cb = cb * keep + g * 0.2;
          }
          if (g < 0.2) {
            const sheen = smooth7(0.6, 0.85, noise7(x * 0.07 + t * 0.03, r * 1.1 - t * 0.25)) * 0.12 * (1 - g * 5) * deep;
            cr += sheen * 0.3, cg += sheen * 0.48, cb += sheen;
          }
          R[k] = cr * fade, G[k] = cg * fade, B[k] = cb * fade;
          FL[k] = (sky ? 0.07 * deep : 0.03) * fade;
        }
      }
      const tc = (t % CYCLE + CYCLE) % CYCLE;
      const bob = (at) => 0.3 * Math.sin(at * 1.3);
      const holdY = BW - 14.1 * SC - HELD / 2;
      const flick = (m) => 1.1 + 0.05 * Math.sin(t * 4.7 + m * 2.1) + 0.03 * Math.sin(t * 11.3 + m * 5.3);
      const n = Math.floor(t / CYCLE);
      const mine = flick(tc < LET_GO ? n : n + 1);
      let hy = 0, hs = HELD, ha = 0;
      if (tc < LET_GO || tc >= LIT + 5)
        hy = holdY + bob(t), ha = 1;
      else if (tc >= LIT) {
        ha = smooth7(LIT, LIT + 2.5, tc);
        hs = HELD * (0.75 + 0.25 * smooth7(LIT, LIT + 3, tc));
        hy = mix7(BW - 8.6 * SC, holdY + bob(t), smooth7(LIT + 3.5, LIT + 5, tc));
      }
      if (tc < LET_GO + 2)
        pose(ARMS.up, ARMS.down, smooth7(LET_GO + 1, LET_GO + 2, tc));
      else if (tc < LIT + 1)
        pose(ARMS.down, ARMS.chest, smooth7(LIT - 0.6, LIT, tc));
      else
        pose(ARMS.chest, ARMS.up, smooth7(LIT + 3.5, LIT + 5, tc));
      const flights = [];
      for (let m = n;m >= n - 2; m--) {
        const tr = m * CYCLE + LET_GO, age = t - tr;
        if (age < 0)
          continue;
        const y = holdY + bob(tr) - 2.8 * (age - 1.5 * (1 - Math.exp(-age / 1.5)));
        if (y < -3 * HELD)
          continue;
        flights.push([FX + 0.3 * age + 1.2 * Math.sin(age * 0.35), y, flick(m)]);
      }
      const lights = [];
      const lamp = 1.2 + 0.04 * Math.sin(t * 5.3) + 0.03 * Math.sin(t * 12.7);
      lights.push([BOWX, BOWY + 1, 0.4 * lamp, 0.4]);
      halo(BOWX, BOWY, 2, 0.07 * lamp, H7);
      if (ha > 0)
        lights.push([FX, hy + hs / 2, ha * mine, 1]);
      for (const [x, y, l] of flights) {
        halo(x, y, HELD, 0.2 * l, H7);
        lights.push([x, y + HELD / 2, l * Math.exp(-Math.max(0, holdY - y) / 8), 1]);
      }
      if (ha > 0)
        halo(FX, hy, HELD, 0.2 * ha * mine, H7);
      for (const [lx, , q, sz] of lights) {
        if (q < 0.003)
          continue;
        for (let r = Math.floor(BW - 9 * SC);r < H7; r++) {
          const y = r + 0.5, dw = y - BW;
          for (let x = Math.max(0, Math.floor(lx - 34 * sz));x < Math.min(W7, lx + 34 * sz); x++) {
            const k = r * W7 + x;
            const dx = x + 0.5 - lx;
            let g = Math.exp(-Math.sqrt((dx / (16 * SC * 0.8 * sz)) ** 2 + (dw / ((dw < 0 ? 2.6 : 3.6) * SC * sz)) ** 2)) * 0.5;
            if (dw > -1) {
              const w = (1.4 + 0.2 * Math.max(0, dw)) * (0.5 + 0.5 * sz);
              g += Math.exp(-((dx / w) ** 2)) * Math.exp(-Math.max(0, dw) / (16 * sz)) * smooth7(0.4, 0.72, noise7(x * 0.45 + 3, y * 1.2 - t * 1.3)) * 1.1;
            }
            g *= q;
            const keep = 1 - Math.min(0.9, g * 4);
            R[k] = R[k] * keep + g, G[k] = G[k] * keep + g * 0.62, B[k] = B[k] * keep + g * 0.26;
          }
        }
      }
      for (let j = 0;j < BOX[3]; j++) {
        for (let i = 0;i < BOX[2]; i++) {
          const m = shape[j * BOX[2] + i];
          if (!m)
            continue;
          const x = BOX[0] + i, r = BOX[1] + j;
          if (x < 0 || x >= W7 || r >= H7)
            continue;
          const k = r * W7 + x;
          let g = m === 2 && (i === 0 || i === BOX[2] - 1 || !shape[j * BOX[2] + i - 1] || !shape[j * BOX[2] + i + 1]) ? 0.16 : 0;
          const top = j === 0 || !shape[(j - 1) * BOX[2] + i];
          for (const [lx, ly, lq] of lights) {
            if (lq < 0.003)
              continue;
            const dx = lx - (x + 0.5), dy = ly - (r + 0.5);
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            if (m === 2) {
              const ni = i + Math.round(dx / d), nj = j + Math.round(dy / d);
              const open = ni < 0 || nj < 0 || ni >= BOX[2] || nj >= BOX[3] || !shape[nj * BOX[2] + ni];
              g += lq * (open ? 0.95 : 0.05) * Math.exp(-d / (6 * SC));
            } else {
              g += lq * (top ? 0.6 * Math.exp(-Math.abs(dx) / (11 * SC)) : 0.02);
            }
          }
          R[k] = 0.01 + g, G[k] = 0.008 + g * 0.55, B[k] = 0.014 + g * 0.22;
          FL[k] = 0;
        }
      }
      lantern(BOWX, BOWY, 2, lamp, 1, H7, null);
      for (const [x, y, q] of flights)
        lantern(x, y, HELD, q, 1, H7, null);
      if (ha > 0)
        lantern(FX, hy, hs, ha * mine, Math.min(1, ha * 1.4), H7, null);
      for (const c of close) {
        const u = t / c.life + c.off;
        const lap = Math.floor(u);
        const a = (u - lap) * c.life;
        if (lap < 0 || a * c.v > c.path)
          continue;
        let x0 = c.x;
        if (lap) {
          x0 = 6 + 188 * hash7(c.i * 17 + lap, 44);
          if (x0 > 84 && x0 < 132)
            x0 = x0 < 108 ? x0 - 32 : x0 + 32;
        }
        const cx = x0 + c.wd * a + c.sw * (Math.sin(a * c.sf + c.ph) - Math.sin(c.ph));
        const cy = H7 + 2.5 * c.s - c.v * a;
        const I = 1.15 + 0.05 * Math.sin(t * 3.3 + c.ph) + 0.03 * Math.sin(t * 8.1 + c.i);
        halo(cx, cy, c.s, 0.1 * I, H7);
        lantern(cx, cy, c.s, I, 1, H7, null);
      }
      for (let r = 0;r < H7; r++) {
        for (let x = 0;x < W7; x++) {
          const k = r * W7 + x;
          const cr = R[k], cg = G[k], cb = B[k];
          const floor = FL[k];
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp7(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95);
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER7[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS7[step];
          if (color) {
            if (k < S && far[k] && FL[k] < 0.05 && cb >= cr) {
              color[k] = SL + (level > 0.42 ? 2 : level > 0.3 ? 1 : 0);
              continue;
            }
            const want = step ? Math.min(1, (level + 0.06) / COVER7[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp7(cr * s), clamp7(cg * s), clamp7(cb * s));
          }
        }
      }
      for (const [k, ph, rate, b] of stars) {
        const s = b * (0.7 + 0.3 * Math.sin(t * rate + ph));
        if (s < 0.3 || Math.max(R[k], G[k], B[k]) > 0.4)
          continue;
        out[k] = s > 0.95 ? "●" : s > 0.45 ? "•" : "·";
        if (color)
          color[k] = STAR + (s > 0.8 ? 2 : s > 0.55 ? 1 : 0);
      }
      const lines = [];
      for (let r = 0;r < H7; r++)
        lines.push(out.slice(r * W7, (r + 1) * W7).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/marine-drive.ts
  var exports_marine_drive = {};
  __export(exports_marine_drive, {
    default: () => marineDrive,
    meta: () => meta8
  });
  var meta8 = {
    name: "marine drive",
    category: "scenes",
    note: "mumbai's queen's necklace at night, lamps curving round the bay",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#07080f",
    palette: [
      "#18213f",
      "#202c55",
      "#2a396d",
      "#374a88",
      "#4a60a2",
      "#6880bc",
      "#2c2140",
      "#3f2d58",
      "#56396b",
      "#6e4a7a",
      "#8a5f88",
      "#5a2e3c",
      "#7b404c",
      "#9e5858",
      "#55300f",
      "#7d4515",
      "#a95c1b",
      "#d27a24",
      "#ee9631",
      "#ffb246",
      "#ffcd6a",
      "#ffe39c",
      "#fff2cf",
      "#ffffff",
      "#dce6ff",
      "#a9bde8",
      "#6a181b",
      "#b22a28",
      "#ff4b3e",
      "#132c38",
      "#1c3f4f",
      "#2a5868",
      "#29283a",
      "#3c3a4c",
      "#565266",
      "#79738a"
    ]
  };
  var W8 = 200;
  var H8 = 100;
  var HZ4 = 40;
  var TIP = 176;
  var MOON2 = [189, 13];
  var MOON_R = 4.5;
  var MARIA = [[-1.4, -1.2, 1.6], [1.3, 0.8, 1.4], [-0.6, 2, 1.1]];
  var DOTS8 = " ·•●";
  var COVER8 = [0, 0.3, 0.6, 1];
  var BAYER8 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var SODIUM = [1, 0.56, 0.18];
  var SKY2 = 0;
  var WATER = 1;
  var FAR4 = 2;
  var TOWER = 3;
  var FRONT = 4;
  var ROAD = 5;
  var WALL2 = 6;
  var POLE = 7;
  var SHIP = 8;
  function hash8(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise8(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash8(x0, yi), b = hash8(x1, yi), c = hash8(x0, yi + 1), d = hash8(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm8(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise8(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp8 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth8 = (a, b, v) => {
    const k = clamp8((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix8 = (a, b, k) => a + (b - a) * k;
  var hex8 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var shoreF = (x) => 50 + 34 * Math.pow(Math.max(0, 1 - x / TIP), 2.2);
  var scF = (x) => 0.5 + 1.9 * Math.pow(Math.max(0, 1 - x / TIP), 1.5);
  var seaTop = (x) => x <= TIP ? shoreF(x) : Math.max(HZ4, 50 - (x - TIP) * 1.6);
  var wallTopF = (x) => shoreF(x) - Math.max(1, scF(x));
  var roadTopF = (x) => wallTopF(x) - Math.max(1, 1.5 * scF(x));
  var glowF = (x, y) => {
    const over = 0.5 + 0.5 * smooth8(TIP + 24, TIP - 16, x);
    const h = Math.max(0, HZ4 - y);
    return over * (Math.exp(-h / 4) * 0.5 + Math.exp(-h / 12) * 0.12);
  };
  function marineDrive() {
    const P = meta8.palette.map(hex8);
    const N = W8 * H8;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const STEP = 0.25;
    const nU = Math.ceil((TIP + 4) / STEP) + 2;
    const Utab = new Float32Array(nU);
    for (let i = 1;i < nU; i++) {
      const x = (i - 0.5) * STEP;
      const sl = (shoreF(x + 0.05) - shoreF(x - 0.05)) / 0.1;
      Utab[i] = Utab[i - 1] + Math.sqrt(1 + sl * sl) * STEP / scF(x);
    }
    const Uof = (x) => {
      const f = Math.max(0, Math.min(nU - 1.001, x / STEP));
      const i = f | 0;
      return Utab[i] + (Utab[i + 1] - Utab[i]) * (f - i);
    };
    const xOfU = (u) => {
      let lo = 0, hi = TIP;
      for (let i = 0;i < 30; i++) {
        const m = (lo + hi) / 2;
        if (Uof(m) < u)
          lo = m;
        else
          hi = m;
      }
      return (lo + hi) / 2;
    };
    const UEND = Uof(TIP);
    const lamps = [];
    for (let u = 0.6;u < UEND - 0.4; u += 3.75) {
      const lx = xOfU(u), s = scF(lx);
      lamps.push([lx, wallTopF(lx) - 2.4 * s, s]);
    }
    const FLICK = 6;
    const blds = [];
    for (let u = -4;u < UEND; ) {
      const i = blds.length;
      const w = 7 + 7 * hash8(i, 21);
      const tall = Math.round(7 * smooth8(26, 2, u) * (0.6 + 0.4 * hash8(i, 26)));
      blds.push({ u0: u, u1: u + w, floors: 5 + Math.floor(hash8(i, 22) * 4) + tall, tone: 0.75 + 0.5 * hash8(i, 23), crown: hash8(i, 24) > 0.45 });
      u += w + 0.4 + 1.8 * hash8(i, 25);
    }
    const colU = new Float32Array(W8);
    const bldAt = new Int16Array(W8).fill(-1);
    for (let x = 0;x < W8; x++) {
      colU[x] = Uof(x + 0.5);
      if (x + 0.5 > TIP)
        continue;
      for (let i = 0;i < blds.length; i++)
        if (colU[x] >= blds[i].u0 && colU[x] < blds[i].u1)
          bldAt[x] = i;
    }
    const towers = [
      [24, 4.5, 21, 0],
      [97, 2.5, 27, 1],
      [107, 2, 22, 0],
      [118, 3, 30, 0],
      [126, 2, 25, 1],
      [136, 3, 23, 0],
      [142.5, 2, 15, 1],
      [149, 3.5, 27, 0],
      [156, 2.5, 19, 0],
      [162, 3, 12, 1],
      [168.5, 2.5, 21, 0],
      [173, 2, 28, 1]
    ];
    const mat = new Uint8Array(N);
    const sR = new Float32Array(N), sG = new Float32Array(N), sB = new Float32Array(N);
    const flo = new Float32Array(N);
    const lane = new Uint8Array(N);
    const skyGlow = new Float32Array(N);
    const flick = [];
    const beacons = [];
    for (let r = 0;r < H8; r++) {
      for (let x = 0;x < W8; x++) {
        const k = r * W8 + x;
        const xc = x + 0.5, y = r + 0.5;
        if (y >= seaTop(xc)) {
          mat[k] = WATER;
          continue;
        }
        let m = SKY2, cr = 0, cg = 0, cb = 0, fl = 0.15;
        const blk = Math.floor((x + 40 * fbm8(x * 0.02, 5, 2, 0)) / 3);
        const farTop = HZ4 - 0.4 - (0.4 + 5 * hash8(blk, 7) ** 3) * (0.5 + 0.5 * fbm8(x * 0.05, 2, 2, 0));
        if (xc < TIP + 7 && y >= farTop) {
          m = FAR4;
          const g = glowF(xc, HZ4 - 2);
          cr = 0.03 + 0.05 * g, cg = 0.04 + 0.03 * g, cb = 0.08 + 0.02 * g;
          const hl = hash8(x * 3 + 1, r * 7 + 2);
          if (hl < 0.035) {
            const v = 0.25 + 0.45 * hash8(x, r * 5 + 9);
            const cool = hash8(x * 5, r) < 0.3;
            cr += v * (cool ? 0.8 : 1), cg += v * (cool ? 0.85 : 0.7), cb += v * (cool ? 1 : 0.4);
          }
          fl = 0.08;
        }
        for (let ti = 0;ti < towers.length; ti++) {
          const [tx, hw, top, warm] = towers[ti];
          const dx = xc - tx;
          if (Math.abs(dx) > hw || y < top)
            continue;
          m = TOWER;
          cr = 0.015, cg = 0.018, cb = 0.035;
          if (dx > hw - 1)
            cr += 0.04, cg += 0.055, cb += 0.1;
          const g = glowF(xc, y) * 0.2;
          cr += g * 0.42, cg += g * 0.21, cb += g * 0.1;
          const fr = r - top;
          if (fr === 0)
            cr += 0.08, cg += 0.1, cb += 0.16;
          else if (fr > 0 && fr % 2 === 1 && Math.abs(dx) < hw - 0.5) {
            const seg3 = Math.floor((xc - tx + hw) / 3);
            const h = hash8(ti * 17 + seg3, r * 13 + 3);
            if (h < 0.5) {
              const v = 0.4 + 0.3 * hash8(ti * 7 + seg3, r);
              const cool = warm ? h < 0.1 : h > 0.1;
              cr += v * (cool ? 0.72 : 1), cg += v * (cool ? 0.84 : 0.72), cb += v * (cool ? 1 : 0.42);
            }
          }
          if (fr === 0 && Math.abs(dx) < 0.6 && top < 20)
            beacons.push([k - W8, ti * 1.7]);
          fl = 0.03;
        }
        if (xc <= TIP) {
          const s = scF(xc), wt = wallTopF(xc), rt = roadTopF(xc);
          const bi = bldAt[x];
          if (bi >= 0 && y < rt) {
            const b = blds[bi];
            const uu = colU[x] - b.u0, bw = b.u1 - b.u0;
            const f = (rt - y) / s;
            let hgt = b.floors * 1.7 + 1.1;
            if (b.crown && uu > bw * 0.32 && uu < bw * 0.68)
              hgt += 1.6;
            if (f < hgt) {
              m = FRONT;
              const edge = uu < 0.5 || uu > bw - 0.5;
              const t0 = b.tone * (edge ? 1.35 : 1);
              cr = 0.03 * t0, cg = 0.035 * t0, cb = 0.06 * t0;
              const up = Math.exp(-f / 2) * 0.16;
              cr += up * SODIUM[0], cg += up * SODIUM[1], cb += up * SODIUM[2];
              if (f > hgt - 0.6 / s || f > b.floors * 1.7 + 0.6 && f < b.floors * 1.7 + 0.6 + 0.5 / s)
                cr += 0.1, cg += 0.13, cb += 0.22;
              if (uu > bw - 0.7 / s - 0.2)
                cr += 0.04, cg += 0.06, cb += 0.12;
              const fi = Math.floor((f - 0.9) / 1.7);
              const ff = f - 0.9 - fi * 1.7;
              const col = Math.floor((uu - 0.3) / 1.5);
              const cu = uu - 0.3 - col * 1.5;
              const fine = s * 1.7 >= 2.6;
              const inWin = fi >= 0 && fi < b.floors && uu > 0.7 && uu < bw - 0.7 && (fine ? ff > 0.45 && ff < 1.35 && cu > 0.35 && cu < 1.15 : true);
              if (inWin && !fine) {
                const v = 0.04 + 0.26 * hash8(bi * 13 + Math.floor(uu / 3.2), fi * 7 + 1) ** 2;
                cr += v, cg += v * 0.8, cb += v * 0.55;
                if (hash8(x * 7 + 3, r * 11) < 0.035)
                  cr += 0.4, cg += 0.36, cb += 0.28;
              } else if (inWin) {
                const h = hash8(bi * 97 + col, fi * 31 + 5);
                const lit = h < (fine ? 0.3 : 0.2);
                if (lit) {
                  const v = (0.35 + 0.3 * hash8(bi * 13 + col, fi)) * (fine ? 1 : 0.7);
                  const kind = hash8(bi * 7 + col, fi * 3 + 1);
                  let wr = 1, wg = 0.84, wb = 0.58;
                  if (kind < 0.25)
                    wr = 0.82, wg = 0.9, wb = 1;
                  cr += v * wr, cg += v * wg, cb += v * wb;
                  const fk = hash8(bi * 5 + col, fi * 11 + 7);
                  if (fk < 0.07)
                    flick.push([k, v * wr, v * wg, v * wb, fk < 0.025 ? 1 : 0, 0.3 + fk * 9, fk * 400]);
                } else if (fine) {
                  cr *= 0.7, cg *= 0.7, cb *= 0.8;
                }
              }
              fl = 0.03;
            }
          }
          if (y >= rt && y < wt) {
            m = ROAD;
            cr = 0.07, cg = 0.05, cb = 0.05;
            fl = 0.1;
            const lf = (y - rt) / (wt - rt);
            lane[k] = wt - rt < 1.8 ? 3 : lf < 0.5 ? 1 : 2;
          } else if (y >= wt) {
            m = WALL2;
            cr = 0.1, cg = 0.09, cb = 0.1;
            fl = 0.1;
          }
          for (const [lx, ly, ls] of lamps) {
            if (ls > 1.15 && Math.abs(xc - lx) < 0.5 && y > ly && y < wt)
              m = POLE, cr = 0.09, cg = 0.08, cb = 0.09, fl = 0.1;
          }
        }
        if (m === SKY2) {
          const v = y / HZ4;
          const g = glowF(xc, y) * (1 + 0.6 * smooth8(84, 98, xc) * smooth8(186, 174, xc)) + 0.2 * Math.exp(-Math.max(0, HZ4 - y) / 14) * smooth8(84, 104, xc) * smooth8(188, 172, xc);
          const veil = 0.88 + 0.24 * fbm8(x * 0.05, r * 0.08, 3, 0);
          const vv = Math.pow(v, 1.4);
          cr = (0.03 + 0.07 * vv) * veil + g * 0.42;
          cg = (0.05 + 0.12 * vv) * veil + g * 0.22;
          cb = (0.15 + 0.24 * vv) * veil + g * 0.1;
          const hzn = Math.exp(-Math.max(0, HZ4 - y) / 3.5) * smooth8(172, 186, xc) * 0.16;
          cr += hzn * 0.6, cg += hzn * 0.7, cb += hzn * 0.95;
          const dmx = xc - MOON2[0], dmy = y - MOON2[1];
          const dm = Math.sqrt(dmx * dmx + dmy * dmy);
          const halo = Math.exp(-dm / 22) * 0.13 + Math.exp(-dm / 6) * 0.26;
          cr += halo * 0.9, cg += halo * 0.86, cb += halo * 0.8;
          const ring = 0.03 * smooth8(4.6, 5.6, dm) * smooth8(8.5, 6.5, dm);
          cr -= ring, cg -= ring, cb -= ring * 0.8;
          if (dm < MOON_R) {
            let face = 0.9 + 0.1 * fbm8(x * 0.6, r * 0.6, 2, 0);
            for (const [mx, my, mr] of MARIA) {
              const d2 = ((dmx - mx) ** 2 + (dmy - my) ** 2) / (mr * mr);
              if (d2 < 1)
                face -= 0.14 * (1 - d2);
            }
            const a = smooth8(MOON_R, MOON_R - 0.8, dm);
            cr = mix8(cr, face, a), cg = mix8(cg, face * 0.95, a), cb = mix8(cb, face * 0.86, a);
          }
          skyGlow[k] = g;
        }
        mat[k] = m;
        sR[k] = cr, sG[k] = cg, sB[k] = cb, flo[k] = fl;
      }
    }
    const shipLights = [
      [184, 35, 1, 1, 1],
      [190, 34, 1, 1, 1],
      [185, 37, 1, 0.78, 0.45],
      [187, 37, 1, 0.8, 0.5],
      [189, 36, 1, 0.82, 0.5],
      [191, 36, 1, 0.8, 0.5],
      [197, 36, 1, 1, 1],
      [196, 38, 1, 0.78, 0.45],
      [199, 38, 0.95, 0.22, 0.18]
    ];
    const hull = (x, r) => r >= 38 && x >= 182 && x <= 192 || r === 37 && x >= 183 && x <= 192 || r >= 35 && r <= 36 && x >= 189 && x <= 191 || r >= 35 && r <= 36 && x === 184 || r >= 38 && x >= 195 && x <= 199 || r === 37 && x >= 196 && x <= 197;
    for (let r = 34;r < 40; r++) {
      for (let x = 180;x < W8; x++) {
        if (!hull(x, r))
          continue;
        const k = r * W8 + x;
        mat[k] = SHIP, sR[k] = 0.002, sG[k] = 0.002, sB[k] = 0.004, flo[k] = 0;
      }
    }
    for (const [x, r, cr, cg, cb] of shipLights) {
      const k = r * W8 + x;
      mat[k] = SHIP, sR[k] = cr, sG[k] = cg, sB[k] = cb, flo[k] = 0.1;
    }
    const lampI = new Float32Array(N);
    const lampW = new Float32Array(N);
    const flickI = new Float32Array(N);
    const flickW = new Float32Array(N);
    const refl = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
    const reflFl = new Float32Array(N);
    lamps.forEach(([lx, ly, s], j) => {
      const core = 0.34 + 0.3 * s, halo = 0.4 + 0.4 * s, spill = 1.2 + 1.5 * s;
      const R = Math.ceil(spill * 3.2);
      const into = j === FLICK ? flickI : lampI;
      const hot = j === FLICK ? flickW : lampW;
      for (let r = Math.max(0, Math.floor(ly - R));r < Math.min(H8, ly + R); r++) {
        for (let x = Math.max(0, Math.floor(lx - R));x < Math.min(W8, lx + R); x++) {
          const k = r * W8 + x;
          if (mat[k] === WATER)
            continue;
          const dx = x + 0.5 - lx, dy = r + 0.5 - ly;
          const d = Math.sqrt(dx * dx + dy * dy);
          const c = Math.exp(-((d / core) ** 2)) * 2.2;
          into[k] += c * 0.7 + Math.exp(-d / halo) * 0.24 + Math.exp(-d / spill) * 0.02;
          hot[k] += c * 0.3;
        }
      }
      const sy = shoreF(lx);
      const wj = 0.4 + 0.7 * s, len = 2 + 8 * s;
      for (let r = Math.floor(sy);r < H8; r++) {
        const dy = r + 0.5 - sy;
        if (dy < 0)
          continue;
        const a = Math.exp(-dy / (len * 1.7)) * (0.3 + 0.15 * s) * smooth8(-0.5, 1.5, dy);
        if (a < 0.004)
          break;
        for (let x = Math.max(0, Math.floor(lx - 3 * wj - 1));x < Math.min(W8, lx + 3 * wj + 1); x++) {
          const k = r * W8 + x;
          if (mat[k] !== WATER)
            continue;
          const g = a * Math.exp(-(((x + 0.5 - lx) / wj) ** 2));
          if (j === FLICK)
            reflFl[k] += g;
          else
            refl[0][k] += g * SODIUM[0], refl[1][k] += g * SODIUM[1], refl[2][k] += g * SODIUM[2];
        }
      }
    });
    for (let k = 0;k < N; k++) {
      const m = mat[k];
      if (m === WATER || m === SKY2)
        continue;
      sR[k] += lampI[k] * SODIUM[0] + lampW[k], sG[k] += lampI[k] * SODIUM[1] + lampW[k] * 0.95, sB[k] += lampI[k] * SODIUM[2] + lampW[k] * 0.8;
    }
    for (const [x, r0, cr, cg, cb] of shipLights) {
      for (let r = HZ4;r < HZ4 + 14; r++) {
        const a = Math.exp(-(r - HZ4) / 5) * 0.35;
        for (let dx = -1;dx <= 1; dx++) {
          const k = r * W8 + x + dx;
          if (x + dx >= W8 || mat[k] !== WATER)
            continue;
          const g = a * Math.exp(-dx * dx * 2.5);
          refl[0][k] += g * cr, refl[1][k] += g * cg, refl[2][k] += g * cb;
        }
      }
    }
    for (let r = 0;r < H8; r++) {
      for (let x = 0;x < W8; x++) {
        const k = r * W8 + x;
        if (mat[k] !== WATER)
          continue;
        const sy = seaTop(x + 0.5), d = r + 0.5 - sy;
        let ar = 0, ag = 0, ab = 0, n = 0;
        for (let o = 0;o < 3; o++) {
          const ym = Math.floor(sy - d * 0.55 - 0.3 - o * 0.7);
          if (ym < 0)
            continue;
          const q = ym * W8 + x;
          if (mat[q] === WATER)
            continue;
          n++;
          if (mat[q] === SKY2)
            ar += sR[q], ag += sG[q], ab += sB[q];
          else if (mat[q] === TOWER || mat[q] === SHIP)
            ar += Math.max(0, sR[q] - 0.25) * 0.6, ag += Math.max(0, sG[q] - 0.25) * 0.6, ab += Math.max(0, sB[q] - 0.25) * 0.6;
        }
        const a = 0.32 * Math.exp(-d / 30);
        if (n)
          refl[0][k] += ar / n * a, refl[1][k] += ag / n * a, refl[2][k] += ab / n * a;
        if (x + 0.5 <= TIP + 4) {
          const sh = 0.025 * Math.exp(-d / 5) * smooth8(TIP + 4, TIP - 6, x + 0.5);
          refl[0][k] += sh * SODIUM[0], refl[1][k] += sh * SODIUM[1], refl[2][k] += sh * SODIUM[2];
        }
      }
    }
    const CW = 800;
    const cover = new Float32Array(CW * HZ4);
    const clit = new Float32Array(CW * HZ4);
    const density = (x, y) => {
      const q = fbm8(x * 0.01, y * 0.05, 3, 8);
      const d = fbm8(x * 0.025 + q * 2.6, y * 0.07 + q * 1.3, 5, 20);
      const yb = y + 14 * (fbm8(x * 0.005 + 3, 7, 2, 4) - 0.5);
      return d + 0.05 * smooth8(2, 14, yb) - 0.1 * smooth8(6, 0, y) - 0.1 * smooth8(22, HZ4 - 4, yb);
    };
    for (let r = 0;r < HZ4; r++) {
      for (let x = 0;x < CW; x++) {
        const y = r + 0.5;
        const d = density(x, y);
        cover[r * CW + x] = smooth8(0.47, 0.62, d) * 0.9;
        clit[r * CW + x] = clamp8(0.5 + (d - density(x - 1, y + 2.5)) * 9 - (d - 0.6) * 1.4);
      }
    }
    const clear = new Float32Array(N);
    for (let k = 0;k < N; k++) {
      const x = k % W8 + 0.5, y = Math.floor(k / W8) + 0.5;
      clear[k] = 1 - 0.9 * smooth8(84, 96, x) * smooth8(186, 176, x) * smooth8(20, 28, y);
    }
    const BIN = 0.2;
    const U0 = -6, NB = Math.ceil((UEND + 12) / BIN);
    const laneA = new Float32Array(NB), laneB = new Float32Array(NB);
    const cars = [];
    for (let i = 0;i < 26; i++)
      cars.push([hash8(i, 51) * (UEND + 12), 4.2 + 1.6 * hash8(i, 52), i & 1]);
    const binLo = new Int32Array(W8), binHi = new Int32Array(W8);
    for (let x = 0;x < W8; x++) {
      binLo[x] = Math.max(0, Math.floor((Uof(x) - U0) / BIN));
      binHi[x] = Math.min(NB - 1, Math.max(binLo[x], Math.floor((Uof(x + 1) - U0) / BIN)));
    }
    const colA = new Float32Array(W8), colB = new Float32Array(W8);
    return (t, { color } = {}) => {
      const drift = t * 1.3;
      laneA.fill(0), laneB.fill(0);
      const span = UEND + 12;
      for (const [p0, v, dir] of cars) {
        const p = ((p0 + (dir ? -v : v) * t) % span + span) % span;
        const into = dir ? laneB : laneA;
        const head = Math.floor(p / BIN);
        for (let i = 0;i < 26; i++) {
          const b = dir ? head + i : head - i;
          if (b < 0 || b >= NB)
            continue;
          const e = Math.exp(-i / 7) * (i < 2 ? 1.3 : 0.85);
          if (e > into[b])
            into[b] = e;
        }
      }
      for (let x = 0;x < W8; x++) {
        let a = 0, b = 0;
        for (let i = binLo[x];i <= binHi[x]; i++)
          a = Math.max(a, laneA[i]), b = Math.max(b, laneB[i]);
        colA[x] = a, colB[x] = b;
      }
      const sputter = Math.sin(t * 0.7) > 0.45;
      const lampOn = sputter ? hash8(Math.floor(t * 9), 77) > 0.45 ? 1 : 0.15 : 1;
      for (let r = 0;r < H8; r++) {
        const y = r + 0.5;
        for (let x = 0;x < W8; x++) {
          const k = r * W8 + x;
          const m = mat[k];
          let cr = sR[k], cg = sG[k], cb = sB[k], floor = flo[k], fade = 1;
          if (m === SKY2) {
            const sx = x + drift, ix = Math.floor(sx), fx = sx - ix;
            const i0 = r * CW + ix % CW, i1 = r * CW + (ix + 1) % CW;
            const c = (cover[i0] + (cover[i1] - cover[i0]) * fx) * clear[k];
            if (c > 0.01) {
              const l = clit[i0] + (clit[i1] - clit[i0]) * fx;
              const g = skyGlow[k];
              const dmx = x + 0.5 - MOON2[0], dmy = y - MOON2[1];
              const dm = Math.sqrt(dmx * dmx + dmy * dmy);
              const near = Math.exp(-dm / 16);
              const b = clamp8(0.1 + l * (0.42 + 0.9 * g + 0.5 * near));
              const kr = b < 0.5 ? mix8(0.05, 0.22, b * 2) : mix8(0.22, 0.9, b * 2 - 1);
              const kg = b < 0.5 ? mix8(0.06, 0.26, b * 2) : mix8(0.26, 0.88, b * 2 - 1);
              const kb = b < 0.5 ? mix8(0.15, 0.44, b * 2) : mix8(0.44, 0.92, b * 2 - 1);
              const a = Math.min(1, c * 1.1) * smooth8(MOON_R, MOON_R + 4, dm) * (1 - 0.8 * smooth8(27, 37, y));
              cr = mix8(cr, kr, a), cg = mix8(cg, kg, a), cb = mix8(cb, kb, a);
            } else if (y < HZ4 - 14 && hash8(x, r * 3 + 11) > 0.993) {
              const tw = 0.3 + 0.2 * Math.sin(t * (1.3 + hash8(x, r) * 2.5) + hash8(r, x) * 6.28);
              cr = Math.max(cr, tw * 0.9), cg = Math.max(cg, tw * 0.9), cb = Math.max(cb, tw);
            }
            const li = lampI[k], lw = lampW[k];
            cr += li * SODIUM[0] + lw, cg += li * SODIUM[1] + lw * 0.95, cb += li * SODIUM[2] + lw * 0.8;
            floor = 0.14;
          } else if (m === WATER) {
            const v = (y - HZ4) / (H8 - HZ4);
            const w = 0.6 * noise8(x * 0.06 + t * 0.1, y * 0.5 - t * 0.5, 0) + 0.4 * noise8(x * 0.18 - t * 0.2, y * 1 - t * 1, 0);
            const swell = 0.45 + 0.95 * w;
            const open = 0.85 + 0.3 * (x / W8);
            cr = (0.05 - 0.01 * v) * swell * open, cg = (0.095 - 0.015 * v) * swell * open, cb = (0.23 - 0.03 * v) * swell * open;
            {
              const road = Math.exp(-(((x + 0.5 - MOON2[0]) / (0.8 + (y - HZ4) * 0.12)) ** 2));
              const glint = smooth8(0.52, 0.8, 0.45 * w + 0.55 * noise8(x * 0.3 + t * 0.3, y * 1.4 - t * 1.4, 0)) * road;
              cr += 0.9 * glint + 0.03 * road, cg += 0.88 * glint + 0.035 * road, cb += 0.8 * glint + 0.05 * road;
            }
            const wob = (noise8(x * 0.05 + 7, y * 0.32 - t * 0.7, 0) - 0.5) * (1.4 + 4.5 * v);
            let sx = x + wob;
            if (sx < 0)
              sx = 0;
            if (sx > W8 - 1.001)
              sx = W8 - 1.001;
            const i0 = r * W8 + (sx | 0), fx = sx - (sx | 0);
            const dash = 0.45 + 0.9 * smooth8(0.2, 0.55, noise8(x * 0.16 + 3, y * 0.85 - t * 1.3, 0));
            const ref = (a) => (a[i0] + (a[i0 + 1] - a[i0]) * fx) * dash;
            const fl = ref(reflFl) * lampOn;
            const rr = ref(refl[0]) + fl * SODIUM[0], rg = ref(refl[1]) + fl * SODIUM[1], rb = ref(refl[2]) + fl * SODIUM[2];
            const kill = 1 - 0.9 * clamp8((rr - rb) * 3);
            cr = cr * kill + rr, cg = cg * kill + rg, cb = cb * kill + rb;
            floor = 0.16;
            fade = smooth8(H8 + 6, H8 - 8, y);
          } else if (m === ROAD) {
            const L = lane[k];
            const a = L & 1 ? colA[x] : 0, b = L & 2 ? colB[x] : 0;
            cr += a * 0.8 + b * 1, cg += a * 0.1 + b * 0.9, cb += a * 0.08 + b * 0.72;
          }
          if (m !== WATER) {
            const f = flickI[k] * lampOn, fw = flickW[k] * lampOn;
            if (f)
              cr += f * SODIUM[0] + fw, cg += f * SODIUM[1] + fw * 0.95, cb += f * SODIUM[2] + fw * 0.8;
          }
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp8(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95) * fade;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER8[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS8[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER8[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp8(cr * s), clamp8(cg * s), clamp8(cb * s));
          }
        }
      }
      for (const [k, wr, wg, wb, kind, rate, ph] of flick) {
        if (kind) {
          const f = 0.5 + 0.5 * Math.sin(t * 11 + ph) * Math.sin(t * 4.3 + ph * 2);
          paint(k, sR[k] - wr + f * wr * 0.45, sG[k] - wg + f * wr * 0.6, sB[k] - wb + f * wr, 0.08, color);
        } else {
          const f = Math.sin(t * rate * 0.5 + ph) > -0.6 ? 1 : 0;
          paint(k, sR[k] - wr * (1 - f), sG[k] - wg * (1 - f), sB[k] - wb * (1 - f), 0.08, color);
        }
      }
      for (const [k, ph] of beacons) {
        if (k < 0)
          continue;
        const on = Math.sin(t * 2.4 + ph) > 0.3;
        paint(k, on ? 1 : 0.3, on ? 0.2 : 0.06, on ? 0.15 : 0.05, 0.1, color);
      }
      const lines = [];
      for (let r = 0;r < H8; r++)
        lines.push(out.slice(r * W8, (r + 1) * W8).join(""));
      return lines.join(`
`);
    };
    function paint(k, cr, cg, cb, floor, color) {
      cr = Math.max(0, cr), cg = Math.max(0, cg), cb = Math.max(0, cb);
      const r = k / W8 | 0, x = k % W8;
      const peak = Math.max(cr, cg, cb, 0.0001);
      const level = clamp8(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95);
      const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER8[(r & 3) * 4 + (x & 3)])));
      out[k] = DOTS8[step];
      if (color) {
        const want = step ? Math.min(1, (level + 0.06) / COVER8[step]) : 0;
        const s = (0.3 + 0.7 * want) / peak;
        color[k] = nearest(clamp8(cr * s), clamp8(cg * s), clamp8(cb * s));
      }
    }
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/misty-forest.ts
  var exports_misty_forest = {};
  __export(exports_misty_forest, {
    default: () => mistyForest,
    meta: () => meta9
  });
  var meta9 = {
    name: "misty forest",
    category: "scenes",
    note: "pine ridges fading into morning fog, sunbeams slanting through",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#090f0e",
    palette: [
      "#fffbea",
      "#fff0c8",
      "#fbe2a6",
      "#f2c97e",
      "#e0a95e",
      "#b9834a",
      "#e4ebe6",
      "#cbe0dc",
      "#a8d2d0",
      "#86c0c2",
      "#68a7ac",
      "#4f8c93",
      "#3b7078",
      "#557570",
      "#456761",
      "#365952",
      "#2a4a44",
      "#1f3c37",
      "#172f2b",
      "#11231f",
      "#a4a35a",
      "#8a8f4c",
      "#6d7440",
      "#4d5530",
      "#7a5a3a",
      "#5b4532",
      "#a9c3cc",
      "#8eadb8",
      "#6f93a2",
      "#53798a",
      "#3d6172",
      "#2b4a5a"
    ]
  };
  var W9 = 200;
  var H9 = 100;
  var SUN3 = [146, 45.5];
  var SUN_R = 3.4;
  var DOTS9 = " ·•●";
  var COVER9 = [0, 0.3, 0.6, 1];
  var BAYER9 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var SKY3 = -1;
  var FLOOR = 5;
  var GIANT = 6;
  function hash9(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise9(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash9(x0, yi), b = hash9(x1, yi), c = hash9(x0, yi + 1), d = hash9(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm9(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise9(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp9 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth9 = (a, b, v) => {
    const k = clamp9((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix9 = (a, b, k) => a + (b - a) * k;
  var hex9 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var LAYERS = [
    [50, 6, 1.6, 1, 2.5, 0.48, 0.8, 1, 0.14, 0.6],
    [59, 6, 2, 3, 5.5, 0.3, 1.3, 0.8, 0.16, 0.8],
    [69, 7, 2.6, 4, 7, 0.13, 2, 0.66, 0.18, 0.9],
    [80, 6, 3.4, 5, 9, 0.03, 2.8, 0.44, 0.14, 1],
    [90, 1.5, 10, 9, 24, 0.03, 3.4, 0, 0.08, 0.6]
  ];
  var NEAR2 = LAYERS.length - 1;
  function mistyForest() {
    const P = meta9.palette.map(hex9);
    const N = W9 * H9;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const fogR = (s) => mix9(0.7, 1.05, s), fogG = (s) => mix9(0.92, 0.92, s), fogB = (s) => mix9(0.9, 0.6, s);
    const layer = new Int8Array(N).fill(SKY3);
    const edge = new Float32Array(N);
    const below = new Float32Array(N);
    const tex = new Float32Array(N);
    const ground = new Float32Array(N);
    LAYERS.forEach(([Y, amp, gap, h0, h1], i) => {
      const ridge2 = (x) => Y + amp * (fbm9(x * (0.018 + i * 0.003), i * 13 + 2, 3, 0) - 0.5) * (i < 3 ? 4 : 3) + (i > 0 && i < NEAR2 ? (2 + i * 2) * Math.exp(-(((x - SUN3[0] - 4) / 38) ** 2)) : 0);
      const base = Float32Array.from({ length: W9 }, (_, x) => ridge2(x));
      const fill = new Uint8Array(N);
      const spire = new Uint8Array(N);
      for (let x = 0;x < W9; x++)
        for (let r = Math.max(0, Math.floor(ridge2(x)));r < H9; r++)
          fill[r * W9 + x] = 1;
      for (let tx = -2 + hash9(i, 1) * gap;tx < W9 + 2; tx += gap * (0.7 + hash9(tx | 0, i + 3) * 0.7)) {
        if (i === NEAR2 && tx > 92 && tx < 140)
          continue;
        const th = h0 + (h1 - h0) * hash9(tx * 7 | 0, i + 5);
        const tip = ridge2(tx) - th;
        const tier = 2 + th * 0.12;
        for (let r = Math.max(0, Math.floor(tip));r < Math.min(H9, ridge2(tx) + 2); r++) {
          const d = r + 0.5 - tip;
          if (d < 0)
            continue;
          const saw = d % tier / tier;
          const half = d * 0.3 * (0.6 + 0.5 * saw) + 0.35;
          for (let x = Math.max(0, Math.floor(tx - half));x <= Math.min(W9 - 1, Math.ceil(tx + half)); x++) {
            const dx = Math.abs(x + 0.5 - tx);
            if (dx > half)
              continue;
            const k = r * W9 + x;
            fill[k] = spire[k] = 1;
            if (i === NEAR2)
              tex[k] = smooth9(0.62, 0.95, saw) * smooth9(0.3, 0.85, dx / half) * (0.55 + 0.45 * hash9(x, r * 5));
          }
        }
      }
      const top = new Float32Array(W9).fill(H9);
      for (let x = 0;x < W9; x++)
        for (let r = 0;r < H9; r++)
          if (fill[r * W9 + x]) {
            top[x] = r;
            break;
          }
      const line = top.map((_, x) => {
        let s = 0;
        for (let d = -3;d <= 3; d++)
          s += top[Math.min(W9 - 1, Math.max(0, x + d))];
        return Math.max(s / 7, top[x]);
      });
      const open = (xx, rr) => xx >= 0 && xx < W9 && (rr < 0 || !fill[rr * W9 + xx]);
      for (let r = 0;r < H9; r++)
        for (let x = 0;x < W9; x++) {
          const k = r * W9 + x;
          if (!fill[k])
            continue;
          layer[k] = i === NEAR2 && !spire[k] ? FLOOR : i;
          if (i !== NEAR2)
            tex[k] = 0;
          below[k] = r + 0.5 - line[x];
          ground[k] = base[x];
          const toward = x < SUN3[0] ? 1 : -1;
          edge[k] = open(x + toward, r) || open(x, r - 1) ? 1 : open(x + 2 * toward, r) ? 0.5 : 0;
        }
    });
    const giant = new Uint8Array(N);
    for (const [gx, tip, spread, tier] of [[9, -12, 15, 7], [192, 12, 7, 5]]) {
      for (let r = Math.max(0, Math.floor(tip));r < H9; r++) {
        const d = r + 0.5 - tip;
        const saw = d % tier / tier;
        const half = Math.min(spread * (0.5 + 0.5 * saw), d * 0.34 * (0.45 + 0.7 * saw) + 0.5);
        for (let x = Math.max(0, Math.floor(gx - half));x <= Math.min(W9 - 1, Math.ceil(gx + half)); x++) {
          const dx = Math.abs(x + 0.5 - gx);
          const outer = (x + 0.5 - gx) * (gx - W9 / 2) > 0 ? 1.6 : 1;
          const ragged = half * outer * (0.82 + 0.3 * noise9(x * 0.5, r * 0.4, 0));
          if (dx <= ragged || dx < 0.9) {
            const k = r * W9 + x;
            giant[k] = 1;
            tex[k] = smooth9(0.66, 0.96, saw) * smooth9(0.25, 0.8, dx / ragged) * (0.5 + 0.5 * hash9(x * 3, r));
          }
        }
      }
    }
    for (let k = 0;k < N; k++)
      if (giant[k])
        layer[k] = GIANT, below[k] = 0;
    {
      const open = (x, r) => x >= 0 && x < W9 && (r < 0 || !giant[r * W9 + x]);
      for (let r = 0;r < H9; r++)
        for (let x = 0;x < W9; x++) {
          const k = r * W9 + x;
          if (!giant[k])
            continue;
          const tx = x < SUN3[0] ? 1 : -1;
          edge[k] = open(x + tx, r) || open(x, r - 1) ? 1 : open(x + 2 * tx, r) ? 0.6 : 0;
        }
    }
    const sr = new Float32Array(N), sg = new Float32Array(N), sb = new Float32Array(N);
    const fogAmt = new Float32Array(N);
    const fogSpeed = new Float32Array(N);
    const rayAmt = new Float32Array(N);
    const sunS = new Float32Array(N);
    const floorLit = new Float32Array(N);
    const lift = new Float32Array(N);
    const cloudAmt = new Float32Array(N);
    const abin = new Float32Array(N), dist = new Float32Array(N);
    const RA = 720;
    for (let r = 0;r < H9; r++)
      for (let x = 0;x < W9; x++) {
        const k = r * W9 + x;
        const y = r + 0.5;
        const L = layer[k];
        const dx = x + 0.5 - SUN3[0], dy = y - SUN3[1];
        const ang = Math.atan2(dy, dx);
        abin[k] = (ang / (Math.PI * 2) * RA + RA) % RA;
        const d = dist[k] = Math.sqrt(dx * dx + dy * dy);
        const s = sunS[k] = Math.exp(-Math.sqrt(dx * dx + dy * dy * 1.96) / 30);
        const bloom = Math.exp(-d / 16) * 0.25 + Math.exp(-d / 6) * 0.1;
        let cr, cg, cb, ray;
        if (L === SKY3) {
          const v = clamp9(y / 52);
          const p = Math.pow(v, 1.6);
          const veil = 0.95 + 0.1 * fbm9(x * 0.04, y * 0.08, 3, 0);
          cr = mix9(0.065, 0.36, p) * veil, cg = mix9(0.14, 0.58, p) * veil, cb = mix9(0.17, 0.62, p) * veil;
          const band = 0.75 * smooth9(28, 50, y) * (0.55 + 0.75 * fbm9(x * 0.025, y * 0.16, 3, 0));
          cr = mix9(cr, fogR(0), band), cg = mix9(cg, fogG(0), band), cb = mix9(cb, fogB(0), band);
          const kw = s * 0.55, kb = 0.5 + 0.5 * Math.exp(-d / 9);
          cr = mix9(cr, fogR(s) * kb, kw), cg = mix9(cg, fogG(s) * kb, kw), cb = mix9(cb, fogB(s) * kb, kw);
          const glow = Math.exp(-d / 3) * 0.3 + Math.exp(-d / 10) * 0.18;
          cr += glow + bloom, cg += glow * 0.9 + bloom * 0.78, cb += glow * 0.66 + bloom * 0.45;
          const disc = smooth9(SUN_R + 0.6, SUN_R - 0.4, d);
          cr = mix9(cr, 1.3, disc), cg = mix9(cg, 1.24, disc), cb = mix9(cb, 1.08, disc);
          fogAmt[k] = 0.3 * smooth9(30, 50, y);
          fogSpeed[k] = 0.4;
          cloudAmt[k] = 0.75 * smooth9(5, 15, y) * smooth9(44, 28, y) * smooth9(SUN_R + 2, SUN_R + 8, d);
          ray = 0.35 * smooth9(26, 46, y);
          lift[k] = 0.04;
        } else if (L <= NEAR2 - 1) {
          const [, , , , , haze, speed, M, drift, beam] = LAYERS[L];
          const pool = smooth9(2.5, 8 + L * 1.5, below[k]) * smooth9(20, 11, below[k]);
          const sheet = Math.exp(-(((y - (ground[k] + 5)) / 3) ** 2)) * (0.75 + 0.5 * fbm9(x * 0.035, L * 7.3, 3, 0));
          const mist = clamp9(Math.max(pool * 0.5, sheet) * M);
          const h = clamp9(haze + (1 - haze) * mist);
          const veil = 0.9 + 0.2 * fbm9(x * 0.06, y * 0.12, 3, 0);
          const pr = 0.02, pg = 0.075, pb = 0.07;
          cr = mix9(pr, fogR(s) * veil, h), cg = mix9(pg, fogG(s) * veil, h), cb = mix9(pb, fogB(s) * veil, h);
          cr += bloom * h, cg += bloom * 0.78 * h, cb += bloom * 0.45 * h;
          const rim = edge[k] * s * (0.2 + 0.6 * (1 - haze));
          cr += rim * 0.95, cg += rim * 0.8, cb += rim * 0.45;
          fogAmt[k] = drift;
          fogSpeed[k] = speed;
          ray = beam * (L < 3 ? 0.45 + 0.55 * clamp9(mist / M) : 0.25 + 0.75 * clamp9(mist / M));
          lift[k] = 0.03;
        } else if (L === NEAR2) {
          const g = tex[k] * 0.12;
          cr = 0.001 + g * 0.35, cg = 0.004 + g, cb = 0.004 + g * 0.9;
          const rim = edge[k] * (0.12 + 0.6 * s);
          cr += rim * 0.9, cg += rim * 0.7, cb += rim * 0.38;
          fogAmt[k] = LAYERS[L][8];
          fogSpeed[k] = LAYERS[L][6];
          ray = 0.12;
          lift[k] = 0;
        } else if (L === FLOOR) {
          const clump = smooth9(0.42, 0.72, fbm9(x * 0.09, y * 0.4, 3, 0));
          const speck = hash9(x * 7, r * 11) > 0.55 ? 1 : 0.35;
          const m = (0.06 + 0.3 * clump) * speck * smooth9(H9 + 2, H9 - 8, y);
          cr = 0.02 + m * 0.6, cg = 0.03 + m * 0.62, cb = 0.02 + m * 0.3;
          fogAmt[k] = 0.06;
          fogSpeed[k] = 3.4;
          ray = 0;
          floorLit[k] = smooth9(0.32, 0.56, fbm9(x * 0.06 + 3, y * 0.24, 3, 0)) * smooth9(H9 + 3, H9 - 6, y);
          lift[k] = 0;
        } else {
          const g = tex[k] * 0.15;
          cr = 0.001 + g * 0.35, cg = 0.004 + g, cb = 0.004 + g * 0.9;
          const warm = Math.exp(-d / 50);
          const rim = edge[k] * (0.13 + 0.55 * warm);
          cr += rim * mix9(0.4, 0.95, warm), cg += rim * mix9(0.75, 0.66, warm), cb += rim * mix9(0.72, 0.32, warm);
          fogAmt[k] = 0.04;
          fogSpeed[k] = 4;
          ray = 0.04;
          lift[k] = 0;
        }
        ray *= 0.2 + 0.8 * smooth9(1.25, 1.75, ang) * smooth9(3.1, 2.6, ang);
        rayAmt[k] = ray;
        sr[k] = cr, sg[k] = cg, sb[k] = cb;
      }
    const FW = 400;
    const fog = new Float32Array(FW * H9);
    for (let r = 0;r < H9; r++)
      for (let u = 0;u < FW; u++)
        fog[r * FW + u] = smooth9(0.42, 0.75, fbm9(u * 0.022, r * 0.09, 4, FW * 0.022));
    const CH = 46;
    const cloud = new Float32Array(FW * CH);
    for (let r = 0;r < CH; r++)
      for (let u = 0;u < FW; u++) {
        const q = fbm9(u * 0.01, r * 0.05, 2, FW * 0.01);
        cloud[r * FW + u] = smooth9(0.44, 0.68, fbm9(u * 0.016 + q * 1.5, r * 0.17, 4, FW * 0.016));
      }
    const SHAFTS = [[1.42, 0.05, 0.7], [1.66, 0.07, 1], [1.93, 0.05, 0.8], [2.18, 0.08, 1], [2.45, 0.05, 0.75], [2.7, 0.06, 0.9], [2.95, 0.04, 0.6]];
    const rayA = new Float32Array(RA), rayB = new Float32Array(RA);
    for (let i = 0;i < RA; i++) {
      const a = i / RA * Math.PI * 2;
      let v = 0;
      for (const [c, w, st] of SHAFTS)
        v = Math.max(v, st * smooth9(w, w * 0.35, Math.abs(a - c)));
      rayA[i] = v * (0.8 + 0.2 * fbm9(i * 0.4, 3.1, 2, RA * 0.4));
      rayB[i] = smooth9(0.4, 0.7, fbm9(i * 0.03, 8.7, 2, RA * 0.03));
    }
    const motes = [];
    for (let i = 0;i < 110; i++)
      motes.push([hash9(i, 1) * W9, 50 + hash9(i, 2) * 44, 0.3 + hash9(i, 3) * 0.8, hash9(i, 4) * 6.28, hash9(i, 5)]);
    const mote = new Float32Array(N);
    const moteCells = [];
    return (t, { color } = {}) => {
      for (const k of moteCells)
        mote[k] = 0;
      moteCells.length = 0;
      for (const [mx, my, sp, ph, sz] of motes) {
        const x = Math.floor(((mx + t * sp + 2.5 * Math.sin(t * 0.4 + ph)) % W9 + W9) % W9);
        const y = Math.floor(my + 2 * Math.sin(t * 0.3 + ph * 1.7) - t * sp * 0.2 % 6);
        if (y < 0 || y >= H9)
          continue;
        const k = y * W9 + x;
        mote[k] = 0.5 + 0.5 * sz;
        moteCells.push(k);
      }
      const shiftA = 2 * Math.sin(t * 0.35), shiftB = -t * 1.6;
      const pulse = 0.88 + 0.12 * Math.sin(t * 0.7);
      for (let r = 0;r < H9; r++) {
        for (let x = 0;x < W9; x++) {
          const k = r * W9 + x;
          let cr = sr[k], cg = sg[k], cb = sb[k];
          const s = sunS[k];
          const fa = fogAmt[k];
          if (fa > 0.01) {
            const u = x + t * fogSpeed[k], ui = Math.floor(u), uf = u - ui;
            const f0 = fog[r * FW + ui % FW], f1 = fog[r * FW + (ui + 1) % FW];
            const a = (f0 + (f1 - f0) * uf) * fa;
            cr = mix9(cr, fogR(s), a), cg = mix9(cg, fogG(s), a), cb = mix9(cb, fogB(s), a);
          }
          const ca = cloudAmt[k];
          if (ca > 0.01) {
            const u = x + t * 0.6, ui = Math.floor(u), uf = u - ui;
            const c0 = cloud[r * FW + ui % FW], c1 = cloud[r * FW + (ui + 1) % FW];
            const a = (c0 + (c1 - c0) * uf) * ca;
            if (a > 0.005) {
              const w = Math.exp(-dist[k] / 40);
              cr = mix9(cr, mix9(0.26, 0.95, w), a), cg = mix9(cg, mix9(0.38, 0.72, w), a), cb = mix9(cb, mix9(0.42, 0.45, w), a);
            }
          }
          const ra = rayAmt[k], fl = floorLit[k];
          let beam = 0;
          if (ra > 0.01 || fl > 0.01) {
            const ai = abin[k];
            const ia = Math.floor(ai + shiftA), ib = Math.floor(ai + shiftB);
            beam = rayA[(ia % RA + RA) % RA] * (0.6 + 0.4 * rayB[(ib % RA + RA) % RA]) * pulse;
          }
          if (ra > 0.01 && dist[k] > SUN_R) {
            const fall = Math.exp(-dist[k] / 80) * smooth9(SUN_R, 12, dist[k]);
            const b = (beam - 0.3) * fall * ra * 2.2;
            if (b > 0)
              cr += b * 1.05, cg += b * 0.8, cb += b * 0.42;
            else {
              const dim = 1 + b;
              cr *= dim, cg *= dim, cb *= dim;
            }
          }
          if (fl > 0.01) {
            const b = beam * fl * 1.1;
            cr += b * 1, cg += b * 0.78, cb += b * 0.4;
          }
          let floor = lift[k];
          if (mote[k] && dist[k] > 6) {
            const ia = Math.floor(abin[k] + shiftA);
            const lit = rayA[(ia % RA + RA) % RA] * Math.exp(-dist[k] / 90);
            const v = mote[k] * (0.1 + 1.6 * lit) * Math.min(1, rayAmt[k] * 2);
            if (v > 0.18) {
              cr = Math.max(cr, v * 1.05), cg = Math.max(cg, v * 0.97), cb = Math.max(cb, v * 0.7);
              floor = 0.3;
            }
          }
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp9(floor + (1 - floor) * Math.pow(peak, 0.9) * 0.95);
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER9[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS9[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER9[step]) : 0;
            const sc = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp9(cr * sc), clamp9(cg * sc), clamp9(cb * sc));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H9; r++)
        lines.push(out.slice(r * W9, (r + 1) * W9).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/night-coast.ts
  var exports_night_coast = {};
  __export(exports_night_coast, {
    default: () => nightCoast,
    meta: () => meta10
  });
  var meta10 = {
    name: "night coast",
    category: "scenes",
    note: "a lighthouse turning its beam under moonlit clouds over a dark sea",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#080b12",
    palette: [
      "#15203d",
      "#1b2a50",
      "#223463",
      "#2b4077",
      "#364e8b",
      "#445f9f",
      "#5874b2",
      "#7089c0",
      "#8a9cc4",
      "#a3b1cf",
      "#bec9dc",
      "#d8dfea",
      "#eef1f6",
      "#f7f8fc",
      "#ffe9ae",
      "#ffd27c",
      "#f3a64a",
      "#c46c2d",
      "#121c1b",
      "#182724",
      "#203530",
      "#2c473d",
      "#3c5c4c",
      "#232a36",
      "#363e4c",
      "#555d6c",
      "#2a3550",
      "#3a4868",
      "#9c4136",
      "#ff5d4d"
    ]
  };
  var W10 = 200;
  var H10 = 100;
  var HORIZON = 60;
  var MOON3 = [150, 19];
  var LAMP_X = 30;
  var DOTS10 = " ·•●";
  var COVER10 = [0, 0.3, 0.6, 1];
  var BAYER10 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var AIR3 = 0;
  var LAND = 1;
  var TREE4 = 2;
  var TOWER2 = 3;
  var LANTERN = 4;
  var CAP = 5;
  var WALL3 = 6;
  var PANE2 = 7;
  var ROOF3 = 8;
  var ISLE = 9;
  function hash10(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise10(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash10(x0, yi), b = hash10(x1, yi), c = hash10(x0, yi + 1), d = hash10(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm10(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise10(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp10 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth10 = (a, b, v) => {
    const k = clamp10((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix10 = (a, b, k) => a + (b - a) * k;
  var hex10 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  function nightCoast() {
    const P = meta10.palette.map(hex10);
    const N = W10 * H10;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const top = (x) => HORIZON - 15 * smooth10(86, 50, x) * (1 - 0.12 * smooth10(24, 0, x)) - 1.6 * fbm10(x * 0.15, 3.7, 3, 0);
    const mat = new Uint8Array(N);
    const shade = new Float32Array(N);
    const base = top(LAMP_X);
    const towerTop = base - 15;
    const trees = [];
    for (let x = 1;x < 76; x += 2.6 + hash10(x * 7, 1) * 2.6) {
      if (x > 22 && x < 49)
        continue;
      trees.push([x + hash10(x, 2) * 1.2, (4 + hash10(x, 3) * 7) * smooth10(78, 56, x), 2 + hash10(x, 4) * 1.6]);
    }
    const cottage = top(41);
    for (let r = 0;r < H10; r++) {
      for (let x = 0;x < W10; x++) {
        const k = r * W10 + x;
        const y = r + 0.5;
        const t0 = top(x);
        const isle = HORIZON - 4.5 * Math.max(0, 1 - ((x - 180) / 26) ** 2) - 1.4 * fbm10(x * 0.2, 9, 2, 0);
        if (y >= t0 && y < HORIZON + 4 && x < 90) {
          mat[k] = LAND;
          shade[k] = 0.2 + 0.45 * fbm10(x * 0.35, y * 0.35, 3, 0) + 0.5 * smooth10(t0 + 3, t0, y) - 0.2 * smooth10(HORIZON - 4, HORIZON + 4, y);
        } else if (x > 148 && y >= isle && y < HORIZON) {
          mat[k] = ISLE;
        }
        for (const [tx, th, tw] of trees) {
          if (th < 1)
            continue;
          const tb = top(tx);
          const dy = y - (tb - th);
          if (dy >= 0 && y < tb + 2 && Math.abs(x + 0.5 - tx) <= dy / th * tw + 0.4) {
            mat[k] = TREE4;
            shade[k] = 0.1 + 0.35 * hash10(x * 13 + r, 5) + (x + 0.5 > tx ? 0.35 : 0);
          }
        }
        const dx = x + 0.5 - LAMP_X;
        if (y >= towerTop && y < base + 2) {
          const hw = 3 - 1.1 * smooth10(base, towerTop, y);
          if (Math.abs(dx) <= hw) {
            mat[k] = TOWER2;
            shade[k] = 0.45 + 0.5 * (dx / hw);
          }
        }
        if (y >= towerTop - 1 && y < towerTop + 1 && Math.abs(dx) <= 3.6)
          mat[k] = CAP, shade[k] = 0.55;
        if (y >= towerTop - 7 && y < towerTop - 1 && Math.abs(dx) <= 2)
          mat[k] = LANTERN;
        if (y >= towerTop - 10 && y < towerTop - 7 && Math.abs(dx) <= 2.8 - (towerTop - 7 - y) * 0.8)
          mat[k] = CAP, shade[k] = 0.4;
        if (x >= 36 && x <= 47 && y >= cottage - 5 && y < cottage + 1) {
          mat[k] = WALL3;
          shade[k] = 0.3 + 0.4 * (x - 36) / 11;
          if ((x === 39 || x === 44) && y >= cottage - 4 && y < cottage - 1.5)
            mat[k] = PANE2;
        }
        if (y >= cottage - 10 && y < cottage - 5 && Math.abs(x + 0.5 - 42) <= 7.5 - (cottage - 5 - y) * 1.2)
          mat[k] = ROOF3;
      }
    }
    const haze = new Float32Array(N);
    for (let k = 0;k < N; k++)
      haze[k] = fbm10(k % W10 * 0.05, Math.floor(k / W10) * 0.08, 3, 0);
    const CW = 640;
    const cover = new Float32Array(CW * HORIZON);
    const lit = new Float32Array(CW * HORIZON);
    const density = (x, y) => {
      const q = fbm10(x * 0.008, y * 0.02, 3, CW * 0.008);
      const d = fbm10(x * 0.018 + q * 2.4, y * 0.036 + q * 1.1, 5, CW * 0.018);
      return d + 0.05 * smooth10(8, 22, y) - 0.04 * smooth10(10, 0, y) - 0.16 * smooth10(36, HORIZON - 4, y);
    };
    for (let r = 0;r < HORIZON; r++) {
      for (let x = 0;x < CW; x++) {
        const y = r + 0.5;
        const d = density(x, y);
        cover[r * CW + x] = smooth10(0.52, 0.63, d);
        const toward = density(x + 2.5, y - 3);
        lit[r * CW + x] = clamp10(0.5 + (d - toward) * 11 - (d - 0.6) * 1.2);
      }
    }
    return (t, { color } = {}) => {
      const beam = t / 8 * Math.PI * 2 - 0.75;
      const cb = Math.cos(beam), sb = Math.sin(beam);
      const flash = Math.pow(Math.max(0, sb), 14) * 2.2;
      const lampY = towerTop - 4;
      const drift = t * 1.4;
      for (let r = 0;r < H10; r++) {
        for (let x = 0;x < W10; x++) {
          const k = r * W10 + x;
          const y = r + 0.5;
          const m = mat[k];
          let cr = 0, cg = 0, cbl = 0, floor = 0.3, fade = 1;
          const dmx = x + 0.5 - MOON3[0], dmy = y - MOON3[1];
          const dm = Math.sqrt(dmx * dmx + dmy * dmy);
          if (y < HORIZON && m === AIR3) {
            const v = y / HORIZON;
            const halo = Math.exp(-dm / 24) * 0.35 + Math.exp(-dm / 9) * 0.45;
            const glowH = Math.pow(v, 3) * 0.24;
            const veil = 0.85 + 0.3 * haze[r * W10 + x];
            cr = (0.04 + 0.1 * v * v + glowH * 0.9) * veil + 0.3 * halo;
            cg = (0.07 + 0.13 * v * v + glowH) * veil + 0.35 * halo;
            cbl = (0.17 + 0.2 * v * v + glowH * 1.1) * veil + 0.42 * halo;
            floor = 0.15;
            const sx = x + drift, ix = Math.floor(sx), fx = sx - ix;
            const i0 = r * CW + ix % CW, i1 = r * CW + (ix + 1) % CW;
            const c = (cover[i0] + (cover[i1] - cover[i0]) * fx) * (0.15 + 0.85 * smooth10(7, 24, dm));
            const l = lit[i0] + (lit[i1] - lit[i0]) * fx;
            if (dm < 6) {
              const face = 0.86 + 0.14 * fbm10(x * 0.5, y * 0.5, 2, 0);
              const a = (1 - c * 0.8) * smooth10(6, 5, dm);
              cr = mix10(cr, 0.96 * face, a);
              cg = mix10(cg, 0.97 * face, a);
              cbl = mix10(cbl, 1 * face, a);
            } else if (c < 0.05 && hash10(x, r * 3 + 11) > 0.982) {
              const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + hash10(x, r) * 3) + hash10(r, x) * 6.28);
              const s = (0.5 + 0.5 * tw) * (1 - halo) * smooth10(HORIZON, 20, y);
              cr = Math.max(cr, s * 0.92), cg = Math.max(cg, s * 0.94), cbl = Math.max(cbl, s);
            }
            if (c > 0.01) {
              const near = Math.exp(-dm / 30);
              const b = clamp10(l * (0.5 + 0.6 * near) + 0.25 * smooth10(30, HORIZON, y));
              const kr = b < 0.5 ? mix10(0.1, 0.36, b * 2) : mix10(0.36, 0.95, (b - 0.5) * 2);
              const kg = b < 0.5 ? mix10(0.13, 0.42, b * 2) : mix10(0.42, 0.96, (b - 0.5) * 2);
              const kb = b < 0.5 ? mix10(0.25, 0.58, b * 2) : mix10(0.58, 1, (b - 0.5) * 2);
              const a = Math.min(1, c * 1.1);
              cr = mix10(cr, kr, a);
              cg = mix10(cg, kg, a);
              cbl = mix10(cbl, kb, a);
            }
          } else if (y >= HORIZON && (m === AIR3 || m === LAND) && !(m === LAND && y < HORIZON + 4)) {
            const v = (y - HORIZON) / (H10 - HORIZON);
            const w = 0.6 * noise10(x * 0.07 + t * 0.12, y * 0.45 - t * 0.6, 0) + 0.4 * noise10(x * 0.2 - t * 0.25, y * 0.9 - t * 1.1, 0);
            const swell = 0.45 + 0.95 * w;
            cr = (0.08 - 0.04 * v) * swell;
            cg = (0.13 - 0.06 * v) * swell;
            cbl = (0.28 - 0.12 * v) * swell;
            const roadW = 3 + (y - HORIZON) * 0.55;
            const road = Math.exp(-(((x + 0.5 - MOON3[0]) / roadW) ** 2));
            const glint = smooth10(0.5, 0.8, w) * road;
            cr += 0.95 * glint + 0.07 * road;
            cg += 0.95 * glint + 0.09 * road;
            cbl += 0.95 * glint + 0.15 * road;
            const lw = 1.3 + (y - HORIZON) * 0.22;
            const refl = Math.exp(-(((x + 0.5 - LAMP_X) / lw) ** 2)) * smooth10(0.45, 0.8, w) * (0.75 + 0.6 * flash);
            cr += refl;
            cg += 0.72 * refl;
            cbl += 0.32 * refl;
            if (y < HORIZON + 8 && x < 90) {
              const edge = smooth10(90, 74, x) * smooth10(HORIZON + 8, HORIZON + 3, y);
              const foam = smooth10(0.5, 0.85, noise10(x * 0.45 - t * 0.6, y * 0.8 + t * 0.4, 0)) * edge;
              cr += 0.65 * foam, cg += 0.7 * foam, cbl += 0.75 * foam;
            }
            const haze2 = Math.exp(-(y - HORIZON) / 2.5) * 0.16;
            cr += haze2 * 0.8, cg += haze2 * 0.9, cbl += haze2;
            floor = 0.18;
            fade = smooth10(H10, H10 - 26, y);
          } else if (m === LAND) {
            const s = shade[k];
            cr = 0.05 + 0.14 * s, cg = 0.09 + 0.2 * s, cbl = 0.1 + 0.18 * s;
            floor = 0.1;
          } else if (m === TREE4) {
            const s = shade[k];
            cr = 0.03 + 0.07 * s, cg = 0.07 + 0.14 * s, cbl = 0.07 + 0.1 * s;
            floor = 0.06;
          } else if (m === ISLE) {
            cr = 0.06, cg = 0.08, cbl = 0.15;
            floor = 0.1;
            if (x === 184 && r === 55) {
              const on = Math.sin(t * 2.2) > 0.55;
              cr = on ? 1 : 0.35, cg = on ? 0.36 : 0.12, cbl = on ? 0.3 : 0.1;
            }
          } else if (m === TOWER2 || m === CAP) {
            const s = shade[k];
            cr = 0.4 + 0.58 * s, cg = 0.42 + 0.56 * s, cbl = 0.48 + 0.52 * s;
            if (m === CAP)
              cr *= 0.7, cg *= 0.66, cbl *= 0.68;
          } else if (m === LANTERN) {
            const g = 0.85 + 0.15 * Math.min(1, flash);
            cr = g, cg = 0.84 * g, cbl = 0.5 * g;
          } else if (m === WALL3) {
            const s = shade[k];
            cr = 0.3 + 0.4 * s, cg = 0.32 + 0.4 * s, cbl = 0.38 + 0.4 * s;
          } else if (m === PANE2) {
            const g = 0.85 + 0.15 * Math.sin(t * 3 + x);
            cr = g, cg = 0.72 * g, cbl = 0.32 * g;
          } else if (m === ROOF3) {
            cr = 0.4, cg = 0.17, cbl = 0.14;
          }
          const bx = x + 0.5 - LAMP_X, by = y - lampY;
          if (m !== TOWER2 && m !== CAP && m !== LANTERN) {
            if (bx * cb > 0) {
              const along = Math.abs(bx) / (Math.abs(cb) * 115 + 1);
              if (along < 1) {
                const spread = 1.4 + Math.abs(bx) * 0.11;
                const b = Math.pow(1 - along, 1.8) * Math.exp(-((by / spread) ** 2)) * 0.85;
                cr += b, cg += b * 0.84, cbl += b * 0.5;
              }
            }
            const dl = Math.sqrt(bx * bx + by * by);
            const glow = Math.exp(-dl / (3.5 + 3 * flash)) * (0.5 + 0.6 * flash) + Math.exp(-dl / 14) * 0.12;
            cr += glow, cg += glow * 0.82, cbl += glow * 0.5;
          }
          const peak = Math.max(cr, cg, cbl, 0.0001);
          const level = clamp10(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95) * fade;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER10[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS10[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER10[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp10(cr * s), clamp10(cg * s), clamp10(cbl * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H10; r++)
        lines.push(out.slice(r * W10, (r + 1) * W10).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/ocean-sunset.ts
  var exports_ocean_sunset = {};
  __export(exports_ocean_sunset, {
    default: () => oceanSunset,
    meta: () => meta11
  });
  var meta11 = {
    name: "ocean sunset",
    category: "scenes",
    note: "the sun sets past a pine headland, lit cloud, glitter on rolling sea",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#0b0817",
    palette: [
      "#140f2c",
      "#1e1640",
      "#2b1c52",
      "#3d2266",
      "#552a74",
      "#6e2c78",
      "#90327c",
      "#b23c7c",
      "#d24f7a",
      "#ea6a78",
      "#c2306a",
      "#ff5d8f",
      "#ff8a9a",
      "#7a2456",
      "#f05d5e",
      "#f2804f",
      "#f99a43",
      "#ffb44a",
      "#ffcd62",
      "#ffe39a",
      "#fff5d8",
      "#a8323c",
      "#d2453c",
      "#e8603e",
      "#2f1a3e",
      "#47234f",
      "#63305c",
      "#874266",
      "#ac5b70",
      "#ff9e86",
      "#ffc4a2",
      "#ffdcc0",
      "#0e1230",
      "#171a46",
      "#232059",
      "#33286a",
      "#4a2f78",
      "#1c2a5c",
      "#2e4078",
      "#7d3f8f",
      "#a24f98",
      "#c8649e",
      "#de8bb5"
    ]
  };
  var W11 = 200;
  var H11 = 100;
  var HZ5 = 56;
  var SUN4 = [134, HZ5 - 4.5];
  var SR = 8.5;
  var BOAT = 112;
  var CHOP = [
    [-0.45, 0.89, 22, 0.07, 2.1, 0.4],
    [0.5, 0.87, 37, 0.06, 2.9, 2.1],
    [-0.15, 0.99, 61, 0.05, 3.7, 4.4],
    [0.3, 0.95, 97, 0.04, 4.6, 1.3]
  ];
  var DOTS11 = " ·•●";
  var COVER11 = [0, 0.3, 0.6, 1];
  var BAYER11 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var PINES = [[2.5, 10, 2.6], [8, 13, 3], [13, 18, 3.6], [18.5, 11, 2.8], [24, 20, 3.8], [30, 12, 2.9], [35, 8, 2.3], [39.5, 5, 1.8]];
  function hash11(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise11(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash11(x0, yi), b = hash11(x1, yi), c = hash11(x0, yi + 1), d = hash11(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm11(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise11(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp11 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth11 = (a, b, v) => {
    const k = clamp11((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix11 = (a, b, k) => a + (b - a) * k;
  var hex11 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var STOPS = [
    [0, 0.08, 0.1, 0.3],
    [0.3, 0.15, 0.1, 0.34],
    [0.52, 0.4, 0.15, 0.4],
    [0.72, 0.68, 0.27, 0.4],
    [0.88, 0.8, 0.32, 0.4],
    [1, 0.88, 0.4, 0.4]
  ];
  function gradient(v, out) {
    let i = 1;
    while (i < STOPS.length - 1 && v > STOPS[i][0])
      i++;
    const a = STOPS[i - 1], b = STOPS[i];
    const k = clamp11((v - a[0]) / (b[0] - a[0]));
    out[0] = mix11(a[1], b[1], k), out[1] = mix11(a[2], b[2], k), out[2] = mix11(a[3], b[3], k);
  }
  var ridge2 = (x) => HZ5 + 2.5 - 11 * Math.pow(smooth11(54, 32, x), 0.7) - 2.4 * Math.exp(-(((x - 19) / 9) ** 2)) - 2 * fbm11(x * 0.21, 3.3, 3, 0);
  var shore = (x) => HZ5 + 1.5 + 5 * smooth11(54, 4, x);
  var stack = (x) => x > 52 && x < 58 ? HZ5 - 3.5 - 1.6 * fbm11(x * 0.6, 8.1, 2, 0) + 2.5 * ((x - 55) / 3) ** 4 : 1e9;
  function oceanSunset() {
    const P = meta11.palette.map(hex11);
    const N = W11 * H11;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g2, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g2 * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g2, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const halftone = (k, r, x, cr, cg, cb, floor, fade, color) => {
      const peak = Math.max(cr, cg, cb, 0.0001);
      const level = clamp11(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95) * fade;
      const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER11[(r & 3) * 4 + (x & 3)])));
      out[k] = DOTS11[step];
      if (color) {
        const want = step ? Math.min(1, (level + 0.06) / COVER11[step]) : 0;
        const s = (0.3 + 0.7 * want) * (0.4 + 0.6 * smooth11(0.14, 0.5, level)) / peak;
        color[k] = nearest(clamp11(cr * s), clamp11(cg * s), clamp11(cb * s));
      }
    };
    const sky = new Float32Array(HZ5 * W11 * 3);
    const g = [0, 0, 0];
    for (let r = 0;r < HZ5; r++) {
      for (let x = 0;x < W11; x++) {
        const y = r + 0.5;
        const dx = x + 0.5 - SUN4[0], dy = (y - SUN4[1]) * 1.6;
        const d = Math.sqrt(dx * dx + dy * dy);
        const near = Math.exp(-Math.abs(dx) / 62);
        const v = y / HZ5;
        gradient(Math.pow(v, 1 + 0.12 * (1 - near)), g);
        const warm = Math.exp(-Math.abs(dx) / 36) * smooth11(0.45, 1, v) * 0.9;
        g[0] = mix11(g[0], 1 * mix11(0.6, 1, v), warm), g[1] = mix11(g[1], 0.64 * mix11(0.6, 1, v), warm), g[2] = mix11(g[2], 0.3, warm);
        const fall = mix11(1, 0.86 + 0.14 * near, smooth11(0.6, 1, v));
        const glow = Math.exp(-d / 40) * 0.15 + Math.exp(-d / 9) * 0.1;
        const haze = 0.82 + 0.36 * fbm11(x * 0.03, y * 0.12, 3, 0);
        const k = (r * W11 + x) * 3;
        const vig = (1 - 0.08 * Math.pow(Math.abs(x + 0.5 - 100) / 100, 2)) * haze * fall;
        sky[k] = g[0] * (0.85 + 0.15 * near) * vig + glow;
        sky[k + 1] = g[1] * (0.65 + 0.35 * near) * vig + glow * 0.7;
        sky[k + 2] = g[2] * (1.1 - 0.2 * near) * vig + glow * 0.3;
      }
    }
    const LANDW = 60, LANDH = HZ5 + 10;
    const land = new Uint8Array(N);
    const LR = new Float32Array(N), LG = new Float32Array(N), LB2 = new Float32Array(N);
    const edge = new Float32Array(LANDH).fill(-1);
    for (let r = 0;r < LANDH; r++) {
      const y = r + 0.5;
      for (let x = 0;x < LANDW; x++)
        if (y >= ridge2(x + 0.5) && y < shore(x + 0.5))
          edge[r] = x;
    }
    for (let r = 0;r < LANDH; r++) {
      const y = r + 0.5;
      for (let x = 0;x < LANDW; x++) {
        const k = r * W11 + x, xc = x + 0.5;
        const t0 = ridge2(xc), st = stack(xc);
        let cr, cg, cb;
        if (y >= t0 && y < shore(xc) || y >= st && y < HZ5 + 1.2) {
          land[k] = 1;
          const isStack = !(y >= t0 && y < shore(xc));
          const top = isStack ? st : t0;
          const s = 0.6 + 0.8 * fbm11(x * 0.22, y * 0.7, 3, 0);
          cr = 0.06 * s, cg = 0.042 * s, cb = 0.15 * s;
          const facing = clamp11(0.4 + (isStack ? 0.5 : (ridge2(xc + 1.2) - ridge2(xc - 1.2)) * 0.45));
          const rim = smooth11(top + 2.4, top + 0.4, y) * facing;
          const crag = smooth11(0.35, 0.75, fbm11(x * 0.4 + 3, y * 0.5, 3, 0));
          const face = isStack ? smooth11(53.5, 57.5, xc) * 0.7 : edge[r] > 30 ? Math.exp(-(edge[r] - x) / 4) * smooth11(HZ5 + 5, HZ5 - 4, y) : 0;
          const lit = clamp11(Math.max(rim * 0.9, face * (0.3 + 0.7 * crag) * 0.75));
          cr = mix11(cr, 0.95, lit), cg = mix11(cg, 0.38, lit * 0.95), cb = mix11(cb, 0.3, lit * 0.9);
        }
        for (const [tx, th, tw] of PINES) {
          const tb = ridge2(tx);
          const dy = y - (tb - th);
          const tier = (dy + th * 0.3) / 2.4;
          const half = dy / th * tw * (0.5 + 0.75 * (tier - Math.floor(tier))) + 0.35;
          const ex = xc - tx;
          if (dy >= 0 && y < tb + 1.5 && Math.abs(ex) <= half) {
            land[k] = 2;
            const s = 0.7 + 0.6 * hash11(x * 13 + r, 5);
            cr = 0.045 * s, cg = 0.03 * s, cb = 0.1 * s;
            const e = ex > 0 && ex > half - 1.1 ? 0.3 + 0.3 * smooth11(th, 0, dy) : 0;
            cr = mix11(cr, 0.85, e), cg = mix11(cg, 0.3, e), cb = mix11(cb, 0.3, e);
          }
        }
        if (land[k])
          LR[k] = cr, LG[k] = cg, LB2[k] = cb;
      }
    }
    for (let r = HZ5 - 10;r < HZ5 + 4; r++) {
      const y = r + 0.5;
      for (let x = BOAT - 6;x <= BOAT + 6; x++) {
        const k = r * W11 + x, ex = x + 0.5 - BOAT;
        const hull = y >= HZ5 + 1 && y < HZ5 + 3 && Math.abs(ex - 0.3) < 4.6 - (y - HZ5 - 1) * 1.3;
        const mast = Math.abs(ex) < 0.5 && y >= HZ5 - 9 && y < HZ5 + 1;
        const main = ex > 0 && y >= HZ5 - 8.5 && y < HZ5 + 0.5 && ex < 0.6 + (y - (HZ5 - 8.5)) * 0.42;
        const jib = ex < 0 && y >= HZ5 - 7 && y < HZ5 + 0.5 && -ex < (y - (HZ5 - 7)) * 0.36;
        if (hull || mast || main || jib) {
          land[k] = 3;
          const glow = main ? 0.12 + 0.18 * smooth11(0, 3.5, ex) : 0;
          LR[k] = 0.05 + glow, LG[k] = 0.03 + glow * 0.45, LB2[k] = 0.09 + glow * 0.35;
        }
      }
    }
    const U = 640, V = 128;
    const deck = new Float32Array(U * V), deckLit = new Float32Array(U * V);
    const deckAt = (u, v) => {
      const q = fbm11(u * 0.0125, v * 0.06, 2, 8);
      const patch = fbm11(u * 0.00625, v * 0.03 + 7, 2, 4);
      return fbm11(u * 0.040625 + q * 1.6, v * 0.3, 5, 26) + 0.25 * (patch - 0.5);
    };
    for (let v = 0;v < V; v++) {
      for (let u = 0;u < U; u++) {
        const d = deckAt(u, v);
        deck[v * U + u] = d;
        deckLit[v * U + u] = clamp11(0.5 + (d - deckAt(u, v + 2.5)) * 9);
      }
    }
    const thinTop = new Float32Array(W11 * HZ5);
    for (let r = 0;r < HZ5; r++)
      for (let x = 0;x < W11; x++)
        thinTop[r * W11 + x] = fbm11(x * 0.05 + 11, r * 0.15, 2, 0);
    const CW = 720;
    const loCover = new Float32Array(CW * HZ5), loLit = new Float32Array(CW * HZ5);
    const lower = (x, y) => {
      const b = fbm11(x / 40, y * 0.3, 4, CW / 40);
      const gaps = fbm11(x / 120, 5, 2, CW / 120);
      return b + 0.01 + 0.5 * (gaps - 0.5) - 0.35 * smooth11(HZ5 - 14, HZ5 - 20, y) - 0.25 * smooth11(HZ5 - 4, HZ5 - 1, y);
    };
    for (let r = 0;r < HZ5; r++) {
      for (let x = 0;x < CW; x++) {
        const y = r + 0.5;
        const k = r * CW + x;
        const dl = lower(x, y);
        loCover[k] = smooth11(0.58, 0.66, dl);
        loLit[k] = clamp11(0.5 + (dl - lower(x, y + 1.2)) * 6);
      }
    }
    const SKR = new Float32Array(HZ5 * W11), SKG = new Float32Array(HZ5 * W11), SKB = new Float32Array(HZ5 * W11);
    return (t, { color } = {}) => {
      const dUp = t * 0.9, dLo = t * 1.7;
      for (let r = 0;r < HZ5; r++) {
        const y = r + 0.5;
        for (let x = 0;x < W11; x++) {
          const k = r * W11 + x;
          const s = k * 3;
          let cr = sky[s], cg = sky[s + 1], cb = sky[s + 2];
          const dx = x + 0.5 - SUN4[0];
          const dy = y - SUN4[1];
          let disc = 0;
          const ds = Math.sqrt(dx * dx + (dy / 0.9) ** 2);
          if (ds < SR + 0.6) {
            const e = ds / SR;
            disc = smooth11(SR + 0.45, SR - 0.45, ds);
            const e4 = e * e * e * e;
            cr = mix11(cr, 1, disc);
            cg = mix11(cg, 0.95 - 0.2 * e4, disc);
            cb = mix11(cb, 0.78 - 0.38 * e4, disc);
          }
          const near = Math.exp(-Math.sqrt(dx * dx + dy * dy * 2.5) / 45);
          const v = y / HZ5;
          const D = 58 / (HZ5 - y + 2.5);
          const far = smooth11(4.8, 2.7, D) * smooth11(1.08, 1.7, D);
          let cloud = 0;
          if (far > 0) {
            const su = dx * D + dUp + 64200, sv = (D - 0.9) * 10;
            let iu = Math.floor(su);
            const fu = su - iu, iv = Math.floor(sv), fv = sv - iv;
            iu %= U;
            const iu1 = (iu + 1) % U, a0 = iv * U, a1 = a0 + U;
            const d0 = deck[a0 + iu] + (deck[a0 + iu1] - deck[a0 + iu]) * fu;
            const d1 = deck[a1 + iu] + (deck[a1 + iu1] - deck[a1 + iu]) * fu;
            const dd = d0 + (d1 - d0) * fv - 0.22 * (1 - far) * thinTop[k];
            const c2 = smooth11(0.56, 0.68, dd) * Math.sqrt(far);
            if (c2 > 0.01) {
              cloud = c2;
              const l0 = deckLit[a0 + iu] + (deckLit[a0 + iu1] - deckLit[a0 + iu]) * fu;
              const l1 = deckLit[a1 + iu] + (deckLit[a1 + iu1] - deckLit[a1 + iu]) * fu;
              const l = l0 + (l1 - l0) * fv;
              const az = Math.exp(-Math.abs(dx) / 60);
              const low = v * v;
              const thin = 1 - smooth11(0.6, 0.76, dd);
              const b = clamp11(Math.pow(smooth11(0.45, 0.85, l), 1.5) * (0.55 + 0.25 * low + 0.35 * az) + 0.3 * thin * az * low);
              const warm = clamp11(az * (0.1 + 1.2 * low));
              const hr = 1, hg = mix11(0.45, 0.72, warm), hb = mix11(0.52, 0.38, warm);
              const sr = mix11(0.1, 0.2, v), sg = mix11(0.065, 0.07, v), sb = mix11(0.23, 0.27, v);
              cr = mix11(cr, mix11(sr, hr, b), c2);
              cg = mix11(cg, mix11(sg, hg, b), c2);
              cb = mix11(cb, mix11(sb, hb, b), c2);
            }
          }
          const sx = x + dLo, ix = Math.floor(sx), fx = sx - ix;
          const i0 = r * CW + ix % CW, i1 = r * CW + (ix + 1) % CW;
          const c = (loCover[i0] + (loCover[i1] - loCover[i0]) * fx) * (1 - 0.75 * Math.exp(-((dx / 13) ** 2))) * (1 - 0.85 * smooth11(76, 50, x));
          if (c > 0.01) {
            cloud = Math.max(cloud, c);
            const l = loLit[i0] + (loLit[i1] - loLit[i0]) * fx;
            const rim = Math.pow(l, 2) * (0.35 + 0.9 * near);
            const a = Math.min(1, c * 1.2) * 0.92;
            cr = mix11(cr, 0.3 + 0.7 * rim, a);
            cg = mix11(cg, 0.09 + 0.55 * rim, a);
            cb = mix11(cb, 0.24 + 0.18 * rim, a);
          }
          if (r < 22 && cloud < 0.05 && hash11(x, r * 5 + 3) > 0.993) {
            const tw = 0.55 + 0.45 * Math.sin(t * (0.8 + hash11(r, x) * 1.6) + hash11(x, r) * 6.28);
            const st = tw * smooth11(22, 4, r) * 0.75;
            cr = Math.max(cr, st * 0.95), cg = Math.max(cg, st * 0.85), cb = Math.max(cb, st);
          }
          const keep = 1 - 0.75 * disc;
          SKR[k] = cr * keep, SKG[k] = cg * keep, SKB[k] = cb * keep;
          if (land[k]) {
            cr = LR[k], cg = LG[k], cb = LB2[k];
            halftone(k, r, x, cr, cg, cb, 0.02, 1, color);
          } else
            halftone(k, r, x, cr, cg, cb, 0.05, 1, color);
        }
      }
      for (let r = HZ5;r < H11; r++) {
        const y = r + 0.5;
        const dz = y - HZ5;
        const Z = 36 / dz;
        const rows = 36 / (dz * dz);
        const swellAmt = smooth11(8, 26, dz);
        const hot = Math.exp(-dz / 9);
        const pw = 3 + dz * 0.8;
        const fx = 0.9 / (1 + dz * 0.06) * 0.35, fy = 1.6 / (1 + dz * 0.05);
        const fres = 0.24 + 0.46 * Math.exp(-dz / 8);
        const depth = smooth11(HZ5, H11, y);
        const fade = smooth11(H11 + 6, H11 - 4, y);
        for (let x = 0;x < W11; x++) {
          const k = r * W11 + x;
          if (land[k]) {
            halftone(k, r, x, LR[k], LG[k], LB2[k], 0.02, 1, color);
            continue;
          }
          const dx = x + 0.5 - SUN4[0];
          const X = (x + 0.5 - 100) / dz;
          const p = 13 * (Z + 0.05 * X) + 2.2 * fbm11(X * 0.35 + 3, Z * 0.4, 2, 0) + t * 0.8;
          const wv = Math.sin(p), slope = Math.cos(p);
          let sz = 0.11 * slope * clamp11(1.4 / (13 * rows)), sxl = 0.015 * slope;
          for (let i = 0;i < CHOP.length; i++) {
            const [kx, kz, kk, a, w, f] = CHOP[i];
            const ph = kk * (kx * X + kz * Z) - w * t + f;
            const c = Math.cos(ph) * a * clamp11(1.6 / (kk * rows));
            sz += c * kz, sxl += c * kx;
          }
          let ry = Math.round(HZ5 - 1 - dz * 0.85 - 70 * sz);
          ry = ry < 0 ? 0 : ry > HZ5 - 1 ? HZ5 - 1 : ry;
          let rx = Math.round(x - 60 * sxl);
          rx = rx < 0 ? 0 : rx > W11 - 1 ? W11 - 1 : rx;
          const q = ry * W11 + rx;
          const rip = noise11(x * fx * 1.4 + 13 - t * 0.15, y * fy * 1.1 + t * 0.25, 0);
          const rf = fres * (0.5 + 1.1 * rip * rip);
          let cr = SKR[q] * rf * 0.8 + 0.03 - 0.01 * depth;
          let cg = SKG[q] * rf * 0.75 + 0.022;
          let cb = SKB[q] * rf + 0.095 + 0.03 * depth;
          const n = 0.55 * noise11(x * fx + t * 0.3, y * fy * 1.3 - t * 0.4, 0) + 0.45 * noise11(x * fx * 1.7 - t * 0.4, y * fy * 2 + t * 0.3 + 40, 0);
          const wave = Math.floor(p / (2 * Math.PI));
          const crest = Math.pow(0.5 + 0.5 * wv, 7) * swellAmt * smooth11(0.4, 0.65, noise11(X * 2.5 + 7, wave * 3.7, 0));
          const path = Math.exp(-((dx / pw) ** 2));
          const soft = Math.exp(-((dx / (pw * 1.6)) ** 2));
          if (slope > 0) {
            const d = 1 - 0.7 * swellAmt * slope;
            cr *= d, cg *= d, cb *= d;
          }
          const th = 0.84 - 0.3 * path * (0.45 + 0.55 * hot);
          const glint = smooth11(th, th + 0.08, n) * (0.25 + 0.75 * path) * soft;
          const white = path * path * smooth11(th + 0.04, th + 0.2, n);
          cr += 0.2 * soft * (0.4 + hot) + glint * 1.1;
          cg += 0.1 * soft * (0.4 + hot) + glint * (0.55 + 0.3 * hot + 0.35 * white);
          cb += 0.04 * soft + glint * (0.2 + 0.25 * hot + 0.45 * white);
          const catchL = crest * (0.15 + 0.85 * soft) * (0.6 + 0.6 * n);
          cr += catchL * 0.95, cg += catchL * mix11(0.3, 0.7, soft), cb += catchL * mix11(0.5, 0.3, soft);
          const dash = smooth11(0.4, 0.7, noise11(x * 0.18 + t * 0.25, y * 0.9 - t * 0.5, 0));
          const col = Math.exp(-((dx / (1 + dz * 0.22)) ** 2)) * Math.exp(-dz / 5) * (0.6 + 0.4 * n) * smooth11(0, 3, dz) * dash;
          cr += col, cg += col * 0.8, cb += col * 0.45;
          if (x < LANDW + 4 && dz < 26) {
            const xs = x + 0.5 + 1.3 * Math.sin(y * 1.1 + t * 1.2 + x * 0.05);
            const ix = Math.max(0, Math.min(LANDW - 1, xs | 0));
            const ft = shore(ix + 0.5);
            if (y > ft) {
              const my = Math.floor(2 * ft - y);
              if (my >= 0 && my < LANDH) {
                const m = my * W11 + ix;
                if (land[m]) {
                  const a = 0.8 * smooth11(ft + 24, ft + 4, y);
                  cr = mix11(cr, LR[m] * 0.8 + 0.02, a), cg = mix11(cg, LG[m] * 0.7 + 0.015, a), cb = mix11(cb, LB2[m] * 0.85 + 0.05, a);
                }
              }
              const foam = smooth11(ft + 1.6, ft + 0.3, y) * smooth11(0.45, 0.8, noise11(x * 0.5 - t * 0.4, t * 0.3, 0));
              cr += 0.5 * foam, cg += 0.3 * foam, cb += 0.35 * foam;
            }
          }
          if (dz > 2.5 && dz < 14 && x > BOAT - 8 && x < BOAT + 8) {
            const ix = x + 0.5 + 0.9 * Math.sin(y * 1.3 + t * 1.6) | 0;
            const m = Math.floor(2 * (HZ5 + 3) - y) * W11 + ix;
            if (land[m] === 3) {
              const a = 0.7 * smooth11(HZ5 + 14, HZ5 + 4, y) * (0.6 + 0.4 * rip);
              cr = mix11(cr, 0.04, a), cg = mix11(cg, 0.03, a), cb = mix11(cb, 0.1, a);
            }
          }
          if (dz < 1.5)
            cr *= 0.55, cg *= 0.55, cb *= 0.55;
          halftone(k, r, x, cr, cg, cb, 0.18, fade, color);
        }
      }
      const lines = [];
      for (let r = 0;r < H11; r++)
        lines.push(out.slice(r * W11, (r + 1) * W11).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/storm-plains.ts
  var exports_storm_plains = {};
  __export(exports_storm_plains, {
    default: () => stormPlains,
    meta: () => meta12
  });
  var meta12 = {
    name: "storm plains",
    category: "scenes",
    note: "an anvil thunderhead at dusk flickering over a wheat field",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#0b0912",
    palette: [
      "#0f0c20",
      "#141029",
      "#1c1638",
      "#261c4a",
      "#32235a",
      "#40306c",
      "#53407e",
      "#6a5590",
      "#8670a6",
      "#7a6288",
      "#9a7890",
      "#b98e94",
      "#e6a890",
      "#f2bca8",
      "#f7d6a8",
      "#fbe8c6",
      "#f8b070",
      "#e88a4c",
      "#c8643a",
      "#9a4630",
      "#6a3226",
      "#f0c868",
      "#d8a447",
      "#b7843a",
      "#8c6230",
      "#5e4226",
      "#3a2a1c",
      "#261c14",
      "#181a2c",
      "#2a3048",
      "#3a4260",
      "#4f5878",
      "#6a7392",
      "#8890ae",
      "#a2aabd",
      "#5d5878",
      "#7c7598",
      "#a6a2c8",
      "#d6d2fa",
      "#f4f2ff",
      "#ffe08a",
      "#ffb84a"
    ]
  };
  var W12 = 200;
  var H12 = 100;
  var HZ6 = 64;
  var SUN5 = [30, 70];
  var BASE = 45;
  var DOTS12 = " ·•●";
  var COVER12 = [0, 0.3, 0.6, 1];
  var BAYER12 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var SKY4 = 0;
  var PLAIN = 1;
  var FIELD = 2;
  var ROAD2 = 3;
  var HOUSE = 4;
  var ROOF4 = 5;
  var PANE3 = 6;
  var TREE5 = 7;
  var PUMP = 8;
  var BELT = 9;
  function hash12(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise12(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash12(x0, yi), b = hash12(x1, yi), c = hash12(x0, yi + 1), d = hash12(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm12(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise12(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp12 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth12 = (a, b, v) => {
    const k = clamp12((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix12 = (a, b, k) => a + (b - a) * k;
  var hex12 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var dome = (dx, dy, r) => {
    const q = 1 - dx * dx - dy * dy;
    return q > 0 ? r * Math.sqrt(q) : 0;
  };
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const k = clamp12(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1));
    const ex = px - ax - dx * k, ey = py - ay - dy * k;
    return Math.sqrt(ex * ex + ey * ey);
  }
  function stormPlains() {
    const P = meta12.palette.map(hex12);
    const STALK = meta12.palette.indexOf("#8c6230");
    const N = W12 * H12;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const towerC = (y) => 138 + (BASE - y) * 0.14;
    const towerHW = (y) => 23 - (BASE - y) * 0.08;
    const anvilTop = (x) => 7.5 + 2.5 * smooth12(150, 210, x) + 3 * smooth12(112, 58, x);
    const anvilBot = (x) => 21 - 9 * smooth12(124, 62, x) - 7 * smooth12(152, 210, x);
    const puffs = [];
    let seed = 1;
    const rnd = () => hash12(seed++, 911);
    for (let y = BASE - 4.5;y > 14; y -= 4.4) {
      const cx = towerC(y), hw = towerHW(y);
      const n = Math.max(2, Math.round(hw * 2 / 11));
      for (let i = 0;i < n; i++) {
        const u = (i + 0.5) / n * 2 - 1;
        const rr = 7 + rnd() * 4;
        puffs.push([cx + u * (hw - rr * 0.55) + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 2, rr, 4 * Math.sqrt(1 - u * u * 0.85), 1]);
      }
    }
    puffs.push([141, 8.5, 9, 2, 0], [133, 9.5, 6, 1, 0], [149, 10, 6, 1, 0]);
    for (const [cx, top, w] of [
      [104, 27, 9],
      [89, 34, 6.5],
      [77, 40.5, 3.8]
    ]) {
      for (let y = BASE - w * 0.4;y > top + w * 0.6; y -= w * 0.75)
        puffs.push([cx + (rnd() - 0.5) * w * 0.6, y, w * (0.75 + rnd() * 0.2), 1, 1]);
      puffs.push([cx - w * 0.35, top + w * 0.75, w * 0.62, 1, 1], [cx + w * 0.3, top + w * 0.6, w * 0.7, 1.5, 1], [cx, top + w * 0.45, w * 0.55, 2, 1]);
    }
    for (let x = 66;x < 126; x += 3.2 + rnd() * 1.6)
      puffs.push([x, BASE - 1.8 - rnd() * 1.2, 3 + rnd() * 1.6 + 1.6 * smooth12(70, 110, x), 0.4, 1]);
    const SX = W12 + 4, SY = BASE + 8;
    const sh = new Float32Array(SX * SY);
    const anv = new Float32Array(SX * SY);
    const lip = new Float32Array(SX * SY);
    for (let r = 0;r < SY; r++) {
      for (let i = 0;i < SX; i++) {
        const x = i - 2 + 0.5, y = r + 0.5;
        let tower = 0;
        const cut = smooth12(BASE + 1, BASE - 1.5, y + 1.2 * (noise12(x * 0.15, 3.3, 0) - 0.5));
        for (const [px, py, pr, pz, flat] of puffs) {
          const dx = (x - px) / pr, dy = (y - py) / pr;
          if (dx * dx + dy * dy >= 1)
            continue;
          const v = (pr * 0.6 + pz) * Math.sqrt(1 - dx * dx - dy * dy) * (flat ? cut : 1);
          if (v > tower)
            tower = v;
        }
        const fib = fbm12(x * 0.035, y * 0.2, 3, 0) - 0.5;
        const top = anvilTop(x) + 2.2 * fib, bot = anvilBot(x) - 1.5 * fib - 3 * (fbm12(x * 0.2, 7, 2, 0) - 0.5);
        const mid = (top + bot) / 2, half = Math.max(0.5, (bot - top) / 2);
        let anvil = dome(0, (y - mid) / half, Math.min(5, half * 0.9)) * smooth12(58, 72, x + 6 * fib);
        const onTop = anvil > 0 ? smooth12(top + 3.2, top + 0.6, y) : 0;
        if (x > 66 && x < 128 && y > bot - 2 && y < bot + 5) {
          const row = Math.floor((x - 66) / 5.2);
          const off = row * 5.2 + 66 + 2.6 + (hash12(row, 3) - 0.5) * 1.2;
          const py = bot + 0.6 + hash12(row, 4) * 1.2;
          anvil = Math.max(anvil, dome((x - off) / 2.7, (y - py) / 2.3, 2.2) * smooth12(64, 76, x) * smooth12(130, 116, x));
        }
        const solid = tower;
        let h = Math.max(solid, anvil);
        const a = anvil > solid ? smooth12(0, 2, anvil - solid) : 0;
        const billow = fbm12(x * 0.22, y * 0.24, 3, 0) - 0.5;
        const sy = y * 0.18 + 0.9 * (noise12(x * 0.04, 5.5, 0) - 0.5) + x * 0.012;
        const streaky = fbm12(x * 0.03 + 0.6 * noise12(x * 0.08, y * 0.1, 0), sy, 3, 0) - 0.5;
        h += Math.min(1, h / 2.5) * mix12(3 * billow, 2.2 * streaky, a);
        sh[r * SX + i] = Math.max(0, h);
        anv[r * SX + i] = a;
        lip[r * SX + i] = onTop * a;
      }
    }
    const sr = new Float32Array(N), sg = new Float32Array(N), sb = new Float32Array(N);
    const mat = new Uint8Array(N);
    const cloud = new Float32Array(N);
    const dark = new Float32Array(N);
    const darkSky = new Float32Array(N);
    const floorOf = new Float32Array(N);
    const jit = new Float32Array(N);
    for (let k = 0;k < N; k++)
      jit[k] = (hash12(k % W12, (k / W12 | 0) + 517) - 0.5) * ((k / W12 | 0) < HZ6 ? 0.16 : 0.06);
    const glowSun = (x, y) => {
      const dx = x - SUN5[0], dy = y - SUN5[1];
      return Math.exp(-((dx / 48) ** 2) - (dy / 10) ** 2) * 0.9 + Math.exp(-((dx / 95) ** 2) - (dy / 20) ** 2) * 0.26;
    };
    const LX2 = -0.72, LY = -0.3, LZ = 0.62;
    const ground = (x) => HZ6 + 3 - 1.2 * smooth12(20, 70, x) * smooth12(110, 70, x);
    const HX0 = 40, HX1 = 54, HW0 = 58;
    const hb = ground(47);
    const PUMP_X = 66, PUMP_Y = hb - 15;
    const shelfTop = (x) => BASE - 2.4 + 1.2 * (noise12(x * 0.2, 8.1, 0) - 0.5);
    const shelfBot = (x) => BASE + 2.4 + 1.8 * (fbm12(x * 0.12, 8.7, 2, 0) - 0.5) - 2 * smooth12(184, 199, x) - 2 * smooth12(114, 104, x);
    const shelfOn = (x) => smooth12(103, 112, x) * smooth12(199, 190, x);
    for (let r = 0;r < H12; r++) {
      for (let x = 0;x < W12; x++) {
        const k = r * W12 + x;
        const y = r + 0.5;
        if (y < ground(x)) {
          const v = y / HZ6;
          const g = glowSun(x, y);
          const east = smooth12(60, 190, x);
          const v2 = Math.pow(v, 2.2);
          const veil = 0.9 + 0.2 * fbm12(x * 0.05, y * 0.09, 3, 0);
          let cr = (0.045 + 0.2 * v2 * (1 - 0.6 * east)) * veil + 1 * g;
          let cg = (0.045 + 0.09 * v2 * (1 - 0.5 * east)) * veil + 0.56 * g;
          let cb = (0.16 + 0.13 * v2 * (1 - 0.35 * east)) * veil + 0.22 * g;
          const be = smooth12(45, 118, x);
          const band = Math.exp(-(HZ6 + 2 - y) / 11) * (1 - 0.85 * be) * (1 - 0.6 * g);
          cr += band * mix12(0.5, 0.34, be), cg += band * mix12(0.26, 0.21, be), cb += band * mix12(0.26, 0.3, be);
          const under = smooth12(98, 128, x + 8 * (noise12(y * 0.15, 4.4, 0) - 0.5)) * smooth12(BASE - 14, BASE - 1, y);
          const slot = Math.pow(smooth12(BASE + 1.5, HZ6 - 6, y), 0.5) * (0.85 + 0.3 * noise12(x * 0.06, 6.6, 0));
          cr = mix12(cr, mix12(0.035, 0.38, slot) * veil, under * 0.92);
          cg = mix12(cg, mix12(0.032, 0.3, slot) * veil, under * 0.92);
          cb = mix12(cb, mix12(0.075, 0.56, slot) * veil, under * 0.92);
          darkSky[k] = under;
          if (r < SY - 1) {
            const i = x + 2, j = r * SX + i;
            const h = sh[j];
            const c = smooth12(0.15, 1.6, h);
            if (c > 0) {
              const up = r > 0 ? sh[j - SX] : 0, dn = sh[j + SX];
              const gx = (sh[j + 1] - sh[j - 1]) / 2, gy = (dn - up) / 2;
              const nl = Math.sqrt(gx * gx + gy * gy + 1);
              const nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
              const an = anv[j];
              const lam = Math.pow(clamp12(nx * LX2 + ny * LY + nz * LZ), 1.5);
              const vis = 1 - 0.4 * smooth12(22, BASE - 4, y + 5 * (noise12(x * 0.12, 2.2, 0) - 0.5));
              const a = smooth12(8, BASE, y);
              const near = Math.exp(-(((x - SUN5[0]) / 110) ** 2));
              const flank = smooth12(122, 108, x) * (1 - an);
              const sR = 1, sG = mix12(0.84, 0.58, a), sB = mix12(0.58, 0.45, a);
              const ej = 8 * (fbm12(y * 0.14 + x * 0.02, 21.3, 3, 0) - 0.5);
              const lee = 1 - 0.65 * smooth12(towerC(y) - 14 + ej, towerC(y) + towerHW(y) + 16 + ej, x) * (1 - an) * smooth12(anvilBot(x) - 3, anvilBot(x) + 9, y + 5 * (noise12(x * 0.15, 21, 0) - 0.5)) * (y < BASE ? 1 : 0);
              const sun = lam * vis * lee * (0.95 + 0.4 * near) * (1 - 0.3 * flank) * (1 - 0.2 * an);
              const sky = 0.55 + 0.45 * Math.max(0, -ny);
              const bounce = Math.max(0, ny) * (0.2 + 0.45 * near) * (1 - 0.6 * flank) * (1 - 0.5 * an);
              const occ = 1 - 0.35 * smooth12(4, 22, h) * (1 - lam);
              let kr = (0.27 * sky + sR * sun + 0.36 * bounce) * occ;
              let kg = (0.2 * sky + sG * sun + 0.16 * bounce) * occ;
              let kb = (0.45 * sky + sB * sun + 0.16 * bounce) * occ;
              const below = clamp12(ny * 2.2) * an;
              kr *= 1 - 0.42 * below, kg *= 1 - 0.46 * below, kb *= 1 - 0.3 * below;
              const rim = lip[j] * smooth12(196, 120, x) * (0.6 + 0.4 * lam);
              kr = mix12(kr, 0.98, rim * 0.75), kg = mix12(kg, 0.86, rim * 0.75), kb = mix12(kb, 0.64, rim * 0.75);
              const low = clamp12(ny * 1.6 + 0.2) * flank;
              kr = mix12(kr, 0.14, low * 0.65), kg = mix12(kg, 0.11, low * 0.65), kb = mix12(kb, 0.24, low * 0.65);
              const base = smooth12(BASE - 4.5, BASE - 0.5, y) * (1 - an) * (1 - 0.3 * near);
              kr = mix12(kr, 0.03, base * 0.9), kg = mix12(kg, 0.026, base * 0.9), kb = mix12(kb, 0.06, base * 0.9);
              cr = mix12(cr, kr, c), cg = mix12(cg, kg, c), cb = mix12(cb, kb, c);
              cloud[k] = c;
              dark[k] = base * c;
            }
          }
          const on = shelfOn(x);
          if (on > 0 && y > BASE - 5 && y < BASE + 5) {
            const st = shelfTop(x), sbt = shelfBot(x);
            const s = smooth12(st - 1, st + 0.6, y) * smooth12(sbt + 0.6, sbt - 0.8, y) * on;
            if (s > 0) {
              const n = fbm12(x * 0.15, y * 0.5, 2, 0);
              const lit = 0.55 + 0.9 * n * (0.7 + 0.6 * noise12(x * 0.05, y * 1.3, 0)) + 0.9 * smooth12(sbt - 1.6, sbt - 0.2, y);
              cr = mix12(cr, 0.06 * lit, s), cg = mix12(cg, 0.056 * lit, s), cb = mix12(cb, 0.12 * lit, s);
              cloud[k] = Math.max(cloud[k], s);
              dark[k] = Math.max(dark[k], s);
            }
          }
          sr[k] = cr, sg[k] = cg, sb[k] = cb;
          mat[k] = SKY4;
          floorOf[k] = 0.06 - 0.06 * Math.max(darkSky[k], dark[k]);
        } else {
          const g = glowSun(x, HZ6 + 1) * Math.exp(-(y - HZ6) / 3.2);
          mat[k] = y < HZ6 + 4 ? PLAIN : FIELD;
          sr[k] = 0.06 + 0.55 * g, sg[k] = 0.045 + 0.3 * g, sb[k] = 0.08 + 0.1 * g;
          floorOf[k] = 0.06;
        }
        const belt = HZ6 + 2 - (1.5 + 2.2 * fbm12(x * 0.3, 2, 2, 0)) * smooth12(140, 150, x) * smooth12(196, 186, x);
        const belt2 = HZ6 + 2 - (1 + 1.8 * fbm12(x * 0.35, 9, 2, 0)) * smooth12(0, 4, x) * smooth12(18, 10, x);
        if (y >= Math.min(belt, belt2) && y < HZ6 + 3)
          mat[k] = BELT;
        const tx = (x + 0.5 - 31) / 8.5, ty = (y - (hb - 10)) / 7;
        const crown = tx * tx + ty * ty < 1 + 0.35 * (fbm12(x * 0.4, y * 0.4, 2, 0) - 0.5);
        if (crown || Math.abs(x + 0.5 - 31.5) < 1 && y > hb - 6 && y < hb + 1)
          mat[k] = TREE5;
        if (x >= HX0 && x <= HX1 && y >= HW0 && y < hb + 1)
          mat[k] = HOUSE;
        if (y >= HW0 - 7 && y < HW0 && Math.abs(x + 0.5 - 47.5) <= 8.6 - (HW0 - y) * 1.15)
          mat[k] = ROOF4;
        if (x >= 50 && x <= 51 && y >= HW0 - 8 && y < HW0 - 3)
          mat[k] = ROOF4;
        if (x >= 36 && x < HX0 && y >= hb - 4 && y < hb - 3)
          mat[k] = ROOF4;
        if (x === 36 && y >= hb - 3 && y < hb)
          mat[k] = HOUSE;
        if (x >= 49 && x <= 51 && y >= HW0 + 2 && y < HW0 + 5)
          mat[k] = PANE3;
        if (x >= 43 && x <= 44 && y >= HW0 + 2 && y < HW0 + 4)
          mat[k] = PANE3;
        const py = y - PUMP_Y;
        if (py > 2 && y < hb + 0.5) {
          const half = 0.4 + py * 0.11;
          const dx = x + 0.5 - PUMP_X;
          if (Math.abs(Math.abs(dx) - half) < 0.55)
            mat[k] = PUMP;
          if (Math.abs(dx) < half && (py | 0) % 4 === 0)
            mat[k] = PUMP;
        }
      }
    }
    const roadC = (p) => 57 + 62 * Math.pow(p, 1.25);
    const roadW = (p) => 0.6 + 12 * p;
    for (let r = HZ6 + 3;r < H12; r++) {
      const p = (r + 0.5 - HZ6) / (H12 - HZ6);
      for (let x = 0;x < W12; x++) {
        const k = r * W12 + x;
        if (mat[k] !== FIELD)
          continue;
        if (Math.abs(x + 0.5 - roadC(p)) < roadW(p) + 0.6 * (noise12(x * 0.3, r * 0.3, 0) - 0.5))
          mat[k] = ROAD2;
      }
    }
    const VX = 57;
    const TW = 512;
    const wheat = new Float32Array(H12 * TW);
    const persp = new Float32Array(N);
    for (let r = HZ6;r < H12; r++) {
      const p = (r + 0.5 - HZ6) / (H12 - HZ6);
      for (let u = 0;u < TW; u++)
        wheat[r * TW + u] = fbm12(u * 0.55, r * (0.5 - 0.42 * p), 3, TW * 0.55);
      for (let x = 0;x < W12; x++)
        persp[r * W12 + x] = (x + 0.5 - VX) * 24 / (r + 2 - HZ6) + 256;
    }
    const fieldLight = new Float32Array(N);
    for (let r = HZ6;r < H12; r++) {
      const y = r + 0.5;
      const p = (y - HZ6) / (H12 - HZ6);
      for (let x = 0;x < W12; x++) {
        const sunW = Math.exp(-(((x - SUN5[0]) / 100) ** 2));
        const east = smooth12(80, 130, x + 10 * p);
        const fore = 1 - 0.6 * smooth12(H12 - 22, H12 - 2, y);
        fieldLight[r * W12 + x] = (0.72 + 0.45 * sunW) * (1 - 0.35 * east) * fore;
      }
    }
    const GW = 512;
    const gust = new Float32Array(GW * (H12 - HZ6));
    for (let r = HZ6;r < H12; r++)
      for (let u = 0;u < GW; u++)
        gust[(r - HZ6) * GW + u] = smooth12(0.4, 0.7, fbm12(u * 0.025, r * 0.16, 3, GW * 0.025));
    const CW = 400;
    const streak = new Float32Array(CW * HZ6);
    for (let r = 0;r < HZ6; r++)
      for (let u = 0;u < CW; u++) {
        const n = fbm12(u * 0.02, r * 0.2, 4, CW * 0.02);
        streak[r * CW + u] = smooth12(0.64, 0.8, n) * smooth12(40, 46, r) * smooth12(HZ6 - 3, 52, r);
      }
    const stars = [];
    for (let r = 0;r < 28; r++)
      for (let x = 0;x < 100; x++)
        if (hash12(x, r * 5 + 3) > 0.986 && cloud[r * W12 + x] < 0.05)
          stars.push([r * W12 + x, hash12(x, r) * 6.28, 1 + hash12(r, x) * 2.5, 0.85 * (1 - r / 28) * (1 - x / 130)]);
    const star = new Float32Array(N);
    const ears = [];
    for (let x = 2;x < W12; x += 5 + hash12(x | 0, 60) * 4)
      ears.push([x, 8 + hash12(x * 3, 61) * 12, hash12(x * 7, 62) * 6.28, hash12(x * 5, 63) * 6, 5 + (hash12(x, 64) > 0.5 ? 1 : 0)]);
    const ear = new Float32Array(N);
    const touched = [];
    const RW = 256;
    const shafts = new Float32Array(RW);
    for (let u = 0;u < RW; u++)
      shafts[u] = smooth12(0.47, 0.57, fbm12(u * 0.09375, 0.5, 2, 24));
    const colPhase = new Float32Array(W12), colSpeed = new Float32Array(W12);
    for (let x = 0;x < W12; x++)
      colPhase[x] = hash12(x, 77) * 40, colSpeed[x] = 22 + hash12(x, 78) * 14;
    const rainTop = new Float32Array(W12), rainOn = new Float32Array(W12);
    for (let x = 0;x < W12; x++)
      rainTop[x] = shelfBot(x) - 1.5, rainOn[x] = smooth12(106, 118, x) * smooth12(198, 186, x);
    const PERIOD = 3.1;
    const bolts = [];
    for (let i = 0;i < 4; i++) {
      const segs = [];
      const walk = (x, y, len, lean, depth) => {
        for (let s = 0;s < len && y < HZ6 + 2; s++) {
          const nx = x + (hash12(i * 97 + s, depth * 13 + 41) - 0.5) * 3.2 + lean;
          const ny = y + 0.9 + hash12(i * 31 + s, depth + 42) * 1.3;
          segs.push([x, y, nx, ny, depth]);
          if (depth === 0 && hash12(i * 7 + s, 43) > 0.84)
            walk(nx, ny, 3 + hash12(s, i) * 5, (hash12(s, i + 9) - 0.5) * 2.4, 1);
          x = nx, y = ny;
        }
      };
      walk(122 + hash12(i, 40) * 34, BASE - 4, 40, (hash12(i, 44) - 0.5) * 0.8, 0);
      const field = new Float32Array(N).fill(99);
      for (let r = 25;r < HZ6 + 4; r++)
        for (let x2 = 80;x2 < W12; x2++) {
          let m = 99;
          for (const [ax, ay, bx, by, dep] of segs) {
            if (Math.abs(x2 - ax) > 14 && Math.abs(x2 - bx) > 14)
              continue;
            const d = segDist(x2 + 0.5, r + 0.5, ax, ay, bx, by) + dep * 0.5;
            if (d < m)
              m = d;
          }
          field[r * W12 + x2] = m;
        }
      bolts.push({ x: segs[0][0], field });
    }
    const flashAt = (t) => {
      const n = Math.floor(t / PERIOD);
      if (n > 0 && hash12(n, 50) < 0.25)
        return null;
      const start = n === 0 ? -0.08 : n * PERIOD + 0.2 + hash12(n, 51) * 1.6;
      const l = t - start;
      if (l < 0 || l > 0.9)
        return null;
      let I = 0;
      const strikes = [0, 0.09 + hash12(n, 52) * 0.06, 0.32 + hash12(n, 53) * 0.2];
      for (let j = 0;j < 3; j++)
        if (l >= strikes[j])
          I += Math.exp(-(l - strikes[j]) / (j === 0 ? 0.09 : 0.06)) * (j === 0 ? 1 : 0.7 - j * 0.15);
      const bolt = n === 0 || hash12(n, 54) > 0.55 ? bolts[n % 4] : null;
      const cx = bolt ? bolt.x : 115 + hash12(n, 55) * 45;
      const cy = bolt ? BASE - 8 : 14 + hash12(n, 56) * 24;
      return { I: Math.min(1.3, I), bolt, cx, cy, boltOn: bolt && l < 0.5 ? Math.min(1, I * 1.4) : 0, inside: 0 };
    };
    const FL = 1.6;
    const flickerAt = (t) => {
      const n0 = Math.floor(t / FL);
      for (let n = n0;n >= n0 - 1 && n >= 0; n--) {
        const l = t - (n * FL + 0.35 + hash12(n, 70) * 0.75);
        if (l < 0 || l > 0.6)
          continue;
        let I = 0;
        const pulses = [0, 0.08 + hash12(n, 71) * 0.1, 0.26 + hash12(n, 72) * 0.18];
        for (let j = 0;j < 3; j++)
          if (l >= pulses[j])
            I += Math.exp(-(l - pulses[j]) / 0.07) * (j === 1 ? 0.7 : j === 2 ? 0.45 : 1);
        return { I: Math.min(1, I) * (0.25 + 0.2 * hash12(n, 73)), bolt: null, cx: 120 + hash12(n, 74) * 38, cy: 15 + hash12(n, 75) * 25, boltOn: 0, inside: 1 };
      }
      return null;
    };
    return (t, { color } = {}) => {
      let f = flashAt(t);
      const fl = flickerAt(t);
      if (fl && (!f || f.I < fl.I))
        f = fl;
      const I = f ? f.I : 0;
      const inside2 = f ? f.inside : 0;
      const drift = t * 1.2;
      const shaftOff = t * 0.9;
      const gOff = t * 9;
      for (const [k, ph, sp, a] of stars)
        star[k] = a * (0.55 + 0.45 * Math.sin(t * sp + ph));
      for (const k of touched)
        ear[k] = 0;
      touched.length = 0;
      for (const [ex, eh, ph, foot, hl] of ears) {
        const gu = gust[(H12 - 1 - HZ6) * GW + (((ex | 0) - Math.floor(gOff * 1.5)) % GW + GW) % GW];
        const lean = 0.7 + 0.7 * Math.sin(t * 1.7 + ph) + 1.8 * gu;
        const tall = eh + hl;
        for (let i = 0;i < tall; i++) {
          const y = Math.round(H12 + foot - i);
          if (y >= H12)
            continue;
          const q = i / tall;
          const x = Math.round(ex + lean * q * q);
          if (x < 0 || x + 1 >= W12)
            continue;
          const k = y * W12 + x;
          if (i < eh) {
            if (ear[k] === 0)
              ear[k] = -1, touched.push(k);
          } else {
            const j = i - eh;
            const tip = j === hl - 1;
            const v = tip ? 0.55 : j === 0 ? 0.7 : 1 - 0.18 * (j & 1);
            if (v > ear[k])
              ear[k] = v, touched.push(k);
            if (!tip && j > 0 && v * 0.82 > ear[k + 1])
              ear[k + 1] = v * 0.82, touched.push(k + 1);
            if (tip && y > 0) {
              const a = k - W12 + (lean > 0.5 ? 1 : 0);
              if (ear[a] < 0.3)
                ear[a] = 0.3, touched.push(a);
            }
          }
        }
      }
      for (let r = 0;r < H12; r++) {
        const y = r + 0.5;
        const p = (y - HZ6) / (H12 - HZ6);
        for (let x = 0;x < W12; x++) {
          const k = r * W12 + x;
          const m = mat[k];
          let cr = sr[k], cg = sg[k], cb = sb[k];
          let floor = floorOf[k], fade = 1, rain = 0;
          if (m === SKY4) {
            const c = cloud[k];
            if (c < 0.98 && r < HZ6) {
              const sx = x + drift, ix = Math.floor(sx), fx = sx - ix;
              const s0 = streak[r * CW + ix % CW], s1 = streak[r * CW + (ix + 1) % CW];
              const s = (s0 + (s1 - s0) * fx) * (1 - c) * smooth12(105, 55, x) * 0.75;
              if (s > 0.005) {
                const sun = Math.exp(-(((x - SUN5[0]) / 80) ** 2));
                cr = mix12(cr, 0.5 + 0.5 * sun, s);
                cg = mix12(cg, 0.24 + 0.36 * sun, s);
                cb = mix12(cb, 0.34 + 0.06 * sun, s);
              }
              if (star[k]) {
                const v = star[k] * (1 - c);
                cr = Math.max(cr, v * 0.9), cg = Math.max(cg, v * 0.88), cb = Math.max(cb, v);
              }
            }
            const on = rainOn[x];
            if (on > 0 && y > rainTop[x]) {
              const u = x + (y - BASE) * 0.42 - shaftOff;
              const ui = (Math.floor(u) % RW + RW) % RW;
              const env = shafts[ui] * on * smooth12(rainTop[x], rainTop[x] + 3, y) * (1 - c * 0.7);
              if (env > 0.01) {
                const col = Math.floor(x + (y - BASE) * 0.42) % W12;
                const fall = (y * 0.4 - t * colSpeed[col] * 0.1 + colPhase[col] + 1000) % 4;
                const lit = fall < 1.4 ? 1 : 0;
                rain = env;
                cr = mix12(cr, 0.06 + 0.07 * lit, env * 0.88);
                cg = mix12(cg, 0.065 + 0.075 * lit, env * 0.88);
                cb = mix12(cb, 0.12 + 0.1 * lit, env * 0.88);
              }
            }
          } else if (m === FIELD || m === PLAIN) {
            const gi = (r - HZ6) * GW + ((x - Math.floor(gOff * (0.5 + p))) % GW + GW) % GW;
            const gu = gust[gi];
            const g = sr[k] - 0.06;
            if (m === FIELD) {
              const sway = 0.5 * Math.sin(t * 2.1 + x * 0.05 + r * 0.17) + 2.2 * gu;
              const u = persp[k] + sway;
              const ui = Math.floor(u), uf = u - ui;
              const a0 = wheat[r * TW + (ui & 511)], a1 = wheat[r * TW + (ui + 1 & 511)];
              const tex = a0 + (a1 - a0) * uf;
              const v = clamp12(0.55 + (tex - 0.5) * (0.9 + 1.4 * p));
              const L = (v * 0.7 + 0.4 * gu) * fieldLight[k];
              cr = 0.04 + 0.7 * L + 0.9 * g;
              cg = 0.03 + 0.48 * L + 0.48 * g;
              cb = 0.035 + 0.18 * L + 0.12 * g;
              fade = smooth12(H12 + 10, H12 - 8, y);
            } else {
              const v = 0.75 + 0.45 * gu;
              cr *= v, cg *= v, cb *= v;
            }
            floor = 0.05;
          } else if (m === ROAD2) {
            const sun = 0.5 + 0.5 * Math.exp(-(((x - SUN5[0]) / 110) ** 2));
            const rut = Math.abs(Math.abs(x + 0.5 - roadC(p)) - roadW(p) * 0.45) < 0.4 + p * 0.8 ? 0.6 : 1;
            const L = (0.6 + 0.3 * noise12(x * 0.5, r * 0.5, 0)) * sun * rut * (1 - 0.65 * p);
            cr = 0.08 + 0.42 * L, cg = 0.06 + 0.3 * L, cb = 0.07 + 0.26 * L;
            fade = smooth12(H12 + 10, H12 - 8, y);
            floor = 0.05;
          } else if (m === BELT) {
            const h = smooth12(130, 190, x);
            cr = mix12(0.07, 0.1, h), cg = mix12(0.05, 0.1, h), cb = mix12(0.1, 0.17, h);
            floor = 0.06;
          } else if (m === TREE5) {
            const rim = noise12(x * 0.6, y * 0.6, 0);
            cr = 0.06 + 0.06 * rim, cg = 0.04 + 0.03 * rim, cb = 0.07 + 0.04 * rim;
            floor = 0.03;
          } else if (m === HOUSE || m === PUMP) {
            const rim = m === HOUSE && x === HX0 ? 0.18 : 0;
            cr = 0.07 + rim, cg = 0.05 + rim * 0.55, cb = 0.09 + rim * 0.3;
            floor = 0.03;
          } else if (m === ROOF4) {
            cr = 0.1, cg = 0.06, cb = 0.1;
            floor = 0.03;
          } else if (m === PANE3) {
            const g = 0.88 + 0.12 * Math.sin(t * 2.3 + x) * Math.sin(t * 3.7);
            const small = x < 46 ? 0.6 : 1;
            cr = g * small, cg = 0.72 * g * small, cb = 0.3 * g * small;
            floor = 0.3;
          }
          const e = ear[k];
          if (e > 0) {
            const sunW = Math.exp(-(((x - SUN5[0]) / 120) ** 2));
            const L = e * (0.5 + 0.5 * sunW);
            cr = 0.95 * L, cg = 0.68 * L, cb = 0.3 * L, fade = 1, floor = 0.1;
          }
          const wx = x + 0.5 - PUMP_X, wy = y - PUMP_Y;
          if (wx > -4 && wx < 7 && wy > -4 && wy < 4) {
            const wd = Math.sqrt(wx * wx + wy * wy);
            if (wd < 3.6 && wd > 0.4 && (Math.cos((Math.atan2(wy, wx) - t * 1.6) * 8) > 0.2 || wd < 1))
              cr = 0.07, cg = 0.05, cb = 0.09, floor = 0.03;
            if (wy > -1 && wy < 0.6 && wx > 2)
              cr = 0.07, cg = 0.05, cb = 0.09, floor = 0.03;
          }
          const lx = x + 0.5 - 50.5, ly = y - (HW0 + 3.5);
          if (m !== PANE3 && lx * lx + ly * ly < 200) {
            const lg = Math.exp(-Math.sqrt(lx * lx + ly * ly * 2) / 3) * 0.5;
            cr += lg, cg += lg * 0.66, cb += lg * 0.25;
          }
          if (I > 0.01) {
            const dx = x - f.cx, dy = (y - f.cy) * 1.3;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const c = m === SKY4 ? cloud[k] : 0;
            const inner = inside2 ? Math.exp(-dist / 14) * c * I * 2 : Math.exp(-dist / 16) * (0.3 + 0.7 * c) * I * 1.3;
            const back = m === SKY4 ? (dark[k] * 0.5 + rain * 0.8) * Math.exp(-Math.abs(dx) / 34) * I * (inside2 ? 0.5 : 1) : 0;
            const amb = inside2 ? 0 : I * (m === SKY4 ? 0.08 : 0.05);
            const lw = inner + back;
            cr += 0.75 * lw + amb * 0.8, cg += 0.72 * lw + amb * 0.8, cb += 1 * lw + amb;
            if (f.boltOn) {
              const d = f.bolt.field[k];
              if (d < 12 && (c < 0.6 || y > BASE - 1)) {
                const core = smooth12(1.1, 0.35, d) * f.boltOn;
                const glow = (Math.exp(-d / 2) * 0.55 + Math.exp(-d / 7) * 0.2) * f.boltOn;
                cr += core + glow * 0.75, cg += core + glow * 0.72, cb += core + glow;
              }
            }
          }
          if (e < 0) {
            out[k] = DOTS12[1];
            if (color)
              color[k] = STALK;
            continue;
          }
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp12(floor + (1 - floor) * peak * 0.97 + jit[k]) * fade;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER12[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS12[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.04) / COVER12[step]) : 0;
            const s = Math.min(0.14 + 0.86 * want, 0.45 + 0.8 * level) / peak;
            color[k] = nearest(clamp12(cr * s), clamp12(cg * s), clamp12(cb * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H12; r++)
        lines.push(out.slice(r * W12, (r + 1) * W12).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/taj-dawn.ts
  var exports_taj_dawn = {};
  __export(exports_taj_dawn, {
    default: () => tajDawn,
    meta: () => meta13
  });
  var meta13 = {
    name: "taj dawn",
    category: "scenes",
    note: "the taj mahal at sunrise, mirrored in its pool through morning haze",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#0d0a13",
    palette: [
      "#2e2a55",
      "#3d3870",
      "#514a8a",
      "#6a62a3",
      "#8a83bd",
      "#5a3a5e",
      "#7a4d72",
      "#9a6284",
      "#b97a92",
      "#d495a2",
      "#b8705a",
      "#d98d66",
      "#efab78",
      "#f8c98e",
      "#ffe2ae",
      "#fff3d8",
      "#fffcf2",
      "#8e7f9e",
      "#ad9cb4",
      "#cbb6c4",
      "#e3cdd2",
      "#f3e0dc",
      "#2a4a3e",
      "#36584a",
      "#4a6c58",
      "#66845f",
      "#8a9a68",
      "#8a4a3e",
      "#b0624a",
      "#3a2f4a",
      "#4e3d5a",
      "#f6d6c0",
      "#e9bfae",
      "#5e6a40",
      "#7d8a52",
      "#a3a064",
      "#c2b274"
    ]
  };
  var W13 = 200;
  var H13 = 100;
  var CX = 128;
  var BASE2 = 68;
  var HZ7 = 60;
  var S = 0.7;
  var SUN6 = [36, 40];
  var MX = 45;
  var MB = 67;
  var KR = 1.55;
  var DOTS13 = " ·•●";
  var COVER13 = [0, 0.3, 0.6, 1];
  var BAYER13 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var SKY5 = 0;
  var BGTREE = 1;
  var MARBLE = 2;
  var LAWN = 3;
  var WALK = 4;
  var POOL = 5;
  var CYPRESS = 6;
  var MOSQUE = 7;
  function hash13(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise13(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash13(x0, yi), b = hash13(x1, yi), c = hash13(x0, yi + 1), d = hash13(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm13(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise13(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp13 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth13 = (a, b, v) => {
    const k = clamp13((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix13 = (a, b, k) => a + (b - a) * k;
  var hex13 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var onion = (h) => h < 0.3 ? 0.8 + 0.2 * Math.sin(h / 0.3 * Math.PI * 0.5) : Math.pow(Math.cos((h - 0.3) / 0.7 * Math.PI * 0.5), 1.45);
  var arch = (w, h) => {
    if (h <= 0)
      return w;
    const c = w * 0.5, R = w + c;
    const q = R * R - h * h;
    return q > 0 ? Math.max(0, Math.sqrt(q) - c) : 0;
  };
  function taj(X, Y) {
    const ax = Math.abs(X);
    const left = X < 0 ? 1 : -1;
    if (Y >= 72 && Y < 80.5 && ax <= 0.75 + (Math.abs(Y - 74.5) < 0.9 ? 0.6 : 0) + (Math.abs(Y - 77) < 0.7 ? 0.4 : 0))
      return [0.75 + 0.2 * left, 0];
    if (Y >= 47.5 && Y < 72) {
      const h = (Y - 47.5) / 24.5;
      const hw = 15 * onion(h);
      if (ax <= hw) {
        const nx = X / (hw + 0.01);
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
        return [clamp13(0.3 + 0.5 * (-0.8 * nx + 0.4 * nz) + 0.2 * h), 0];
      }
    }
    const cx = ax - 17.5;
    if (Math.abs(cx) <= 4.4 && Y >= 39.5 && Y < 55.5) {
      const nx = (X < 0 ? -cx : cx) / 4.4;
      if (Y < 41)
        return [clamp13(0.5 - 0.4 * nx * left), 0];
      if (Y < 46.5) {
        if (Math.abs(cx) > 3.6)
          return null;
        const open = Math.abs(cx) < 2.6 && Math.abs(cx) > 0.6 && Y < 45.5;
        return [clamp13(0.5 - 0.45 * (X < 0 ? -cx : cx) / 4 * left), open ? 0.75 : 0];
      }
      if (Y < 47.3)
        return [clamp13(0.55 - 0.4 * nx * left), 0];
      const h = (Y - 47.3) / 6.5;
      if (h < 1 && Math.abs(cx) <= 4 * onion(h))
        return [clamp13(0.55 - 0.6 * ((X < 0 ? -cx : cx) / (4 * onion(h) + 0.01)) * left + 0.1 * h), 0];
      if (h >= 1 && Math.abs(cx) < 0.6)
        return [0.6, 0];
    }
    if (Y >= 40 && Y < 47.5 && ax <= 12.2) {
      const nx = X / 12.2;
      const band = Y > 45.8 ? 0.15 : 0;
      return [clamp13(0.45 - 0.55 * nx + band), 0];
    }
    if (Math.abs(ax - 8.8) < 0.75 && Y >= 40 && Y < 47.5 || Math.abs(ax - 28.2) < 0.75 && Y >= 38 && Y < 44.5)
      return [0.55 + 0.25 * left, 0];
    if (ax <= 28.5 && Y >= 7 && Y < 40) {
      if (Y >= 38.5 && ax > 9 && Math.floor((ax + 0.5) / 1.5) & 1)
        return null;
      if (ax <= 9) {
        const hw = arch(6, Y - 25);
        if (ax <= hw && Y < 25 + 9) {
          const door = ax <= 3.2 && ax <= arch(3.2, Y - 15.5);
          return [0.35 + 0.15 * left, door ? 0.82 : 0.6 + 0.12 * (1 - smooth13(25, 33, Y))];
        }
        if (ax <= hw + 0.8 && Y < 25 + 10.2)
          return [0.42, 0.35];
        if (ax > 7.6 && ax <= 9 && Y < 40)
          return [0.5 + 0.12 * left, 0.08];
        return [0.5 + 0.08 * left, 0];
      }
      if (ax <= 21) {
        const nx2 = ax - 15;
        for (const [y0, y1] of [[9, 21.5], [24.5, 37]]) {
          if (Y >= y0 && Y < y1 && Math.abs(nx2) <= arch(3.6, Y - (y1 - 4.5)))
            return [0.4 + 0.1 * left, 0.5];
          if (Y >= y0 - 0.6 && Y < y1 + 0.6 && Math.abs(nx2) <= arch(4.3, Y - (y1 - 4.2)) && Math.abs(nx2) > 3.6)
            return [0.45, 0.22];
        }
        return [0.5 + 0.1 * left, 0];
      }
      const lit = 0.5 + 0.48 * left;
      const nx = ax - 24.7;
      for (const [y0, y1] of [[9, 21.5], [24.5, 37]]) {
        if (Y >= y0 && Y < y1 && Math.abs(nx) <= arch(2.2, Y - (y1 - 3)))
          return [lit * 0.7, 0.45];
      }
      return [lit, 0];
    }
    const mx = ax - 44;
    if (Y >= 7 && Y < 57) {
      const s = X < 0 ? -mx : mx;
      const hw = 2.9 - 0.6 * (Y - 7) / 40;
      for (const g of [19.5, 32, 44.5]) {
        if (Y >= g && Y < g + 1.4 && Math.abs(mx) <= hw + 1.1)
          return [clamp13(0.5 - 0.42 * s / (hw + 1.1) * left), Y < g + 0.5 ? 0.35 : 0];
      }
      if (Y < 46 && Math.abs(mx) <= hw)
        return [clamp13(0.5 - 0.48 * (s / hw) * left), 0];
      if (Y >= 45.9 && Y < 49.5 && Math.abs(mx) <= 2.2)
        return [clamp13(0.5 - 0.4 * s / 2.2 * left), Math.abs(mx) < 1.4 && Math.abs(mx) > 0.3 ? 0.7 : 0];
      if (Y >= 49.5) {
        const h = (Y - 49.5) / 4.5;
        if (h < 1 && Math.abs(mx) <= 2.5 * onion(h))
          return [clamp13(0.55 - 0.55 * s / (2.5 * onion(h) + 0.01) * left), 0];
        if (h >= 1 && Y < 56 && Math.abs(mx) < 0.5)
          return [0.6, 0];
      }
    }
    if (ax <= 47.5 && Y >= 0 && Y < 7) {
      if (Y > 6.2)
        return [0.62, 0];
      const k = ax % 5.2 - 2.6;
      if (Y > 1.5 && Y < 5.2 && Math.abs(k) < 1.1)
        return [0.42, 0.3];
      return [0.52, 0];
    }
    return null;
  }
  function mosque(xc, y) {
    const dx = xc - MX, ax = Math.abs(dx);
    if (y >= MB - 2.5 && y < MB && ax <= 22)
      return 0;
    const tx = Math.abs(ax - 19.5);
    if (tx <= 1.3 && y >= MB - 13 && y < MB - 2.5)
      return 0;
    if (y >= MB - 15.5 && y < MB - 13) {
      const h = (MB - 13 - y) / 2.5;
      if (tx <= 1.8 * onion(h))
        return 1;
    }
    if (tx < 0.35 && y >= MB - 16.5 && y < MB - 15.5)
      return 1;
    if (ax <= 5.5 && y >= MB - 15 && y < MB - 2.5) {
      if (y < MB - 14.3 && Math.floor(xc) & 1)
        return -1;
      if (ax <= arch(3.4, MB - 9.5 - y) && y >= MB - 13.5)
        return 2;
      return 0;
    }
    if (ax <= 18 && y >= MB - 10 && y < MB - 2.5) {
      const bay = (ax - 5.5) % 4.2 - 2.1;
      if (ax > 6 && y >= MB - 8.5 && Math.abs(bay) <= arch(1.4, MB - 6.2 - y))
        return 2;
      return 0;
    }
    if (ax <= 18 && y >= MB - 10.8 && y < MB - 10 && Math.floor(xc * 0.75) & 1)
      return 0;
    const sx = Math.abs(ax - 11.5);
    if (sx <= 2.6 && y >= MB - 12 && y < MB - 10)
      return 0;
    if (y >= MB - 17 && y < MB - 12) {
      const h = (MB - 12 - y) / 5;
      if (sx <= 3.6 * onion(h))
        return 1;
    }
    if (sx < 0.35 && y >= MB - 18.5 && y < MB - 17)
      return 1;
    if (ax <= 4 && y >= MB - 16.5 && y < MB - 15)
      return 0;
    if (y >= MB - 23.5 && y < MB - 16.5) {
      const h = (MB - 16.5 - y) / 7;
      if (ax <= 5.2 * onion(h))
        return 1;
    }
    if (ax < 0.4 && y >= MB - 25.5 && y < MB - 23.5)
      return 1;
    return -1;
  }
  function tajDawn() {
    const P = meta13.palette.map(hex13);
    const N = W13 * H13;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const mat = new Uint8Array(N);
    const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    const floorA = new Float32Array(N).fill(0.12);
    const hazeW = new Float32Array(N);
    const glowA = new Float32Array(N);
    const sunGlow = (x, y) => {
      const dx = x - SUN6[0], dy = (y - SUN6[1]) * 1.25;
      const d = Math.sqrt(dx * dx + dy * dy);
      return Math.exp(-d / 4) * 0.9 + Math.exp(-d / 13) * 0.42 + Math.exp(-d / 40) * 0.3;
    };
    const skyAt = (x, y) => {
      const v = clamp13(y / HZ7);
      const up = smooth13(0.05, 0.8, v);
      let r = mix13(0.055, 0.3, up), g = mix13(0.05, 0.19, up), b = mix13(0.17, 0.36, up);
      const low = smooth13(0.62, 1, v);
      r = mix13(r, 0.66, low), g = mix13(g, 0.4, low), b = mix13(b, 0.42, low);
      const far = smooth13(50, 200, x) * 0.18;
      r *= 1 - far, g *= 1 - far * 0.8, b *= 1 - far * 0.3;
      const glow = sunGlow(x, y) + Math.exp(-Math.abs(y - 57) / 5) * 0.25 * Math.exp(-Math.abs(x - SUN6[0]) / 50);
      r += glow * 1, g += glow * 0.78, b += glow * 0.48;
      const ang = Math.atan2(y - SUN6[1], x - SUN6[0]);
      const ray = fbm13(ang * 9 + 3, 1.7, 2, 0);
      const rd = Math.hypot(x - SUN6[0], y - SUN6[1]);
      const shaft = smooth13(0.5, 0.75, ray) * Math.exp(-rd / 45) * smooth13(4, 14, rd) * 0.12;
      r += shaft, g += shaft * 0.8, b += shaft * 0.55;
      return [r, g, b];
    };
    const CW = 400, CH = 50;
    const banks = [
      [76, 28, 40, 7, 3.5, 1.4],
      [152, 36, 52, 9, 4, 1],
      [16, 13, 32, 4, 2.5, 0.8],
      [250, 24, 40, 8, 4, 1],
      [330, 33, 36, 7, 4, 0.95]
    ];
    const cdens = (x, y) => {
      const q = fbm13(x * 0.01, y * 0.04, 2, CW * 0.01);
      const n = fbm13(x * 0.025 + q * 1.6, y * 0.075 + q * 0.6, 5, CW * 0.025);
      let m = 0;
      for (const [bx, by, rx, up, down, a] of banks) {
        let dx = x - bx;
        dx -= Math.round(dx / CW) * CW;
        const ex = dx / rx, ey = (y - by) / (y < by ? up : down);
        const e = Math.exp(-ex * ex * ex * ex - ey * ey) * a;
        if (e > m)
          m = e;
      }
      return 0.62 * m + 1.4 * (n - 0.5) + 0.02;
    };
    const cloud = new Float32Array(CW * CH);
    const cloudLit = new Float32Array(CW * CH);
    for (let r = 0;r < CH; r++) {
      for (let x = 0;x < CW; x++) {
        const y = r + 0.5;
        const d = cdens(x, y);
        cloud[r * CW + x] = smooth13(0.46, 0.66, d);
        const toward = cdens(x - 2, y + 2.5);
        cloudLit[r * CW + x] = clamp13(0.56 + (d - toward) * 0.75 - (d - 0.6) * 0.2 + 0.7 * (fbm13(x * 0.09, y * 0.2, 2, CW * 0.09) - 0.5));
      }
    }
    const crowns = [];
    for (let x = -12, i = 0;x < W13 + 12; x += 4 + hash13(i, 60) * 5, i++) {
      const rad = 3 + hash13(i, 61) * 4.5;
      crowns.push([x, 60.5 - hash13(i, 62) * 2.5 - 2.5 * fbm13(x * 0.03, 2, 2, 0) + rad * 0.35, rad]);
    }
    const tops = new Float32Array(W13);
    for (let x = 0;x < W13; x++) {
      let t0 = 64;
      for (const [cx, cy, rad] of crowns) {
        const dx = x + 0.5 - cx;
        if (Math.abs(dx) < rad)
          t0 = Math.min(t0, cy - Math.sqrt(rad * rad - dx * dx) * 0.75);
      }
      tops[x] = t0 - 0.6 * fbm13(x * 0.5, 7, 2, 0);
    }
    const treeTop = (x) => tops[Math.min(W13 - 1, Math.max(0, Math.floor(x)))];
    const poolHalf = (y) => 0.5 * (y - HZ7) + 1;
    const walkHalf = (y) => 0.7 * (y - HZ7) + 1.5;
    const trees = [];
    for (const s of [8.5, 10.4, 13, 16.8, 22.5, 31]) {
      for (const side of [-1, 1]) {
        for (const [off, tall] of [[4.3, 0.8], [2.45, 1]]) {
          if (off > 3 && (s > 20 || side > 0))
            continue;
          if (side < 0 && s > 30)
            continue;
          const cxp = CX + side * off * s;
          trees.push({ x: cxp + (hash13(s * 10, side + off) - 0.5) * 0.6, base: HZ7 + s, h: 1.6 * tall * s * (0.94 + 0.12 * hash13(s * 7, side + 3 + off)), w: 0.26 * s, s });
        }
      }
    }
    const shadowAt = (xc, y) => {
      let lit = 1;
      for (const tr of trees) {
        const dx = xc - tr.x, dy = y - tr.base;
        if (dy < -0.5)
          continue;
        const along = (dx * 0.6 + dy * 0.8) / tr.s;
        const across = (dx * 0.8 - dy * 0.6) / tr.s;
        if (along > 0 && along < 3 && Math.abs(across) < 0.17 * (1 - along / 3.4) + 0.03)
          lit *= 0.08 + 0.92 * smooth13(1.6, 3, along);
      }
      return lit;
    };
    const mq = new Int8Array(N).fill(-1);
    for (let r = MB - 27;r < MB; r++)
      for (let x = MX - 24;x <= MX + 24; x++)
        mq[r * W13 + x] = mosque(x + 0.5, r + 0.5);
    for (let r = 0;r < H13; r++) {
      for (let x = 0;x < W13; x++) {
        const k = r * W13 + x;
        const y = r + 0.5, xc = x + 0.5;
        let m = SKY5, cr, cg, cb, fl = 0.18, hz = 0;
        const tt = treeTop(xc);
        if (y < BASE2 && y >= tt) {
          m = BGTREE;
        } else if (y >= BASE2) {
          const dx = Math.abs(xc - CX);
          m = dx < poolHalf(y) ? POOL : dx < walkHalf(y) ? WALK : LAWN;
        }
        if (m === SKY5) {
          [cr, cg, cb] = skyAt(xc, y);
          const veil = 0.88 + 0.24 * fbm13(xc * 0.05, y * 0.09, 3, 0);
          cr *= veil, cg *= veil, cb *= veil;
          glowA[k] = sunGlow(xc, y);
          hz = 0.5 + 0.5 * smooth13(20, 58, y);
          fl = 0.05 + 0.13 * smooth13(18, 42, y);
        } else if (m === BGTREE) {
          const tex = fbm13(xc * 0.25, y * 0.3, 3, 0);
          const depth = smooth13(tt, BASE2, y);
          const sky = skyAt(xc, tt);
          const a = 0.46 - 0.12 * depth + 0.12 * tex;
          cr = mix13(0.1, sky[0], a), cg = mix13(0.09, sky[1], a), cb = mix13(0.15, sky[2], a);
          const rim = smooth13(tt + 1.8, tt, y) * Math.exp(-Math.abs(xc - SUN6[0]) / 18);
          cr += 0.4 * rim, cg += 0.27 * rim, cb += 0.14 * rim;
          const patch = 0.45 + 0.75 * smooth13(0.3, 0.7, fbm13(xc * 0.035 + 11, y * 0.18, 3, 0));
          const mist = smooth13(tt + 1, BASE2 + 1, y) * 0.75 * Math.min(1, patch);
          const mw = Math.exp(-Math.abs(xc - SUN6[0]) / 90);
          cr = mix13(cr, 0.62 + 0.25 * mw, mist), cg = mix13(cg, 0.46 + 0.16 * mw, mist), cb = mix13(cb, 0.55 + 0.02 * mw, mist);
          fl = 0.1;
          hz = 0.8;
        } else if (m === LAWN) {
          const v = (y - BASE2) / (H13 - BASE2);
          const u = (xc - CX) / (y - HZ7);
          const tex = fbm13(u * 3, 40 / (y - HZ7), 3, 0);
          const stripe = Math.floor(u * 1.4) & 1 ? 1 : 0.55;
          let lit = (0.6 + 0.4 * Math.exp(-Math.abs(xc - SUN6[0]) / 60)) * stripe * (0.85 + 0.3 * tex);
          lit *= shadowAt(xc, y);
          const vig = 1 - 0.45 * smooth13(0.5, 1, v) * (0.6 + 0.4 * smooth13(40, 0, Math.min(xc, W13 - xc)));
          const fall = 1 - 0.35 * v;
          const warm = Math.exp(-Math.abs(xc - SUN6[0]) / 80);
          const amb = 0.75 + 0.5 * stripe - 0.25 * v;
          cr = (0.12 * amb + 0.56 * lit * fall) * vig;
          cg = (0.09 * amb + (0.36 + 0.14 * warm) * lit * fall) * vig;
          cb = (0.24 * amb + (0.26 - 0.1 * warm) * lit * fall) * vig;
          const far = smooth13(BASE2 + 10, BASE2, y) * 0.7;
          const mw = Math.exp(-Math.abs(xc - SUN6[0]) / 90);
          cr = mix13(cr, 0.62 + 0.25 * mw, far), cg = mix13(cg, 0.46 + 0.16 * mw, far), cb = mix13(cb, 0.55 + 0.02 * mw, far);
          fl = 0.1;
          hz = 0.7 * (1 - v);
        } else if (m === WALK) {
          const v = (y - BASE2) / (H13 - BASE2);
          const lit = xc < CX ? 1 : 0.86;
          const joint = (90 / (y - HZ7) % 1 < 0.14 ? 0.72 : 1) * (0.5 + 0.5 * shadowAt(xc, y));
          cr = (0.78 - 0.22 * v) * lit * joint, cg = (0.57 - 0.16 * v) * lit * joint, cb = (0.53 - 0.12 * v) * lit * joint;
          fl = 0.15;
          hz = 0.3;
        } else {
          fl = 0.15;
        }
        const q = mq[k];
        if (q >= 0) {
          m = MOSQUE;
          const sg = sunGlow(xc, y);
          const isDome = q === 1;
          let a = isDome ? [0.2, 0.11, 0.19] : [0.31, 0.13, 0.15];
          if (q === 2)
            a = [0.07, 0.04, 0.07];
          const air = 0.06 + 0.3 * smooth13(MB - 8, MB, y);
          cr = mix13(a[0], 0.62, air), cg = mix13(a[1], 0.44, air), cb = mix13(a[2], 0.5, air);
          const lft = x > 0 ? mq[k - 1] : -1, up = r > 0 ? mq[k - W13] : -1;
          const toward = xc < SUN6[0] ? x < W13 - 1 ? mq[k + 1] : -1 : lft;
          let rim = (up < 0 ? 0.75 : 0) + (toward < 0 ? 0.9 : 0) + (lft < 0 && up < 0 ? 0.2 : 0);
          rim = Math.min(1, rim) * Math.min(1, 0.25 + sg * 1.6);
          cr = mix13(cr, 1, rim * 0.8), cg = mix13(cg, 0.7, rim * 0.8), cb = mix13(cb, 0.48, rim * 0.8);
          fl = 0.04;
          hz = 0.15;
        }
        if (y < BASE2 + 0.01) {
          const t = taj((xc - CX) / S, (BASE2 - y) / S);
          if (t) {
            m = MARBLE;
            const [lit, rec] = t;
            const sh = [0.42, 0.36, 0.56], fr = [0.9, 0.76, 0.75], gd = [1, 0.88, 0.72];
            let a, b2, kk;
            if (lit < 0.5)
              a = sh, b2 = fr, kk = Math.pow(lit * 2, 1.4);
            else
              a = fr, b2 = gd, kk = (lit - 0.5) * 2;
            cr = mix13(a[0], b2[0], kk), cg = mix13(a[1], b2[1], kk), cb = mix13(a[2], b2[2], kk);
            if (rec > 0) {
              const d = 1 - rec * 0.78;
              cr *= d * 0.95, cg *= d * 0.92, cb *= d;
            }
            const g = 0.94 + 0.08 * hash13(x * 3 + 1, r * 5 + 2);
            cr *= g, cg *= g, cb *= g;
            const low = smooth13(40, BASE2, y) * 0.2;
            const sky = skyAt(xc, y);
            cr = mix13(cr, sky[0], low), cg = mix13(cg, sky[1], low), cb = mix13(cb, sky[2], low);
            fl = 0.12;
            hz = 0.55;
          }
        }
        mat[k] = m;
        R[k] = cr, G[k] = cg, B[k] = cb;
        floorA[k] = fl;
        hazeW[k] = hz;
      }
    }
    for (const tr of trees) {
      const top = tr.base - tr.h;
      const sunSide = tr.x < CX ? 0.9 : 0.6;
      for (let r = Math.max(0, Math.floor(top));r < Math.min(H13, Math.ceil(tr.base + 0.6)); r++) {
        const y = r + 0.5;
        const u = (tr.base - y) / tr.h;
        if (u > 1)
          continue;
        let p = u < 0.06 ? 0.18 : u < 0.3 ? 0.8 + 0.2 * (u / 0.3) : Math.pow((1 - u) / 0.7, 0.8);
        for (let x = Math.max(0, Math.floor(tr.x - tr.w - 2));x < Math.min(W13, Math.ceil(tr.x + tr.w + 2)); x++) {
          const xc = x + 0.5;
          const n = noise13(xc * 0.9, y * 0.55 + tr.s, 0);
          const hw = tr.w * p * (0.88 + 0.26 * n) + 0.35;
          const dx = (xc - tr.x) / hw;
          if (Math.abs(dx) > 1)
            continue;
          const k = r * W13 + x;
          const leaf = fbm13(xc * 0.6, y * 0.35 + tr.s * 3, 2, 0);
          const rim = smooth13(-0.2, -0.9, dx) * (0.4 + 0.6 * leaf) * (0.5 + 0.5 * Math.exp(-Math.abs(tr.x - SUN6[0]) / 80));
          const clump = smooth13(0.45, 0.7, fbm13(xc * 0.45, y * 0.3 + tr.s * 3, 3, 0));
          const base = 0.5 + 0.5 * leaf + 0.5 * clump;
          const dist = smooth13(30, 8, tr.s);
          let cr = 0.045 * base + sunSide * rim, cg = 0.1 * base + sunSide * 0.63 * rim, cb = 0.08 * base + sunSide * 0.27 * rim;
          const sky = [0.7, 0.5, 0.56];
          cr = mix13(cr, sky[0], dist * 0.45), cg = mix13(cg, sky[1], dist * 0.45), cb = mix13(cb, sky[2], dist * 0.45);
          mat[k] = CYPRESS;
          R[k] = cr, G[k] = cg, B[k] = cb;
          floorA[k] = 0.05;
          hazeW[k] = (0.3 + 0.4 * dist) * smooth13(tr.base - tr.h * 0.7, tr.base, y);
        }
      }
    }
    const RR = R.slice(), RG = G.slice(), RB = B.slice();
    const HWd = 400;
    const haze1 = new Float32Array(HWd * H13), haze2 = new Float32Array(HWd * H13);
    for (let r = 0;r < H13; r++) {
      for (let x = 0;x < HWd; x++) {
        haze1[r * HWd + x] = smooth13(0.4, 0.75, fbm13(x * 0.018, r * 0.09, 4, HWd * 0.018));
        haze2[r * HWd + x] = smooth13(0.42, 0.8, fbm13(x * 0.04 + 7, r * 0.16 + 3, 3, HWd * 0.04));
      }
    }
    const hazeRow = new Float32Array(H13);
    for (let r = 0;r < H13; r++)
      hazeRow[r] = 0.03 + 0.42 * Math.exp(-Math.abs(r + 0.5 - 63) / 6);
    const birds = [];
    for (let i = 0;i < 3; i++)
      birds.push([58 + i * 8 + hash13(i, 40) * 4, 30 - i * 2.5 + hash13(i, 41) * 2, hash13(i, 42) * 6.28]);
    const dith = new Float32Array(N), jit = new Float32Array(N);
    for (let k = 0;k < N; k++) {
      dith[k] = BAYER13[(Math.floor(k / W13) & 3) * 4 + (k % W13 & 3)] * 0.85;
      jit[k] = hash13(k, 77) - 0.5;
    }
    const tone = new Float32Array(1025);
    for (let i = 0;i <= 1024; i++) {
      const v = i / 256;
      tone[i] = v < 0.75 ? v : 0.75 + 0.25 * (1 - Math.exp(-(v - 0.75) * 4));
    }
    return (t, { color } = {}) => {
      const d1 = t * 1.1, d2 = t * 2.3;
      const cd = t * 0.5;
      const breathe = 0.035 * Math.sin(t / 6 * Math.PI * 2);
      const bx = [], by = [], bu = [];
      for (const [x0, y0, ph] of birds) {
        bx.push(((x0 + t * 3.2) % 260 + 260) % 260 - 30);
        by.push(y0 + Math.sin(t * 0.4 + ph) * 1.3);
        bu.push(Math.sin(t * 7 + ph) > 0);
      }
      for (let r = 0;r < H13; r++) {
        const y = r + 0.5;
        const hr = hazeRow[r];
        for (let x = 0;x < W13; x++) {
          const k = r * W13 + x;
          const m = mat[k];
          let cr, cg, cb, fl = floorA[k], fade = 1;
          if (m === POOL) {
            const depth = (y - BASE2) / (H13 - BASE2);
            const wob = Math.sin(y * 1.9 - t * 2.4 + Math.sin(x * 0.11 + t * 0.7) * 1.5) * (0.2 + 0.7 * depth);
            let sx = Math.round(x + wob);
            sx = sx < 0 ? 0 : sx > W13 - 1 ? W13 - 1 : sx;
            let sr = Math.round(BASE2 - 0.5 - (y - BASE2) * KR - (Math.sin(x * 0.3 + t * 1.3 + y) > 0.6 ? 1 : 0));
            sr = sr < 0 ? 0 : sr > BASE2 - 1 ? BASE2 - 1 : sr;
            const j = sr * W13 + sx;
            const src = mat[j] === MARBLE ? 1 : 0.85;
            const dim = src - 0.1 * depth;
            cr = RR[j] * dim * 0.9, cg = RG[j] * dim * 0.94, cb = RB[j] * dim + 0.05;
            const w = noise13(x * 0.12 + t * 0.15, y * 0.9 - t * 0.9, 0);
            const glint = smooth13(0.75, 0.95, w) * 0.14;
            cr += glint, cg += glint * 0.85, cb += glint * 0.75;
            if (r > BASE2 && r <= BASE2 + 4) {
              const gl = smooth13(0.62, 0.85, noise13(x * 0.55 - t * 0.9, r * 2.7 + t * 0.2, 0)) * (0.5 - 0.08 * (r - BASE2));
              cr += gl, cg += gl * 0.85, cb += gl * 0.6;
            }
            if (r === BASE2)
              cr += 0.2, cg += 0.16, cb += 0.12;
            fade = 0.8 + 0.2 * smooth13(H13 + 2, H13 - 6, y);
          } else {
            cr = R[k], cg = G[k], cb = B[k];
            if (m === SKY5) {
              const ga = glowA[k] * breathe;
              cr += ga, cg += ga * 0.78, cb += ga * 0.48;
            }
            if (m === SKY5 && y < CH) {
              const sx = x + cd, ix = Math.floor(sx), fx = sx - ix;
              const i0 = r * CW + ix % CW, i1 = r * CW + (ix + 1) % CW;
              const c = cloud[i0] + (cloud[i1] - cloud[i0]) * fx;
              if (c > 0.01) {
                const l = cloudLit[i0] + (cloudLit[i1] - cloudLit[i0]) * fx;
                const near = Math.min(1, glowA[k] * 1.7);
                const b2 = clamp13(0.2 + 0.6 * l + near * 0.55 * l);
                let kr, kg, kb;
                if (b2 < 0.5) {
                  const q = b2 * 2;
                  kr = mix13(0.16, 0.6, q), kg = mix13(0.12, 0.34, q), kb = mix13(0.3, 0.5, q);
                } else {
                  const q = (b2 - 0.5) * 2;
                  kr = mix13(0.6, 1.05, q), kg = mix13(0.34, 0.8, q), kb = mix13(0.5, 0.55, q);
                }
                const a = Math.min(1, c) * 0.9;
                cr = mix13(cr, kr, a), cg = mix13(cg, kg, a), cb = mix13(cb, kb, a);
              }
            }
            if (m === SKY5 && r < 24 && x > 96 && hash13(x, r * 3 + 11) > 0.988) {
              const tw = 0.7 + 0.3 * Math.sin(t * (1.2 + hash13(x, r) * 2) + hash13(r, x) * 6.28);
              const s = tw * 0.62 * smooth13(24, 8, r) * smooth13(96, 140, x);
              cr = Math.max(cr, s * 0.85), cg = Math.max(cg, s * 0.85), cb = Math.max(cb, s);
            }
            if (m === SKY5) {
              const dx = x + 0.5 - SUN6[0], dy = y - SUN6[1];
              const dd = dx * dx + dy * dy;
              if (dd < 22) {
                const a = smooth13(22, 9, dd);
                cr = mix13(cr, 1.05, a), cg = mix13(cg, 0.98, a), cb = mix13(cb, 0.86, a);
              }
              for (let i = 0;i < bx.length; i++) {
                const ox = Math.round(bx[i]) - x, oy = Math.round(by[i]) - r;
                if (ox < -2 || ox > 2)
                  continue;
                const ax = ox < 0 ? -ox : ox;
                const hit = bu[i] ? ax === 0 && oy === 0 || ax === 1 && oy === 1 || ax === 2 && oy === 1 : ax === 0 && oy === 0 || ax === 1 && oy === 0 || ax === 2 && oy === -1;
                if (hit)
                  cr = 0.16, cg = 0.1, cb = 0.17, fl = 0;
              }
            }
          }
          const hw = hazeW[k];
          if (hw > 0 || m === POOL) {
            const a = (m === POOL ? 0.12 : hw) * hr;
            const sx1 = (x + d1) % HWd, sx2 = (x + d2) % HWd;
            const i1 = r * HWd + (sx1 | 0), i2 = r * HWd + (sx2 | 0);
            const hz = a * (0.35 + 0.75 * haze1[i1] + 0.45 * haze2[i2]);
            cr = mix13(cr, 0.9, hz), cg = mix13(cg, 0.64, hz), cb = mix13(cb, 0.62, hz);
          }
          cr = tone[Math.min(1024, cr * 256 | 0)], cg = tone[Math.min(1024, cg * 256 | 0)], cb = tone[Math.min(1024, cb * 256 | 0)];
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp13(fl + (1 - fl) * Math.pow(peak, 1.1) * 1.02) * fade;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + dith[k] + jit[k] * (level < 0.3 ? 0.12 : 0.3))));
          out[k] = DOTS13[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER13[step]) : 0;
            let s = (0.3 + 0.7 * want) / peak;
            if (m === SKY5 && s > 1.6)
              s = 1.6;
            color[k] = nearest(clamp13(cr * s), clamp13(cg * s), clamp13(cb * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H13; r++)
        lines.push(out.slice(r * W13, (r + 1) * W13).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/tokyo-rain.ts
  var exports_tokyo_rain = {};
  __export(exports_tokyo_rain, {
    default: () => tokyoRain,
    meta: () => meta14
  });
  var meta14 = {
    name: "tokyo rain",
    category: "scenes",
    note: "a tokyo side street in the rain, neon signs shining on the wet road",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#07060d",
    palette: [
      "#100f22",
      "#17162f",
      "#201e3d",
      "#2b284e",
      "#383463",
      "#4a447a",
      "#4c4890",
      "#6a64c4",
      "#1d1520",
      "#2c1f2e",
      "#3e2b3e",
      "#553a52",
      "#6a3a74",
      "#8e4c8a",
      "#b4649c",
      "#d885ae",
      "#6e1248",
      "#a3196c",
      "#d8278c",
      "#ff47a8",
      "#ff85c6",
      "#ffc4e3",
      "#0c4656",
      "#106f80",
      "#16a0b2",
      "#28d2e2",
      "#7cecf4",
      "#ccfbfd",
      "#5e340a",
      "#93540f",
      "#cc7b16",
      "#f7a32a",
      "#ffc65e",
      "#ffe2a0",
      "#fff4d8",
      "#55100e",
      "#8a1a14",
      "#c22a1a",
      "#ee4626",
      "#ff7a4c",
      "#8ea2c4",
      "#bccbe6",
      "#e4ecfb",
      "#ffffff",
      "#2e62e0",
      "#79a2ff",
      "#20844c",
      "#43d884",
      "#e6c21e",
      "#fff07a",
      "#6a7896",
      "#9ba7c2",
      "#c9d0e2",
      "#262a36",
      "#3a3f4e",
      "#565c6c"
    ]
  };
  var W14 = 200;
  var H14 = 100;
  var VX = 100;
  var HY = 50;
  var F2 = 46;
  var EYE2 = 1.5;
  var HALF = 3.2;
  var THICK = 0.3;
  var ZF = 17;
  var EXT = 70;
  var DOTS14 = " ·•●";
  var COVER14 = [0, 0.3, 0.6, 1];
  var BAYER14 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var SKY6 = 0;
  var WALL4 = 1;
  var ROAD3 = 2;
  var SIGN = 3;
  var SIDE = 4;
  var VEND = 5;
  var POLE2 = 6;
  var WIRE = 7;
  var TOWER3 = 8;
  var GIVE = [0.25, 0.1, 0, 1, 0.5, 0.9, 0.12, 0.15, 0.2];
  var FLOOR2 = [0.12, 0.04, 0.05, 0.1, 0.06, 0.1, 0.03, 0, 0];
  var PINK = [1, 0.2, 0.62];
  var CYAN = [0.14, 0.88, 1];
  var AMBER = [1, 0.6, 0.14];
  var RED = [1, 0.16, 0.1];
  var NEON = 0;
  var PANEL = 1;
  var WHITE = 2;
  var BULBS = 3;
  var FONT = {
    ra: ".###. ..... ##### ....# ..##.",
    "-": "..#.. ..#.. ..#.. ..#.. ..#..",
    me: "....# .#.#. ..#.. .#.#. #....",
    n: "#.... .#..# ....# ...#. ###..",
    ka: ".#... ##### .#..# .#..# #..##",
    o: "...#. ##### ..##. .#.#. #..#.",
    ke: ".#... .#### #..#. ...#. ..#..",
    su: "####. ...#. ..#.. .#.#. #...#",
    na: "..#.. ##### ..#.. ..#.. .#...",
    tsu: "#.#.# .#..# ....# ...#. .##..",
    ku: ".#... .#### #...# ...#. .##..",
    ho: "..#.. ##### ..#.. #.#.# ..#..",
    te: "####. ..... ##### ..#.. .#...",
    ru: ".#.#. .#.#. .#.#. .#.## #..#.",
    k1: "#.### ..#.# #.### ..#.# #.###",
    k2: "##### #...# ##### #.#.. #.###",
    k3: "#.### #.#.# ###.# #.#.# ###.#",
    k4: "..#.. .#.#. ##### #.#.# #.###",
    k5: "..#.. ##### .###. #.#.# ..#.."
  };
  var SIGNS = [
    { side: -1, s: 27, hb: 2.3, w: 16, g: 2, kind: NEON, hue: PINK, text: "ra - me n", fail: 2 },
    { side: -1, s: 17.5, hb: 2.45, w: 14, g: 2, kind: PANEL, hue: AMBER, text: "k1 k2 k3" },
    { side: -1, s: 11.5, hb: 2.55, w: 9, g: 1, kind: NEON, hue: CYAN, text: "k4 k5 k1", group: 1 },
    { side: -1, s: 7.4, hb: 2.6, w: 7, g: 1, kind: WHITE, hue: RED, text: "k2 k3 k5" },
    { side: -1, s: 5, hb: 2.7, w: 4, g: 0, kind: PANEL, hue: PINK, rows: 18 },
    { side: -1, s: 5, hb: 6.6, w: 4, g: 0, kind: NEON, hue: AMBER, rows: 10 },
    { side: -1, s: 3.4, hb: 2.5, w: 3, g: 0, kind: NEON, hue: CYAN, rows: 14 },
    { side: -1, s: 2.3, hb: 2.8, w: 2, g: 0, kind: PANEL, hue: AMBER, rows: 10 },
    { side: 1, s: 24, hb: 2.55, w: 16, g: 2, kind: NEON, hue: CYAN, text: "ka ra o ke" },
    { side: 1, s: 14.5, hb: 2.5, w: 11, g: 1, kind: BULBS, hue: PINK, text: "su na tsu ku" },
    { side: 1, s: 6.6, hb: 2.6, w: 7, g: 1, kind: PANEL, hue: AMBER, text: "ho te ru" },
    { side: 1, s: 4.6, hb: 2.7, w: 4, g: 0, kind: NEON, hue: CYAN, rows: 16, group: 2 },
    { side: 1, s: 4.6, hb: 6.4, w: 4, g: 0, kind: PANEL, hue: PINK, rows: 9 },
    { side: 1, s: 3.1, hb: 2.6, w: 3, g: 0, kind: PANEL, hue: AMBER, rows: 13 },
    { side: 1, s: 2.1, hb: 2.9, w: 2, g: 0, kind: NEON, hue: PINK, rows: 10 },
    { side: 1, s: 18, hb: 0.14, w: 7, g: 1, kind: WHITE, hue: RED, text: "k1 k4", edge: 2.44 }
  ];
  var LEFT2 = [
    [0, 2.55, 10.5, 1],
    [2.55, 4.6, 7.2, 3],
    [4.6, 7, 6.2, 2],
    [7, 10.5, 11, 3],
    [10.5, 15, 8.4, 2],
    [15, 22, 12.5, 0],
    [22, 32, 9.5, 2],
    [32, 60, 14, 0],
    [60, 1e5, 18, 0]
  ];
  var RIGHT2 = [
    [0, 3.2, 9.6, 4],
    [3.2, 5, 8.2, 0],
    [5, 6.4, 0, 0],
    [6.4, 9.5, 7.4, 2],
    [9.5, 14, 13.5, 3],
    [14, 20, 8, 2],
    [20, 30, 11, 0],
    [30, 1e5, 16, 0]
  ];
  var TANKS = [[-1, 5.3, 6.2, 1.7], [-1, 11.6, 12.7, 1.5], [1, 7.3, 8.1, 1.4]];
  var MASTS = [[-1, 13.8, 3], [1, 18.4, 2.4]];
  var POLES = [[2.9, 4.3, 9.4, 0.32], [-2.95, 9.6, 9.4, 0.3], [2.9, 15, 9.2, 0.28], [-2.95, 24, 9.2, 0.26]];
  var WIRES = [
    [2.9, 8.6, 4.3, -2.95, 8.9, 9.6, 0.45],
    [2.9, 8.2, 4.3, -2.95, 8.4, 9.6, 0.55],
    [2.9, 7.6, 4.3, -3.2, 5.9, 6, 0.3],
    [2.9, 9, 4.3, 2.9, 8.9, 15, 0.4],
    [2.9, 8.4, 4.3, 2.9, 8.5, 15, 0.5],
    [-2.95, 8.9, 9.6, -2.95, 8.9, 24, 0.35],
    [-2.95, 8.4, 9.6, 2.9, 8.5, 15, 0.4],
    [2.9, 8.5, 15, -2.95, 8.6, 24, 0.3],
    [2.9, 8.9, 15, 2.9, 8.8, 28, 0.3],
    [-2.95, 8.4, 24, 2.9, 8.4, 34, 0.25]
  ];
  var LANTERNS = [[26.3, 2.72, 1.88, 0], [14.8, 2.72, 1.95, 1.9]];
  var VEND_S = 16;
  function hash14(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise14(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash14(x0, yi), b = hash14(x1, yi), c = hash14(x0, yi + 1), d = hash14(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm14(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise14(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var END = [1, 0.7, 0.86];
  function endGlow(x, y) {
    const d = Math.hypot((x - VX) * 0.9, (y - HY + 2) * 1.25);
    return Math.exp(-d / 6.5) * 0.95 + Math.exp(-d / 16) * 0.26 + Math.exp(-d / 45) * 0.08;
  }
  var clamp14 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth14 = (a, b, v) => {
    const k = clamp14((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix14 = (a, b, k) => a + (b - a) * k;
  var hex14 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  function walkerShape(u, v, ph) {
    v -= 0.014 * Math.abs(Math.cos(ph));
    const R = 0.56, RIM = 1.74;
    if (v > RIM - 0.07) {
      const q = u / R;
      if (q > -1 && q < 1) {
        const top = RIM + 0.4 * Math.sqrt(1 - q * q);
        const bottom = RIM - 0.05 * Math.abs(Math.cos(q * 2.5 * Math.PI));
        if (v <= top && v >= bottom)
          return v > top - 0.06 ? 2 : 3;
      }
      if (u > -0.03 && u < 0.03 && v < RIM + 0.5)
        return 3;
    }
    const hy = (v - 1.6) / 0.125, hx = u / 0.1;
    if (hx * hx + hy * hy < 1)
      return 1;
    if (v >= 0.5 && v <= 1.48) {
      const hw = v > 1.36 ? 0.2 * Math.sqrt(1 - ((v - 1.36) / 0.12) ** 2) : 0.18 + 0.035 * smooth14(0.85, 0.5, v);
      if (u > -hw && u < hw)
        return 1;
    }
    if (v > 1.2 && v < RIM && u > 0.01 && u < 0.07)
      return 1;
    for (let i = -1;i <= 1; i += 2) {
      const lift = 0.09 * Math.max(0, Math.sin(ph + (i > 0 ? Math.PI : 0)));
      const lx = u - i * 0.075;
      if (v >= lift && v < 0.62 && lx > -0.055 && lx < 0.055)
        return 1;
    }
    return 0;
  }
  function tokyoRain() {
    const P = meta14.palette.map(hex14);
    const N = W14 * H14;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < P.length; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const mat = new Uint8Array(N);
    const S2 = new Float32Array(N);
    const ER2 = new Float32Array(N), EG = new Float32Array(N), EB = new Float32Array(N);
    const AR = new Float32Array(N), AG = new Float32Array(N), AB = new Float32Array(N);
    const KG = new Float32Array(N);
    const grp = new Uint8Array(N);
    const SR2 = new Float32Array(N), SG = new Float32Array(N), SB = new Float32Array(N);
    const wet = new Float32Array(N);
    const emit = (k, r, g, b) => {
      ER2[k] = r, EG[k] = g, EB[k] = b, AR[k] = 0, AG[k] = 0, AB[k] = 0;
    };
    const surface = (k, r, g, b, kg) => {
      ER2[k] = 0, EG[k] = 0, EB[k] = 0, AR[k] = r, AG[k] = g, AB[k] = b, KG[k] = kg;
    };
    const wallS = new Float32Array(W14), roofY = new Float32Array(W14), bareY = new Float32Array(W14), baseY = new Float32Array(W14);
    const colI = new Int8Array(W14), colH = new Float32Array(W14), tankCol = new Uint8Array(W14);
    for (let x = 0;x < W14; x++) {
      const xc = x + 0.5, side = xc < VX ? -1 : 1;
      const list = side < 0 ? LEFT2 : RIGHT2;
      const s0 = Math.abs(xc - VX) / HALF, z = F2 / s0;
      let i = 0;
      while (i < list.length - 1 && z >= list[i][1])
        i++;
      let s = s0, hgt = list[i][2];
      if (!hgt) {
        s = F2 / list[i][1];
        hgt = list[i + 1][2];
      }
      let extra = 0;
      for (const [ts, a, b, e] of TANKS)
        if (ts === side && z >= a && z < b)
          extra = e, tankCol[x] = 1;
      wallS[x] = s;
      baseY[x] = HY + EYE2 * s;
      bareY[x] = HY - (hgt - EYE2) * s;
      roofY[x] = HY - (hgt + extra - EYE2) * s;
      colI[x] = i;
      colH[x] = hgt;
    }
    for (const [ms, at, e] of MASTS) {
      const s = F2 / at, x = Math.floor(VX + ms * HALF * s);
      roofY[x] = Math.min(roofY[x], bareY[x] - e * s);
    }
    for (let r = 0;r < H14; r++) {
      const y = r + 0.5;
      for (let x = 0;x < W14; x++) {
        const k = r * W14 + x, xc = x + 0.5;
        const side = xc < VX ? -1 : 1;
        if (y >= baseY[x]) {
          mat[k] = ROAD3;
          const s2 = (y - HY) / EYE2, z2 = F2 / s2, xw = (xc - VX) / s2, ax = Math.abs(xw);
          S2[k] = s2;
          let a = 0.11 + 0.07 * fbm14(xw * 2.2, z2 * 1.1, 2, 0);
          const lo = ax - 0.5 / s2, hi = ax + 0.5 / s2;
          const paint = clamp14((Math.min(hi, 2.66) - Math.max(lo, 2.52)) * s2);
          a = mix14(a, 0.75, paint);
          if (ax > 2.85)
            a = z2 % 0.55 < 0.08 ? 0.07 : 0.2;
          surface(k, a * 0.82, a * 0.86, a, 0.6);
          ER2[k] = paint * 0.13, EG[k] = paint * 0.14, EB[k] = paint * 0.17;
          wet[k] = 0.5 + 0.5 * smooth14(0.42, 0.6, fbm14(xw * 0.9 + 3, z2 * 0.35, 3, 0));
          continue;
        }
        const tankLeg = tankCol[x] && y < bareY[x] && y > roofY[x] && (HY - y) / wallS[x] + EYE2 - colH[x] < 0.45 && (x & 1) === 0;
        if (y < roofY[x] || tankLeg) {
          mat[k] = SKY6;
          continue;
        }
        mat[k] = WALL4;
        const s = wallS[x];
        S2[k] = s;
        const list = side < 0 ? LEFT2 : RIGHT2;
        const i = colI[x];
        const [z0, z1, , front] = list[i];
        const h = EYE2 + (HY - y) / s;
        const tone = 0.75 + 0.5 * hash14(i, side + 7);
        let wr = 0.3 * tone, wg = 0.28 * tone, wb = 0.33 * tone;
        const tex = 0.8 + 0.35 * fbm14(xc * 0.6, y * 0.6, 2, 0);
        wr *= tex, wg *= tex, wb *= tex;
        if (!list[i][2]) {
          const xw = (xc - VX) / s;
          const dl = Math.hypot(xw - 3.65, (h - 2.9) * 0.8);
          if (dl < 0.1)
            emit(k, 1.2, 1, 0.7);
          else if (h > 2.95 && h < 3.05 && Math.abs(xw - 3.65) < 0.16)
            surface(k, 0.05, 0.05, 0.06, 0.4);
          else if (Math.abs(xw - 3.36) < 0.05)
            surface(k, 0.12, 0.12, 0.14, 0.6);
          else if (xw > 3.85 && h < 2.1)
            surface(k, 0.06, 0.05, 0.05, 0.5);
          else {
            const pool = Math.exp(-dl / 0.9) * 0.55;
            surface(k, wr * 0.8, wg * 0.8, wb * 0.8, 1);
            ER2[k] = pool * 0.9, EG[k] = pool * 0.62, EB[k] = pool * 0.36;
          }
          continue;
        }
        const z = F2 / s;
        if (side < 0 && i === 0) {
          const lx = VX - HALF * (F2 / 1.62), ly = HY - (2.2 - EYE2) * (F2 / 1.62);
          const dl = Math.hypot((xc - lx) / 1.4, (y - ly) / 1.1);
          if (dl < 1) {
            emit(k, 1.3, 0.95, 0.6);
            continue;
          }
          if (dl < 1.9 && y < ly - 0.6) {
            surface(k, 0.06, 0.06, 0.07, 0.5);
            continue;
          }
        }
        if (h > 2.6) {
          const fl = Math.floor((h - 2.9) / 2.8), fh = h - 2.9 - fl * 2.8;
          const bay = Math.floor((z - z0 - 0.5) / 1.9), bz = z - z0 - 0.5 - bay * 1.9;
          if (h > 2.9 && fh > 0.55 && fh < 1.85 && bz > 0.3 && bz < 1.3 && z < z1 - 0.5 && h < colH[x] - 0.5) {
            const hh = hash14(bay * 7 + fl, side * 31 + i);
            if (hh < 0.36) {
              const v = (0.3 + 0.3 * hash14(bay, fl + 9)) * (fh % 0.17 < 0.045 ? 0.55 : 1);
              if (hh < 0.12)
                emit(k, 0.5 * v, 0.72 * v, 1 * v);
              else
                emit(k, v, 0.7 * v, 0.4 * v);
            } else
              surface(k, 0.08, 0.09, 0.13, 0.9);
          } else if (h > 2.9 && fh < 0.14)
            surface(k, wr * 1.25, wg * 1.25, wb * 1.25, 1);
          else
            surface(k, wr, wg, wb, 1);
          if (side < 0 && i === 2 && z > 4.85 && z < 6.75 && h > 2.45 && h < 2.85) {
            const letter = (z - 4.85) % 0.42 > 0.1 && (z - 4.85) % 0.42 < 0.3 && h > 2.53 && h < 2.77;
            emit(k, AMBER[0] * (letter ? 0.12 : 0.9), AMBER[1] * (letter ? 0.12 : 0.9), AMBER[2] * (letter ? 0.12 : 0.9));
          }
          continue;
        }
        surface(k, wr, wg, wb, 1);
        if (front === 1) {
          const lx = VX - HALF * (F2 / 1.62), ly = HY - (2.2 - EYE2) * (F2 / 1.62);
          const pool = Math.exp(-Math.hypot((xc - lx) * 0.7, y - ly) / 11) * 0.42;
          if (h < 2.15) {
            const rib = h % 0.11 < 0.035 ? 0.3 : 1;
            surface(k, 0.27 * rib, 0.29 * rib, 0.35 * rib, 1);
            ER2[k] = pool * rib, EG[k] = pool * 0.72 * rib, EB[k] = pool * 0.45 * rib;
          } else
            surface(k, 0.16, 0.16, 0.2, 1);
        } else if (front === 2) {
          const zz = z - z0;
          if (zz > 0.3 && zz < z1 - z0 - 0.3 && h > 0.1 && h < 2.15) {
            const cool = i === 4 && side < 0;
            const shelf = Math.abs(h - 0.75) < 0.05 || Math.abs(h - 1.3) < 0.05 || Math.abs(h - 1.82) < 0.05;
            const v = (zz % 1.4 < 0.07 ? 0.05 : shelf ? 0.3 : 0.62) * (0.85 + 0.3 * hash14(Math.floor(zz * 3), 5));
            if (cool)
              emit(k, 0.7 * v, 0.85 * v, 1 * v);
            else
              emit(k, v, 0.72 * v, 0.44 * v);
          }
        } else if (front === 3) {
          const zz = z - z0;
          if (zz > 0.35 && zz < 1.15) {
            if (h < 2)
              surface(k, 0.07, 0.05, 0.04, 0.8);
            else if (h < 2.22)
              emit(k, 0.55, 0.38, 0.2);
          } else if (zz > 1.5 && zz < 2.5 && h > 1 && h < 1.9) {
            const lattice = zz % 0.12 < 0.03 || (h - 1) % 0.18 < 0.035;
            if (lattice)
              surface(k, 0.06, 0.04, 0.03, 0.6);
            else
              emit(k, 0.5, 0.36, 0.2);
          }
        } else if (front === 4) {
          surface(k, 0.3, 0.19, 0.12, 1);
          if (z > 2.35 && z < 3 && h < 2.05) {
            if (h > 1.42) {
              const slit = (z - 2.35) % 0.217 < 0.028;
              const crest = ((z - 2.675) / 0.09) ** 2 + ((h - 1.76) / 0.13) ** 2 < 1 && ((z - 2.675) / 0.09) ** 2 + ((h - 1.76) / 0.13) ** 2 > 0.35;
              if (slit)
                emit(k, 0.8, 0.5, 0.22);
              else if (crest)
                emit(k, 0.75, 0.74, 0.72);
              else
                emit(k, 0.09, 0.1, 0.3);
            } else {
              let v = (Math.abs(h - 0.95) < 0.06 ? 0.35 : 0.5 + 0.35 * smooth14(0.2, 1.4, h)) * (h < 0.3 ? 0.6 : 1);
              for (const pz of [2.52, 2.83]) {
                const head = ((z - pz) / 0.075) ** 2 + ((h - 1.3) / 0.1) ** 2 < 1;
                const back = h > 0.9 && h < 1.22 && Math.abs(z - pz) < 0.1 + 0.05 * smooth14(1.2, 0.95, h);
                if (head || back)
                  v = 0.07;
              }
              emit(k, v, 0.6 * v, 0.28 * v);
            }
          } else if (z > 1.5 && z < 1.85 && h > 1.05 && h < 1.8) {
            const lattice = z % 0.11 < 0.03 || (h - 1.05) % 0.19 < 0.04;
            if (lattice)
              surface(k, 0.12, 0.07, 0.04, 0.6);
            else
              emit(k, 0.6, 0.38, 0.18);
          }
        }
      }
    }
    for (let k = 0;k < N; k++) {
      const x = k % W14, y = Math.floor(k / W14) + 0.5;
      const v = clamp14(y / HY);
      const glow2 = endGlow(x + 0.5, y);
      SR2[k] = 0.11 + 0.16 * v ** 1.6 + glow2 * END[0];
      SG[k] = 0.08 + 0.08 * v ** 1.6 + glow2 * END[1];
      SB[k] = 0.24 + 0.16 * v ** 1.6 + glow2 * END[2];
    }
    const towerTop = 15;
    for (let r = 8;r < 38; r++) {
      for (let x = 96;x <= 103; x++) {
        const k = r * W14 + x;
        if (mat[k] !== SKY6)
          continue;
        const spire = x === 99 || x === 100;
        if (r < towerTop && !(spire && r >= 9))
          continue;
        mat[k] = TOWER3;
        S2[k] = 0.05;
        if (r < towerTop)
          emit(k, 0.015, 0.012, 0.025);
        else if (r < towerTop + 2)
          emit(k, 0.42, 0.36, 0.5);
        else {
          const lit = (x & 1) === 0 && (r & 1) === 1 && hash14(x, r + 5) < 0.45;
          emit(k, lit ? 0.32 : 0.015, lit ? 0.24 : 0.012, lit ? 0.18 : 0.025);
        }
      }
    }
    for (let p = 0;p < POLES.length; p++) {
      const [px, pz, top, thick] = POLES[p];
      const s = F2 / pz, xc = VX + px * s, hw = thick / 2 * s;
      const yt = HY - (top - EYE2) * s, yb = HY + EYE2 * s;
      const arm = top - 0.45;
      for (let r = Math.max(0, Math.floor(yt - 3));r < Math.min(H14, Math.ceil(yb)); r++) {
        const y = r + 0.5, h = EYE2 + (HY - y) / s;
        for (let x = Math.max(0, Math.floor(xc - 0.9 * s));x < Math.min(W14, Math.ceil(xc + 0.9 * s)); x++) {
          const k = r * W14 + x;
          if (S2[k] >= s)
            continue;
          let cov = 0;
          if (h <= top && h >= 0)
            cov = clamp14(Math.min(x + 1, xc + hw) - Math.max(x, xc - hw));
          const onArm = Math.abs(h - arm) < Math.max(0.06, 0.5 / s) && Math.abs(x + 0.5 - xc) < 0.65 * s;
          const can = p === 1 && h > 6.4 && h < 7.5 && x + 0.5 - xc > 0 && x + 0.5 - xc < 0.45 * s;
          if (onArm || can)
            cov = Math.max(cov, can ? 1 : clamp14(0.12 * s));
          if (cov < 0.05)
            continue;
          let cr = 0.36, cg = 0.36, cb = 0.4;
          if (p === 0) {
            const u = (x + 0.5 - xc) / hw;
            const round = 0.55 + 0.45 * Math.sqrt(clamp14(1 - u * u));
            cr *= round, cg *= round, cb *= round;
            if (h > 0.25 && h < 1.8) {
              const stripe = (h * 4.5 + u * 0.35) % 1 < 0.5;
              if (stripe)
                cr = 0.9, cg = 0.72, cb = 0.08;
              else
                cr = 0.05, cg = 0.05, cb = 0.05;
            } else if (h > 1.95 && h < 2.35 && Math.abs(u) < 0.85) {
              const dot = (x + r) % 2 === 0 && h > 2.03 && h < 2.27;
              if (dot)
                cr = 0.85, cg = 0.88, cb = 0.95;
              else
                cr = 0.12, cg = 0.25, cb = 0.75;
            }
          } else if (can)
            cr = 0.4, cg = 0.42, cb = 0.46;
          else
            cr = 0.12, cg = 0.12, cb = 0.15;
          AR[k] = mix14(AR[k], cr, cov), AG[k] = mix14(AG[k], cg, cov), AB[k] = mix14(AB[k], cb, cov);
          ER2[k] *= 1 - cov, EG[k] *= 1 - cov, EB[k] *= 1 - cov;
          KG[k] = mix14(KG[k], 1, cov);
          if (cov > 0.5)
            mat[k] = POLE2, S2[k] = s;
        }
      }
    }
    for (const [ax, ah, az, bx, bh, bz, sag] of WIRES) {
      let px = 0, py = 0, ps = 0;
      for (let i = 0;i <= 120; i++) {
        const q = i / 120;
        const wx = mix14(ax, bx, q), wz = mix14(az, bz, q), wh = mix14(ah, bh, q) - sag * 4 * q * (1 - q);
        const s = F2 / wz, sx = VX + wx * s, sy = HY - (wh - EYE2) * s;
        if (i > 0) {
          const minx = Math.max(0, Math.floor(Math.min(px, sx) - 1)), maxx = Math.min(W14 - 1, Math.ceil(Math.max(px, sx) + 1));
          const miny = Math.max(0, Math.floor(Math.min(py, sy) - 1)), maxy = Math.min(H14 - 1, Math.ceil(Math.max(py, sy) + 1));
          const dx = sx - px, dy = sy - py, len2 = dx * dx + dy * dy || 0.000001;
          for (let r = miny;r <= maxy; r++) {
            for (let x = minx;x <= maxx; x++) {
              const k = r * W14 + x;
              const kk = clamp14(((x + 0.5 - px) * dx + (r + 0.5 - py) * dy) / len2);
              const ex = px + dx * kk - x - 0.5, ey = py + dy * kk - r - 0.5;
              const cov = clamp14(1.15 - Math.sqrt(ex * ex + ey * ey) * 1.5) * 0.9;
              const s2 = mix14(ps, s, kk);
              if (cov < 0.05 || S2[k] >= s2)
                continue;
              AR[k] = mix14(AR[k], 0.05, cov), AG[k] = mix14(AG[k], 0.05, cov), AB[k] = mix14(AB[k], 0.07, cov);
              ER2[k] *= 1 - cov, EG[k] *= 1 - cov, EB[k] *= 1 - cov;
              KG[k] = mix14(KG[k], 0.8, cov);
              if (mat[k] === SKY6 || mat[k] === TOWER3)
                SR2[k] *= 1 - cov, SG[k] *= 1 - cov, SB[k] *= 1 - cov;
              if (cov > 0.45 && mat[k] !== ROAD3)
                mat[k] = mat[k] === SKY6 || mat[k] === TOWER3 ? WIRE : mat[k], S2[k] = Math.max(S2[k], 0.01);
            }
          }
        }
        px = sx, py = sy, ps = s;
      }
    }
    {
      const s = VEND_S, s2 = s / (1 + 0.7 * s / F2);
      const CANS = [[1, 0.16, 0.1], [0.15, 0.4, 1], [1, 0.55, 0.1], [0.2, 0.85, 0.45], [0.95, 0.95, 0.95], [1, 0.85, 0.15], [0.85, 0.2, 0.6]];
      for (let r = 0;r < H14; r++) {
        const y = r + 0.5, h0 = EYE2 + (HY - y) / s;
        for (let x = 40;x < 80; x++) {
          const k = r * W14 + x, xc = x + 0.5;
          const u = (xc - VX) / s + 3.15;
          if (u >= 0 && u <= 0.95 && h0 >= 0 && h0 <= 1.83 && S2[k] < s) {
            mat[k] = VEND;
            S2[k] = s;
            grp[k] = 0;
            let cr = 0.62, cg = 0.66, cb = 0.74;
            if (u > 0.05 && u < 0.9 && h0 > 0.05 && h0 < 1.78) {
              if (h0 > 1.5) {
                cr = 0.85, cg = 0.93, cb = 1;
                if (h0 > 1.6 && h0 < 1.71)
                  cr = 1, cg = 0.18, cb = 0.12;
              } else if (h0 > 0.53) {
                const band = h0 > 1.13 ? 0 : h0 > 0.83 ? 1 : 2;
                const b0 = [1.13, 0.83, 0.53][band];
                const hb = h0 - b0;
                const slot = Math.floor((u - 0.08) / 0.135), su = u - 0.08 - slot * 0.135;
                cr = 0.82, cg = 0.9, cb = 1;
                if (hb < 0.045) {
                  const lit = su > 0.05 && su < 0.09 && slot >= 0 && slot < 6;
                  cr = lit ? 0.35 : 0.2, cg = lit ? 0.75 : 0.22, cb = lit ? 1 : 0.28;
                } else if (hb > 0.07 && hb < 0.26 && slot >= 0 && slot < 6 && su > 0.02 && su < 0.1) {
                  const c = CANS[Math.floor(hash14(slot, band + 3) * CANS.length)];
                  cr = c[0] * 0.95, cg = c[1] * 0.95, cb = c[2] * 0.95;
                }
              } else {
                cr = 0.3, cg = 0.32, cb = 0.38;
                if (u > 0.12 && u < 0.62 && h0 > 0.1 && h0 < 0.26)
                  cr = 0.02, cg = 0.02, cb = 0.03;
                if (u > 0.7 && u < 0.86 && h0 > 0.3 && h0 < 0.46) {
                  const read = h0 > 0.38 && h0 < 0.44;
                  cr = read ? 0.2 : 0.06, cg = read ? 1 : 0.06, cb = read ? 0.5 : 0.08;
                }
              }
            }
            emit(k, cr, cg, cb);
          }
        }
      }
      const xin = VX - 2.2 * s, xend = VX - 2.2 * s2;
      for (let x = Math.floor(xin);x < Math.ceil(xend); x++) {
        const sc = (VX - x - 0.5) / 2.2;
        if (sc > s || sc < s2)
          continue;
        const along = (F2 / sc - F2 / s) / 0.7;
        for (let r = 0;r < H14; r++) {
          const y = r + 0.5, h = EYE2 + (HY - y) / sc;
          const k = r * W14 + x;
          if (h < 0 || h > 1.83 || S2[k] >= sc)
            continue;
          mat[k] = VEND;
          S2[k] = sc;
          const seam = Math.abs(along - 0.5) < 0.04;
          const v = (h > 1.72 ? 0.5 : 0.36) * (seam ? 0.6 : 1) * (1 - 0.3 * along);
          emit(k, v * 0.92, v * 0.96, v * 1.05);
        }
      }
    }
    const bulbs = [];
    const order = SIGNS.map((_, i) => i).sort((a, b) => SIGNS[a].s - SIGNS[b].s);
    for (const si of order) {
      const sg = SIGNS[si];
      const { side, s, g, kind, hue, w } = sg;
      const xo = Math.round(VX + side * (sg.edge ?? HALF) * s);
      const x0 = side < 0 ? xo : xo - w, x1 = x0 + w;
      const y1 = Math.round(HY - (sg.hb - EYE2) * s);
      const text = sg.text ? sg.text.split(" ") : [];
      const n = text.length;
      const m = kind === BULBS ? 3 : g + 1;
      const step = 5 * g + g + 1;
      const hc = g ? 2 * m + n * step - g - 1 : sg.rows;
      const y0 = y1 - hc;
      const gx = x0 + Math.floor((w - 5 * g) / 2);
      const pale = [mix14(hue[0], 1, 0.32), mix14(hue[1], 1, 0.32), mix14(hue[2], 1, 0.32)];
      let ring = 0;
      for (let r = Math.max(0, y0);r < Math.min(H14, y1); r++) {
        for (let x = Math.max(0, x0);x < Math.min(W14, x1); x++) {
          const k = r * W14 + x;
          if (S2[k] >= s)
            continue;
          const i = x - x0, j = r - y0, jb = y1 - 1 - r;
          const edge = i === 0 || i === w - 1 || j === 0 || jb === 0;
          let stroke = false, gi = -1;
          if (g) {
            gi = Math.floor((j - m) / step);
            const gr = j - m - gi * step, gc = x - gx;
            if (gi >= 0 && gi < n && gr >= 0 && gr < 5 * g && gc >= 0 && gc < 5 * g) {
              stroke = FONT[text[gi]][Math.floor(gr / g) * 6 + Math.floor(gc / g)] === "#";
            }
          } else if (w > 2 && i > 0 && i < w - 1)
            stroke = j % 4 === 1 || j % 4 === 2;
          let cr, cg, cb;
          if (kind === NEON) {
            if (edge)
              cr = hue[0], cg = hue[1], cb = hue[2];
            else if (stroke)
              cr = pale[0], cg = pale[1], cb = pale[2];
            else
              cr = 0.03 + hue[0] * 0.05, cg = 0.025 + hue[1] * 0.05, cb = 0.045 + hue[2] * 0.05;
          } else if (kind === PANEL) {
            if (stroke)
              cr = hue[0] * 0.07, cg = hue[1] * 0.07, cb = hue[2] * 0.07;
            else if (edge && w > 3)
              cr = hue[0] * 0.55, cg = hue[1] * 0.55, cb = hue[2] * 0.55;
            else
              cr = pale[0] * 0.92, cg = pale[1] * 0.92, cb = pale[2] * 0.92;
          } else if (kind === WHITE) {
            if (stroke)
              cr = hue[0] * 0.9, cg = hue[1] * 0.9, cb = hue[2] * 0.9;
            else if (edge)
              cr = hue[0] * 0.7, cg = hue[1] * 0.7, cb = hue[2] * 0.7;
            else
              cr = 0.95, cg = 0.93, cb = 0.88;
          } else {
            if (edge) {
              cr = 0.04, cg = 0.03, cb = 0.03;
              if ((i + j) % 2 === 0)
                bulbs.push([k, ring++]);
            } else if (stroke)
              cr = 1, cg = 0.95, cb = 0.86;
            else
              cr = hue[0] * 0.42, cg = hue[1] * 0.42, cb = hue[2] * 0.42;
          }
          mat[k] = SIGN;
          S2[k] = s;
          emit(k, cr, cg, cb);
          grp[k] = sg.group ?? (sg.fail !== undefined && gi === sg.fail && stroke ? 3 : 0);
        }
      }
      const xin = side < 0 ? x1 : x0;
      const xwIn = (xin - VX) / s;
      const s2 = s / (1 + THICK * s / F2);
      const xend = VX + xwIn * s2;
      const hb = EYE2 + (HY - y1) / s, ht = EYE2 + (HY - y0) / s;
      const lo = Math.floor(Math.min(xin, xend)), hi = Math.ceil(Math.max(xin, xend));
      for (let x = Math.max(0, lo);x < Math.min(W14, hi); x++) {
        const sc = (x + 0.5 - VX) / xwIn;
        if (sc > s || sc < s2)
          continue;
        const yt = HY - (ht - EYE2) * sc, yb = HY - (hb - EYE2) * sc;
        for (let r = Math.max(0, Math.floor(yt));r < Math.min(H14, Math.ceil(yb)); r++) {
          const y = r + 0.5;
          const k = r * W14 + x;
          if (y < yt || y >= yb || S2[k] >= sc)
            continue;
          const v = kind === NEON ? 0.14 : kind === BULBS ? 0.3 : 0.5;
          const c = kind === WHITE ? [0.95, 0.93, 0.88] : kind === NEON ? hue : pale;
          mat[k] = SIDE;
          S2[k] = sc;
          emit(k, c[0] * v, c[1] * v, c[2] * v);
          grp[k] = sg.group ?? 0;
        }
      }
    }
    {
      const s = 18, y0 = Math.round(HY + (EYE2 - 0.14) * s), y1 = Math.round(HY + EYE2 * s);
      for (const xw of [2.1, 2.4]) {
        const x = Math.floor(VX + xw * s);
        for (let r = y0;r < y1; r++) {
          const k = r * W14 + x;
          if (S2[k] < s)
            mat[k] = POLE2, S2[k] = s, surface(k, 0.05, 0.05, 0.06, 0.5);
        }
      }
    }
    const lantern = (li, swing, put) => {
      const [s, lx, lh] = LANTERNS[li];
      const xc = VX + lx * s, yc = HY - (lh - EYE2) * s;
      const top = HY - (lh + 0.62 - EYE2) * s;
      for (let r = Math.max(0, Math.floor(top));r < Math.min(H14, Math.ceil(yc + 0.48 * s)); r++) {
        const y = r + 0.5;
        const v = (yc - y) / s;
        const off = swing * (0.62 - v);
        for (let x = Math.floor(xc - 0.36 * s - 1);x <= Math.ceil(xc + 0.36 * s + 1); x++) {
          if (x < 0 || x >= W14)
            continue;
          const u = (x + 0.5 - xc) / s - off;
          const k = r * W14 + x;
          if (v > 0.44) {
            if (Math.abs(u) < 0.5 / s)
              put(k, 0.04, 0.02, 0.02);
            continue;
          }
          if (v < -0.44)
            continue;
          if (Math.abs(v) > 0.38) {
            if (Math.abs(u) < 0.15)
              put(k, 0.06, 0.02, 0.02);
            continue;
          }
          const hw = 0.26 * Math.sqrt(1 - (v / 0.46) ** 2);
          if (Math.abs(u) > hw)
            continue;
          const q = u / hw;
          let b = 0.6 + 0.4 * (1 - q * q);
          if ((v + 0.38) % 0.095 < 0.024)
            b *= 0.5;
          const letter = Math.abs(v) < 0.24 && (Math.abs(u) < 0.02 || Math.abs(u) < 0.08 && (v + 0.24) % 0.12 < 0.03);
          if (letter)
            b *= 0.12;
          put(k, b, b * 0.27, b * 0.11);
        }
      }
    };
    const LR = new Float32Array(N), LG = new Float32Array(N), LB2 = new Float32Array(N);
    for (let li = 0;li < LANTERNS.length; li++)
      lantern(li, 0, (k, r, g, b) => (LR[k] = r, LG[k] = g, LB2[k] = b));
    const blur = (src, rad, passes) => {
      let a = src.slice();
      const b = new Float32Array(N);
      const pre = new Float32Array(Math.max(W14, H14) + 1);
      const n = 2 * rad + 1;
      for (let p = 0;p < passes; p++) {
        for (let r = 0;r < H14; r++) {
          for (let x = 0;x < W14; x++)
            pre[x + 1] = pre[x] + a[r * W14 + x];
          for (let x = 0;x < W14; x++)
            b[r * W14 + x] = (pre[Math.min(W14, x + rad + 1)] - pre[Math.max(0, x - rad)]) / n;
        }
        for (let x = 0;x < W14; x++) {
          for (let r = 0;r < H14; r++)
            pre[r + 1] = pre[r] + b[r * W14 + x];
          for (let r = 0;r < H14; r++)
            a[r * W14 + x] = (pre[Math.min(H14, r + rad + 1)] - pre[Math.max(0, r - rad)]) / n;
        }
      }
      return a;
    };
    const glow = (e) => {
      const a = blur(e, 2, 2), b = blur(e, 6, 3), c = blur(e, 20, 2);
      for (let k = 0;k < N; k++)
        a[k] = a[k] * 0.5 + b[k] * 1 + c[k] * 0.22;
      return a;
    };
    const fog = new Float32Array(N);
    const HZR = new Float32Array(N), HZG = new Float32Array(N), HZB = new Float32Array(N);
    for (let k = 0;k < N; k++) {
      const s = S2[k];
      fog[k] = mat[k] === TOWER3 ? 0.1 : s > 0 ? 1 - Math.exp(-F2 / s / ZF) : 0;
      const x = k % W14, y = Math.floor(k / W14) + 0.5;
      const g = endGlow(x + 0.5, y) * 1.1;
      HZR[k] = 0.1 + g * END[0], HZG[k] = 0.07 + g * END[1], HZB[k] = 0.16 + g * END[2];
    }
    const shade = (er, eg, eb) => {
      const gr = glow(er.map((v, k) => v + LR[k])), gg = glow(eg.map((v, k) => v + LG[k])), gb = glow(eb.map((v, k) => v + LB2[k]));
      const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N);
      for (let k = 0;k < N; k++) {
        const m = mat[k];
        let r, g, b;
        if (m === SKY6 || m === WIRE) {
          r = SR2[k] + gr[k] * 0.06, g = SG[k] + gg[k] * 0.06, b = SB[k] + gb[k] * 0.06;
          if (m === WIRE)
            r = r * 0.3 + gr[k] * 0.3, g = g * 0.3 + gg[k] * 0.3, b = b * 0.3 + gb[k] * 0.3;
        } else {
          const kg = (KG[k] + (m === SIGN ? 0.05 : 0)) * 2.4;
          r = er[k] + AR[k] * (0.06 + gr[k] * kg), g = eg[k] + AG[k] * (0.05 + gg[k] * kg), b = eb[k] + AB[k] * (0.09 + gb[k] * kg);
          const f = fog[k];
          r = mix14(r, HZR[k] + gr[k] * 0.3, f), g = mix14(g, HZG[k] + gg[k] * 0.3, f), b = mix14(b, HZB[k] + gb[k] * 0.3, f);
        }
        cr[k] = r, cg[k] = g, cb[k] = b;
      }
      return [cr, cg, cb, gr, gg, gb];
    };
    const XH = H14 + EXT;
    const mirror = (cr, cg, cb) => {
      const xr = new Float32Array(W14 * XH), xg = new Float32Array(W14 * XH), xb = new Float32Array(W14 * XH);
      const xd = new Float32Array(W14 * XH).fill(-1);
      for (let k = 0;k < N; k++) {
        const m = mat[k];
        if (m === ROAD3)
          continue;
        const x = k % W14, r = k / W14 | 0;
        const s = S2[k];
        const rr2 = Math.floor(2 * HY + 2 * EYE2 * s - r - 0.5);
        if (rr2 < HY || rr2 >= XH || rr2 < H14 && mat[rr2 * W14 + x] !== ROAD3)
          continue;
        const q = rr2 * W14 + x;
        if (s <= xd[q])
          continue;
        xd[q] = s;
        const f = GIVE[m];
        xr[q] = cr[k] * f, xg[q] = cg[k] * f, xb[q] = cb[k] * f;
      }
      const rr = new Float32Array(N), rg = new Float32Array(N), rb = new Float32Array(N);
      for (let x = 0;x < W14; x++) {
        for (let r = HY + 1;r < XH; r++) {
          const q = r * W14 + x;
          if (xd[q] < 0 && xd[q - W14] >= 0)
            xr[q] = xr[q - W14], xg[q] = xg[q - W14], xb[q] = xb[q - W14], xd[q] = 0;
        }
        let ur = 0, ug = 0, ub = 0, dr = 0, dg = 0, db = 0;
        const upR = new Float32Array(XH), upG = new Float32Array(XH), upB = new Float32Array(XH);
        for (let r = XH - 1;r >= HY; r--) {
          const q = r * W14 + x;
          ur = ur * 0.96 + xr[q] * 0.04, ug = ug * 0.96 + xg[q] * 0.04, ub = ub * 0.96 + xb[q] * 0.04;
          upR[r] = ur, upG[r] = ug, upB[r] = ub;
        }
        for (let r = HY;r < H14; r++) {
          const q = r * W14 + x;
          dr = dr * 0.9 + xr[q] * 0.1, dg = dg * 0.9 + xg[q] * 0.1, db = db * 0.9 + xb[q] * 0.1;
          if (mat[q] !== ROAD3)
            continue;
          const y = r + 0.5;
          const fres = 0.45 + 0.55 * smooth14(H14 + 6, HY + 3, y);
          rr[q] = (xr[q] * 0.35 + dr * 0.5 + upR[r] * 1.1) * fres;
          rg[q] = (xg[q] * 0.35 + dg * 0.5 + upG[r] * 1.1) * fres;
          rb[q] = (xb[q] * 0.35 + db * 0.5 + upB[r] * 1.1) * fres;
        }
      }
      return [rr, rg, rb];
    };
    const [CR, CG, CB, GR, GG, GB] = shade(ER2, EG, EB);
    const [RR, RG, RB] = mirror(CR, CG, CB);
    const NG = 3;
    const dropC = [];
    const dropR = [];
    for (let gi = 1;gi <= NG; gi++) {
      const er = ER2.slice(), eg = EG.slice(), eb = EB.slice();
      for (let k = 0;k < N; k++) {
        if (grp[k] !== gi)
          continue;
        if (gi === 3)
          er[k] = 0.03 + PINK[0] * 0.05, eg[k] = 0.025 + PINK[1] * 0.05, eb[k] = 0.045 + PINK[2] * 0.05;
        else
          er[k] *= 0.08, eg[k] *= 0.08, eb[k] *= 0.08;
      }
      const [cr, cg, cb] = shade(er, eg, eb);
      const ks = [], vs = [];
      for (let k = 0;k < N; k++) {
        const d = Math.abs(CR[k] - cr[k]) + Math.abs(CG[k] - cg[k]) + Math.abs(CB[k] - cb[k]);
        if (d > 0.004)
          ks.push(k), vs.push(CR[k] - cr[k], CG[k] - cg[k], CB[k] - cb[k]);
      }
      dropC.push([Int32Array.from(ks), Float32Array.from(vs)]);
      const [rr, rg, rb] = mirror(cr, cg, cb);
      dropR.push([RR.map((v, k) => v - rr[k]), RG.map((v, k) => v - rg[k]), RB.map((v, k) => v - rb[k])]);
    }
    for (let k = 0;k < N; k++) {
      if (mat[k] !== ROAD3)
        continue;
      const s = S2[k], d = Math.abs(k % W14 + 0.5 - VX);
      const path = Math.exp(-((d / (1.4 + 0.36 * s)) ** 1.6)) * (0.16 + 0.7 * Math.exp(-s / 12));
      RR[k] += path * END[0], RG[k] += path * END[1], RB[k] += path * END[2];
    }
    const road = [];
    for (let k = 0;k < N; k++)
      if (mat[k] === ROAD3)
        road.push(k);
    const roadK = Int32Array.from(road);
    const sky = [];
    for (let k = 0;k < N; k++)
      if (mat[k] === SKY6)
        sky.push(k);
    const skyK = Int32Array.from(sky);
    const CW = 400;
    const cloud = new Float32Array(CW * HY);
    for (let r = 0;r < HY; r++)
      for (let x = 0;x < CW; x++)
        cloud[r * CW + x] = fbm14(x * 0.03, r * 0.09, 4, CW * 0.03);
    const LAYERS2 = [[150, 40, 3, 0.18, 0.1], [190, 72, 6, 0.38, 0.13], [60, 125, 11, 0.7, 0.17]];
    const drops = [];
    LAYERS2.forEach(([count, v, len, b, sl], li) => {
      for (let i = 0;i < count; i++) {
        const h = (n) => hash14(i * 7 + li * 1001, n);
        drops.push([h(1) * (W14 + 30) - 20, h(2) * (H14 + len + 6), v * (0.85 + 0.3 * h(3)), len, b * (0.75 + 0.5 * h(4)), sl]);
      }
    });
    const FR = new Float32Array(N), FG = new Float32Array(N), FB = new Float32Array(N);
    const rain = new Float32Array(N);
    const hold = new Float32Array(N);
    const walker = (t) => {
      const tau = ((t + 5.5) % 24 + 24) % 24;
      const k = clamp14((tau - 3) / 4);
      const ramp = tau < 3 ? 0 : tau < 7 ? 4 * (k * k * k - k * k * k * k / 2) : 2 + tau - 7;
      const z = 5.6 + 0.06 * tau + 0.5 * ramp;
      const xw = 4.4 - 4.05 * smooth14(0, 5.5, tau);
      return { xw, z, s: F2 / z, fade: smooth14(15, 12, z), ph: tau * 1.7 * Math.PI };
    };
    const flicker = (gi, t) => {
      const f = Math.floor(t * 15);
      if (gi === 1) {
        const c2 = (t + 3) % 9;
        return c2 < 0.9 ? hash14(f, 11) > 0.45 ? 1 : 0.1 : 0.96 + 0.04 * hash14(f, 12);
      }
      if (gi === 2) {
        const c2 = (t + 7) % 13;
        if (c2 < 0.7 || c2 > 4 && c2 < 4.8)
          return hash14(f, 21) > 0.5 ? 1 : 0;
        return c2 < 4 ? 0 : 1;
      }
      const c = (t + 1.5) % 7;
      return c < 1.2 ? hash14(f, 31) > 0.35 ? 1 : 0 : 1;
    };
    return (t, { color } = {}) => {
      FR.set(CR), FG.set(CG), FB.set(CB);
      const mg = [1, flicker(1, t), flicker(2, t), flicker(3, t)];
      for (let gi = 1;gi <= NG; gi++) {
        const off = 1 - mg[gi];
        if (off <= 0)
          continue;
        const [ks, vs] = dropC[gi - 1];
        for (let i = 0;i < ks.length; i++) {
          const k = ks[i];
          FR[k] -= vs[i * 3] * off, FG[k] -= vs[i * 3 + 1] * off, FB[k] -= vs[i * 3 + 2] * off;
        }
      }
      const drift = t * 0.9;
      for (let i = 0;i < skyK.length; i++) {
        const k = skyK[i], x = k % W14, r = k / W14 | 0;
        const sx = x + drift, ix = Math.floor(sx), fx2 = sx - ix;
        const c0 = cloud[r * CW + ix % CW], c1 = cloud[r * CW + (ix + 1) % CW];
        const c = 0.72 + 0.7 * smooth14(0.35, 0.75, c0 + (c1 - c0) * fx2);
        FR[k] *= c, FG[k] *= c, FB[k] *= c;
      }
      const wk = walker(t);
      const fs = wk.s, fx = VX + wk.xw * fs, fy = HY + EYE2 * fs;
      const fz = fs * 1.12;
      const seen = wk.fade * smooth14(3.5, 2.7, wk.xw);
      const bx0 = Math.max(0, Math.floor(fx - 0.62 * fz - 1)), bx1 = Math.min(W14 - 1, Math.ceil(fx + 0.62 * fz + 1));
      for (let i = 0;i < roadK.length; i++) {
        const k = roadK[i], x = k % W14, r = k / W14 | 0;
        const y = r + 0.5, v = (y - HY) / (H14 - HY);
        const wob = (noise14(x * 0.07 + 7, y * 0.55 - t * 0.9, 0) - 0.5) * (0.6 + 4 * v) + (noise14(x * 0.3, y * 1.3 - t * 2.1, 0) - 0.5) * (0.3 + 1.2 * v);
        let sx = x + wob;
        if (sx < 0)
          sx = 0;
        if (sx > W14 - 1.001)
          sx = W14 - 1.001;
        const j = r * W14 + (sx | 0), f = sx - (sx | 0);
        const dash = 0.3 + 1 * smooth14(0.3, 0.65, noise14(x * 0.09 + 3, y * (0.7 + 0.5 * v) - t * 1.5, 0));
        let rr = RR[j] + (RR[j + 1] - RR[j]) * f, rg = RG[j] + (RG[j + 1] - RG[j]) * f, rb = RB[j] + (RB[j + 1] - RB[j]) * f;
        for (let gi = 1;gi <= NG; gi++) {
          const off = 1 - mg[gi];
          if (off <= 0)
            continue;
          const [dr, dg, db] = dropR[gi - 1];
          rr -= (dr[j] + (dr[j + 1] - dr[j]) * f) * off, rg -= (dg[j] + (dg[j + 1] - dg[j]) * f) * off, rb -= (db[j] + (db[j + 1] - db[j]) * f) * off;
        }
        let a = dash * wet[k];
        if (seen > 0 && x >= bx0 && x <= bx1 && y > fy && y < fy + 2.3 * fz) {
          if (walkerShape((x + 0.5 - fx) / fz, (y - fy) / fz, wk.ph))
            a *= 1 - 0.8 * seen;
        }
        FR[k] += Math.max(0, rr) * a, FG[k] += Math.max(0, rg) * a, FB[k] += Math.max(0, rb) * a;
      }
      for (let li = 0;li < LANTERNS.length; li++) {
        const sw = 0.05 * Math.sin(t * 1.1 + LANTERNS[li][3]) + 0.015 * Math.sin(t * 2.7 + li);
        const ls = LANTERNS[li][0];
        lantern(li, sw, (k, r, g, b) => {
          if (S2[k] > ls)
            return;
          const f = fog[k] * 0.3;
          FR[k] = mix14(r, HZR[k], f), FG[k] = mix14(g, HZG[k], f), FB[k] = mix14(b, HZB[k], f);
        });
      }
      const chase = Math.floor(t * 6);
      for (const [k, i] of bulbs) {
        const on = (i + chase) % 3 !== 0;
        FR[k] = on ? 1 : 0.22, FG[k] = on ? 0.9 : 0.1, FB[k] = on ? 0.7 : 0.06;
      }
      {
        const c = t % 24;
        const lamp = c < 14 ? 0 : c < 17 ? 1 : 2;
        const k = 41 * W14 + 99 + lamp;
        const col = [[0.25, 1, 0.55], [1, 0.75, 0.15], [1, 0.15, 0.1]][lamp];
        FR[k] = col[0], FG[k] = col[1], FB[k] = col[2];
        for (const d of [-1, 1, -W14, W14])
          FR[k + d] += col[0] * 0.12, FG[k + d] += col[1] * 0.12, FB[k + d] += col[2] * 0.12;
        const on = t % 1.6 < 0.35;
        const kb = 8 * W14 + 99;
        FR[kb] = on ? 1 : 0.2, FG[kb] = on ? 0.15 : 0.05, FB[kb] = on ? 0.1 : 0.05;
      }
      hold.fill(0);
      if (wk.fade > 0) {
        const f = 0.7 * smooth14(8, 26, wk.z);
        const top = Math.max(0, Math.floor(fy - 2.3 * fz - 1));
        for (let r = top;r <= Math.min(H14 - 1, Math.ceil(fy)); r++) {
          for (let x = bx0;x <= bx1; x++) {
            const k = r * W14 + x;
            if (S2[k] >= fs)
              continue;
            let cov = 0, lit = 0;
            for (let q = 0;q < 4; q++) {
              const u = (x + 0.25 + 0.5 * (q & 1) - fx) / fz, v = (fy - r - 0.25 - 0.5 * (q >> 1)) / fz;
              const sh = walkerShape(u, v, wk.ph);
              if (sh)
                cov += 0.25;
              if (sh === 2)
                lit += 0.25;
            }
            if (!cov)
              continue;
            const l = lit / cov;
            let cr = 0.006 + l * GR[k] * 0.12, cg = 0.005 + l * GG[k] * 0.12, cb = 0.01 + l * GB[k] * 0.12;
            cr = mix14(cr, HZR[k], f), cg = mix14(cg, HZG[k], f), cb = mix14(cb, HZB[k], f);
            const a = cov * wk.fade;
            FR[k] = mix14(FR[k], cr, a), FG[k] = mix14(FG[k], cg, a), FB[k] = mix14(FB[k], cb, a);
            hold[k] = a * (1 - f);
          }
        }
      }
      for (let i = 0;i < 34; i++) {
        const per = 0.7 + 0.6 * hash14(i, 301), tt = t + hash14(i, 302) * per;
        const c = Math.floor(tt / per), a = (tt - c * per) / per;
        const cy = 56 + 43 * hash14(i * 7 + c, 303), xw = (hash14(i * 5 + c, 304) * 2 - 1) * 2.7;
        const s = (cy - HY) / EYE2, cx = VX + xw * s;
        const rad = (0.04 + 0.18 * a) * s, sq = EYE2 * s / F2;
        const ry = Math.max(0.6, rad * sq);
        const b = (1 - a) ** 1.4 * 0.8;
        for (let r = Math.floor(cy - ry - 1);r <= Math.ceil(cy + ry + 1); r++) {
          if (r < 0 || r >= H14)
            continue;
          for (let x = Math.floor(cx - rad - 1);x <= Math.ceil(cx + rad + 1); x++) {
            if (x < 0 || x >= W14)
              continue;
            const k = r * W14 + x;
            if (mat[k] !== ROAD3)
              continue;
            const d = Math.hypot((x + 0.5 - cx) / Math.max(0.6, rad), (r + 0.5 - cy) / ry);
            const ring = Math.exp(-(((d - 1) / 0.35) ** 2)) * b + (a < 0.12 && d < 0.6 ? 0.5 : 0);
            if (ring < 0.02)
              continue;
            FR[k] += ring * (0.4 + RR[k] * 2), FG[k] += ring * (0.44 + RG[k] * 2), FB[k] += ring * (0.55 + RB[k] * 2);
          }
        }
      }
      rain.fill(0);
      for (const [x0, y0, v, len, b, sl] of drops) {
        const span = H14 + len + 6;
        const head = (y0 + v * t) % span - 3;
        for (let i = 0;i < len; i++) {
          const y = head - i;
          const r = Math.floor(y);
          if (r < 0 || r >= H14)
            continue;
          const x = Math.floor(x0 + sl * y);
          if (x < 0 || x >= W14)
            continue;
          const k = r * W14 + x;
          const a = b * (1 - 0.7 * i / len);
          if (a > rain[k])
            rain[k] = a;
        }
      }
      for (let r = 0;r < H14; r++) {
        const y = r + 0.5;
        const fade = smooth14(H14 + 8, H14 - 6, y);
        for (let x = 0;x < W14; x++) {
          const k = r * W14 + x;
          let cr = FR[k], cg = FG[k], cb = FB[k];
          const rn = rain[k] * (1 - 0.85 * hold[k]);
          if (rn) {
            cr += rn * (0.42 + GR[k] * 0.8), cg += rn * (0.47 + GG[k] * 0.8), cb += rn * (0.6 + GB[k] * 0.8);
          }
          cr = Math.max(0, cr), cg = Math.max(0, cg), cb = Math.max(0, cb);
          const peak = Math.max(cr, cg, cb, 0.0001);
          const fl = FLOOR2[mat[k]] * (1 - hold[k]);
          const level = clamp14(fl + (1 - fl) * Math.pow(peak, 0.64) * 0.95) * fade;
          let step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER14[(r & 3) * 4 + (x & 3)])));
          if (rn > 0.22 && step < (rn > 0.55 ? 2 : 1))
            step = rn > 0.55 ? 2 : 1;
          out[k] = DOTS14[step];
          if (color) {
            const want = step ? Math.min(1, (level + 0.06) / COVER14[step]) : 0;
            const s = (0.3 + 0.7 * want) / peak;
            color[k] = nearest(clamp14(cr * s), clamp14(cg * s), clamp14(cb * s));
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H14; r++)
        lines.push(out.slice(r * W14, (r + 1) * W14).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/ascii-rest/pieces/varanasi-ghats.ts
  var exports_varanasi_ghats = {};
  __export(exports_varanasi_ghats, {
    default: () => varanasiGhats,
    meta: () => meta15
  });
  var meta15 = {
    name: "varanasi ghats",
    category: "scenes",
    note: "dusk aarti on the ganga, lamps on the steps and diyas on the water",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#0b0812",
    palette: [
      "#141230",
      "#1d1a42",
      "#272257",
      "#332b6a",
      "#45357a",
      "#5a4388",
      "#7259a8",
      "#6d3a73",
      "#8a4677",
      "#a8527a",
      "#c4607a",
      "#d97a92",
      "#b866a0",
      "#9a68c8",
      "#c868b0",
      "#e8707a",
      "#d9705f",
      "#e88552",
      "#f29f4a",
      "#f8b85a",
      "#fcd07a",
      "#ffe3a6",
      "#fff2d2",
      "#1a1220",
      "#24182a",
      "#301f33",
      "#3f2838",
      "#523340",
      "#3a2c4c",
      "#4d3a64",
      "#5e3524",
      "#7d4527",
      "#a0582a",
      "#c06e2e",
      "#d98a46",
      "#ffffff",
      "#fff6d8",
      "#ffd860",
      "#ff9f2a",
      "#f06a1e",
      "#c8401a",
      "#8a2a16",
      "#0f1a2c",
      "#162540",
      "#20325a",
      "#d6d4ee"
    ]
  };
  var W15 = 200;
  var H15 = 100;
  var HZ8 = 60;
  var END2 = 150;
  var GLOW = [156, HZ8 - 1.5];
  var DOTS15 = " ·•●";
  var COVER15 = [0, 0.3, 0.6, 1];
  var LIFT = [0, 2.5, 1.7, 1.35];
  var BAYER15 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  var FLAME2 = [1, 0.62, 0.22];
  var WASH = [1, 0.5, 0.2];
  var SKY7 = 0;
  var WATER2 = 1;
  var BANK2 = 2;
  var STEPS = 3;
  var BLD = 4;
  var SPIRE = 5;
  var UMB = 6;
  var FIG = 7;
  var PLAT = 8;
  var RAMP = [
    [0, 0.085, 0.07, 0.24],
    [0.14, 0.13, 0.1, 0.34],
    [0.28, 0.22, 0.14, 0.44],
    [0.42, 0.34, 0.17, 0.48],
    [0.52, 0.47, 0.21, 0.47],
    [0.62, 0.6, 0.26, 0.42],
    [0.7, 0.7, 0.31, 0.36],
    [0.78, 0.8, 0.39, 0.3],
    [0.86, 0.88, 0.5, 0.26],
    [0.92, 0.95, 0.65, 0.32],
    [0.97, 1, 0.8, 0.48],
    [1, 1, 0.92, 0.7]
  ];
  function hash15(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise15(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
      x0 = (xi % period + period) % period;
      x1 = (x0 + 1) % period;
    }
    const a = hash15(x0, yi), b = hash15(x1, yi), c = hash15(x0, yi + 1), d = hash15(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm15(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for (let i = 0;i < octaves; i++) {
      s += amp * noise15(x * f, y * f, period * f);
      n += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  var clamp15 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var smooth15 = (a, b, v) => {
    const k = clamp15((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  var mix15 = (a, b, k) => a + (b - a) * k;
  var hex15 = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  var RL = 256;
  var RT = new Float32Array((RL + 1) * 3);
  for (let i = 0;i <= RL; i++) {
    const h = i / RL;
    let j = 0;
    while (j < RAMP.length - 2 && h > RAMP[j + 1][0])
      j++;
    const [h0, r0, g0, b0] = RAMP[j], [h1, r1, g1, b1] = RAMP[j + 1];
    const k = clamp15((h - h0) / (h1 - h0));
    RT[i * 3] = mix15(r0, r1, k), RT[i * 3 + 1] = mix15(g0, g1, k), RT[i * 3 + 2] = mix15(b0, b1, k);
  }
  var rampAt = (h) => (h < 0 ? 0 : h > 1 ? 1 : h) * RL + 0.5 | 0;
  var wlF = (x) => x < END2 ? HZ8 + 0.5 + 20 * Math.pow(1 - x / END2, 1.6) : HZ8 + 0.5;
  var scF2 = (x) => 0.45 + 1.75 * Math.pow(Math.max(0, 1 - x / END2), 1.3);
  var stepTopF = (x) => wlF(x) - 9.5 * scF2(x) * (0.3 + 0.7 * smooth15(END2, END2 - 16, x));
  function skyHeat(x, y) {
    const v = clamp15(y / HZ8);
    const dx = Math.abs(x - GLOW[0]), dy = Math.abs(GLOW[1] - y);
    const wide = 0.46 * Math.exp(-dx / 55 - dy / 23);
    const core = 0.24 * Math.exp(-Math.sqrt((dx / 13) ** 2 + (dy / 4.5) ** 2));
    return 0.06 + 0.42 * v * v + wide + core;
  }
  function varanasiGhats() {
    const P = meta15.palette.map(hex15);
    const STAR = P.length - 1;
    const N = W15 * H15;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b) => {
      const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
      if (lut[k] !== 255)
        return lut[k];
      let best = 0, bd = 1e9;
      for (let i = 0;i < STAR; i++) {
        const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
        const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
        if (d < bd)
          bd = d, best = i;
      }
      return lut[k] = best;
    };
    const blds = [];
    for (let x = -6;x < END2 - 10; ) {
      const s = scF2(Math.max(0, x));
      const w = (8 + 10 * hash15(x | 0, 3)) * s;
      const low = (x > 110 ? 0.8 : 1) * (0.45 + 0.55 * smooth15(END2 - 8, END2 - 34, x));
      blds.push([x, x + w, (7 + 9 * hash15(x | 0, 4)) * low, hash15(x | 0, 5)]);
      x += w;
    }
    const spires = [[118, 33, 5.2], [64, 19, 4], [31, 15, 3.6], [139, 8, 1.6], [90, 11, 2.4], [129, 10, 2]];
    const aarti = [[11, 1.15, 1.25], [24, 0.8, 0.85], [39, 1.25, 1.1], [54, 0.75, 0.75]];
    const umbs = [70, 83, 98, 109];
    const mat = new Uint8Array(N);
    const sR = new Float32Array(N), sG = new Float32Array(N), sB = new Float32Array(N);
    const flo = new Float32Array(N);
    const alb = new Float32Array(N);
    const skyH = new Float32Array(N);
    const warm = new Float32Array(N);
    const roofOf = (x) => {
      for (const [x0, x1, h] of blds)
        if (x >= x0 && x < x1)
          return stepTopF(x) - h * scF2(x);
      return stepTopF(x);
    };
    for (let r = 0;r < H15; r++) {
      for (let x = 0;x < W15; x++) {
        const k = r * W15 + x;
        const xc = x + 0.5, y = r + 0.5;
        const wl = wlF(xc);
        if (y >= wl) {
          mat[k] = WATER2;
          alb[k] = 0.25;
          continue;
        }
        let m = SKY7, cr = 0, cg = 0, cb = 0, fl = 0.06, al = 0;
        const s = scF2(xc);
        const clump = smooth15(0.42, 0.72, fbm15(xc * 0.11, 3, 3, 0)) * smooth15(160, 172, xc);
        const bankTop = HZ8 - 2.2 - 0.6 * fbm15(xc * 0.4, 7, 2, 0) - 4 * clump;
        if (xc >= END2 - 4 && y >= bankTop)
          m = BANK2, cr = 0.1, cg = 0.07, cb = 0.125, fl = 0.03;
        if (xc < END2) {
          const st = stepTopF(xc);
          let roof = st, bi = -1;
          for (let i = 0;i < blds.length; i++)
            if (xc >= blds[i][0] && xc < blds[i][1])
              roof = st - blds[i][2] * s, bi = i;
          let top = roof;
          if (bi >= 0) {
            const [x0, x1, , hb] = blds[bi];
            const mid = (x0 + x1) / 2, half = (x1 - x0) / 2;
            if (hb > 0.45) {
              const cx = hb > 0.75 ? x0 + half * 0.4 : mid;
              const dx = Math.abs(xc - cx) / (1.6 * s);
              if (dx < 1)
                top = Math.min(top, roof - 1.4 * s - 1.5 * s * Math.sqrt(1 - dx * dx));
              if (dx < 1.1 && dx > 0.7)
                top = Math.min(top, roof - 1.4 * s);
            }
            if (Math.abs(xc - x0) < 0.6 * s || Math.abs(xc - x1) < 0.6 * s)
              top = Math.min(top, roof - 0.6 * s);
          }
          if (y >= top && y < st) {
            m = BLD;
            cr = 0.075, cg = 0.05, cb = 0.09;
            const fy = (y - top) / Math.max(1, st - top);
            cr *= 1.1 - 0.4 * fy, cg *= 1.1 - 0.4 * fy, cb *= 1.1 - 0.3 * fy;
            al = 0.5;
            if (bi >= 0 && s > 0.6) {
              const fx = (xc - blds[bi][0]) / (2.4 * s), fz = (st - y) / (3 * s);
              const ix = Math.floor(fx), iz = Math.floor(fz);
              if (fx - ix > 0.35 && fx - ix < 0.7 && fz - iz > 0.25 && fz - iz < 0.75 && iz >= 1 && st - y < blds[bi][2] * s - 1.5 * s) {
                const lit = hash15(bi * 31 + ix, iz * 7) < (s > 1.2 ? 0.28 : 0.2);
                if (lit)
                  cr += 0.5, cg += 0.28, cb += 0.08;
                else
                  cr *= 0.55, cg *= 0.55, cb *= 0.65, al = 0.2;
              }
            }
            fl = 0.14;
          }
          if (y >= st) {
            m = STEPS;
            const sp = 1.6 * s;
            const near = (wl - y) / (wl - st);
            if (sp < 2.2) {
              const odd = Math.floor(wl - y) & 1;
              cr = 0.19, cg = 0.13, cb = 0.25;
              if (odd)
                cr *= 0.55, cg *= 0.55, cb *= 0.58;
              al = odd ? 0.4 : 0.75;
            } else {
              const ph = (wl - y) / sp % 1;
              if (ph < 0.6)
                cr = 0.24 + 0.05 * (1 - near), cg = 0.15, cb = 0.2, al = 1;
              else
                cr = 0.05, cg = 0.035, cb = 0.06, al = 0.3;
            }
            if (wl - y < 1.2 * s)
              cr *= 0.6, cg *= 0.6, cb *= 0.75, al *= 0.6;
            fl = 0.12;
          }
        }
        for (const [sx, sh, sw] of spires) {
          const base = roofOf(sx) + 1;
          const h = base - y;
          if (h < -1 || h > sh + 2.5)
            continue;
          const dx = Math.abs(xc - sx);
          const f = h / sh;
          let hw = f <= 1 ? sw * Math.pow(Math.max(0, 1 - Math.pow(f, 1.8)), 0.6) : 0;
          if (f > 0.92 && f < 1.02)
            hw = Math.max(hw, sw * 0.32);
          if (f >= 1.02 && h < sh + 2.2)
            hw = Math.max(hw, 0.35 + 0.2 * Math.sin((h - sh) / 2.2 * Math.PI));
          if (h >= -1 && h < 0.5)
            hw = sw * 1.15;
          if (dx <= hw) {
            m = SPIRE;
            const band = Math.floor(h / 1.6) % 2 ? 0.8 : 1;
            cr = 0.085 * band, cg = 0.055 * band, cb = 0.095 * band;
            fl = 0.12, al = 0.35;
          }
        }
        for (const ux of umbs) {
          const s2 = scF2(ux), wl2 = wlF(ux);
          const cy = wl2 - (wl2 - stepTopF(ux)) * 0.55;
          const dx = (xc - ux) / (3 * s2), dy = (cy - y) / (1.4 * s2);
          if (dy > 0 && dy < 1 && Math.abs(dx) < Math.sqrt(1 - dy * dy))
            m = UMB, cr = 0.07, cg = 0.045, cb = 0.075, al = 0.4;
          if (dy <= 0 && dy > -0.25 && Math.abs(dx) < 1)
            m = UMB, cr = 0.05, cg = 0.03, cb = 0.05, al = 0.2;
          if (Math.abs(xc - ux) < 0.5 && y > cy && y < cy + 2.2 * s2)
            m = UMB, cr = 0.04, cg = 0.03, cb = 0.04, al = 0.1;
        }
        for (const [ax] of aarti) {
          const s2 = scF2(ax), u = 1.3 * s2, base = wlF(ax) - 2.6 * s2;
          const dx = (xc - ax) / u;
          const fy = (base - y) / u;
          const bw = fy < 0 ? -1 : fy < 2.2 ? 0.66 - 0.04 * fy : fy < 4.1 ? 0.58 + 0.32 * smooth15(2.2, 3.7, fy) : fy < 4.5 ? 0.28 : -1;
          const head = Math.hypot(dx * 1.05, fy - 5.05) < 0.62;
          if (Math.abs(dx) < bw || head)
            m = FIG, cr = 0.035, cg = 0.022, cb = 0.035, fl = 0.02, al = 0.04;
          if (y >= base && y < base + 0.7 * s2 && Math.abs(xc - ax) < 2.3 * u)
            m = PLAT, cr = 0.12, cg = 0.07, cb = 0.06, fl = 0.04, al = 0.8;
        }
        if (m === SKY7) {
          const veil = 0.92 + 0.16 * fbm15(x * 0.05, r * 0.1, 3, 0);
          const hh = skyHeat(xc, y) + 0.05 * (fbm15(x * 0.07 + 11, r * 0.16, 2, 0) - 0.5) + 0.1 * (fbm15(x * 0.025 + 3, r * 0.09 + 5, 3, 0) - 0.5);
          skyH[k] = hh;
          warm[k] = smooth15(0.3, 0.9, hh);
          const i = rampAt(hh) * 3;
          cr = RT[i] * veil, cg = RT[i + 1] * veil, cb = RT[i + 2] * veil;
          fl = 0.2;
        }
        mat[k] = m;
        sR[k] = cr, sG[k] = cg, sB[k] = cb, flo[k] = fl, alb[k] = al;
      }
    }
    const rimR = new Float32Array(N), rimG = new Float32Array(N), rimB = new Float32Array(N);
    for (let r = 1;r < H15 - 1; r++) {
      for (let x = 2;x < W15 - 2; x++) {
        const k = r * W15 + x;
        const m = mat[k];
        if (m === SKY7 || m === WATER2)
          continue;
        const toward = x < GLOW[0] ? 1 : -1;
        const strong = 0.75 * Math.exp(-Math.abs(x - GLOW[0]) / 42);
        let a = 0;
        if (mat[k + toward] === SKY7)
          a = strong;
        else if (mat[k + 2 * toward] === SKY7)
          a = strong * 0.4;
        if (a > 0)
          rimR[k] = 0.85 * a, rimG[k] = 0.45 * a, rimB[k] = 0.26 * a;
        if (mat[k - W15] === SKY7)
          rimR[k] += sR[k - W15] * 0.3, rimG[k] += sG[k - W15] * 0.3, rimB[k] += sB[k - W15] * 0.3;
      }
    }
    for (let k = 0;k < N; k++)
      sR[k] += rimR[k], sG[k] += rimG[k], sB[k] += rimB[k];
    const stepLamps = [];
    for (let x = 2;x < 118; x++) {
      const s = scF2(x + 0.5);
      for (let r = Math.floor(stepTopF(x + 0.5));r < wlF(x + 0.5) - 1; r++) {
        const k = r * W15 + x;
        if (mat[k] !== STEPS)
          continue;
        const near = Math.exp(-(((x - 33) / 36) ** 2));
        if (hash15(x * 3 + 7, r * 5) < 0.035 * near + 0.006 && (wlF(x + 0.5) - r - 0.5) / (1.6 * s) % 1 < 0.3)
          stepLamps.push([k, hash15(x, r) * 40]);
      }
    }
    const sref = new Float32Array(N);
    for (let x = 58;x < END2 - 3; ) {
      const s = scF2(x);
      const ly = stepTopF(x) - 0.4 * s + (wlF(x) - stepTopF(x)) * 0.55 * hash15(x | 0, 78) ** 2;
      const halo = 1 + 3.2 * s, R = Math.ceil(halo * 3);
      for (let r = Math.max(0, Math.floor(ly - R));r < Math.min(H15, ly + R); r++) {
        for (let xx = Math.max(0, Math.floor(x - R));xx < Math.min(W15, x + R); xx++) {
          const k = r * W15 + xx;
          if (mat[k] === WATER2 || mat[k] === SKY7)
            continue;
          const dx = xx + 0.5 - x, dy = r + 0.5 - ly;
          const d = Math.sqrt(dx * dx + dy * dy);
          const v = Math.exp(-((d / 0.6) ** 2)) * 1.3 + Math.exp(-d / 1.4) * 0.12;
          const p = Math.exp(-d / halo) * 0.3 * alb[k];
          sR[k] += v + p * WASH[0], sG[k] += v * 0.76 + p * WASH[1], sB[k] += v * 0.42 + p * WASH[2];
        }
      }
      const wl = wlF(x), width = 0.35 + 0.35 * s, len = 9 * s;
      for (let r = Math.floor(wl);r < H15; r++) {
        const a = Math.exp(-(r + 0.5 - wl) / len) * 0.5;
        if (a < 0.01)
          break;
        for (let xx = Math.floor(x - 3);xx < x + 3; xx++)
          sref[r * W15 + xx] += a * Math.exp(-(((xx + 0.5 - x) / width) ** 2));
      }
      x += (5 + 10 * hash15(x | 0, 77)) * Math.max(0.8, s);
    }
    const refl = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
    const mirK = new Int32Array(N).fill(-1);
    for (let r = 0;r < H15; r++) {
      for (let x = 0;x < W15; x++) {
        const k = r * W15 + x;
        if (mat[k] !== WATER2)
          continue;
        const wl = wlF(x + 0.5), d = r + 0.5 - wl;
        let ar = 0, ag = 0, ab = 0;
        for (let o = 0;o < 2; o++) {
          const ym = wl - d * 0.85 - 0.4 - o * 0.8;
          let cr, cg, cb;
          const q = ym < 0 ? -1 : Math.floor(ym) * W15 + x;
          const i = rampAt(skyHeat(x + 0.5, Math.max(0, wl - d * 0.36 - 1 - o * 0.6))) * 3;
          if (q < 0 || mat[q] === WATER2 || mat[q] === SKY7)
            cr = RT[i], cg = RT[i + 1], cb = RT[i + 2];
          else {
            cr = sR[q] + RT[i] * 0.22, cg = sG[q] + RT[i + 1] * 0.22, cb = sB[q] + RT[i + 2] * 0.22;
            if (o === 0)
              mirK[k] = q;
          }
          ar += cr, ag += cg, ab += cb;
        }
        const a = 0.8 - 0.4 * smooth15(HZ8, H15, r);
        refl[0][k] = ar / 2 * a, refl[1][k] = ag / 2 * a, refl[2][k] = ab / 2 * a;
      }
    }
    const CW = 800, CH = HZ8 - 6;
    const cover = new Float32Array(CW * CH);
    const clit = new Float32Array(CW * CH);
    const density = (x, y) => {
      const q = fbm15(x * 0.005, y * 0.03, 3, 4);
      const d = fbm15(x * 0.0125 + q * 1.8, y * 0.09 + q * 0.9, 5, 10);
      const env = 0.03 * Math.exp(-(((y - 13) / 4) ** 2)) + 0.1 * Math.exp(-(((y - 29) / 5.5) ** 2));
      const c = 46.5 + 3 * (fbm15(x * 0.01, 9.5, 2, 8) - 0.5);
      const th = 1 + 0.9 * fbm15(x * 0.05, 3.5, 2, 40);
      const streak = Math.exp(-(((y - c) / th) ** 2)) * smooth15(0.42, 0.6, fbm15(x * 0.0125, 21.5, 3, 10)) * (0.75 + 0.5 * fbm15(x * 0.05, y * 0.3, 3, 40));
      return Math.max(d + env - 0.08, 0.36 + 0.3 * streak);
    };
    for (let r = 0;r < CH; r++) {
      for (let x = 0;x < CW; x++) {
        const y = r + 0.5;
        const d = density(x, y);
        cover[r * CW + x] = smooth15(0.47, 0.62, d);
        clit[r * CW + x] = clamp15(0.4 + (d - density(x, y + 2)) * 5.5 + (density(x, y - 2.5) - d) * 1.5);
      }
    }
    const diyas = [];
    for (let i = 0;i < 34; i++) {
      const q = hash15(i, 61);
      const y = HZ8 + 5 + 34 * Math.pow(q, 1.3);
      diyas.push([hash15(i, 62) * 260 - 30, y, hash15(i, 63) * 50, 0.6 + 0.6 * hash15(i, 64)]);
    }
    const dyn = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
    const dref = new Float32Array(N);
    const arm = new Uint8Array(N);
    const addGlow = (fx, fy, core, halo, amp) => {
      const R = Math.ceil(halo * 3.2);
      for (let r = Math.max(0, Math.floor(fy - R));r < Math.min(H15, fy + R); r++) {
        for (let x = Math.max(0, Math.floor(fx - R));x < Math.min(W15, fx + R); x++) {
          const k = r * W15 + x;
          const dx = x + 0.5 - fx, dy = (r + 0.5 - fy) * 0.85;
          const d = Math.sqrt(dx * dx + dy * dy);
          const am = mat[k] === FIG ? amp * 0.15 : amp;
          const c = Math.exp(-((d / core) ** 2)) * 1.6 * am, v = Math.exp(-d / halo) * 0.35 * am;
          dyn[0][k] += c + v * FLAME2[0], dyn[1][k] += c * 0.86 + v * FLAME2[1], dyn[2][k] += c * 0.55 + v * FLAME2[2];
        }
      }
    };
    const addWash = (fx, fy, halo, amp) => {
      const R = Math.ceil(halo * 2.6);
      for (let r = Math.max(0, Math.floor(fy - R));r < Math.min(H15, fy + R); r++) {
        for (let x = Math.max(0, Math.floor(fx - R));x < Math.min(W15, fx + R); x++) {
          const k = r * W15 + x;
          const a = alb[k];
          if (!a)
            continue;
          const dx = x + 0.5 - fx, dy = r + 0.5 - fy;
          const v = Math.exp(-Math.sqrt(dx * dx + dy * dy) / halo) * amp * a;
          dyn[0][k] += v * WASH[0], dyn[1][k] += v * WASH[1], dyn[2][k] += v * WASH[2];
        }
      }
    };
    const addStreak = (fx, wl, width, len, amp) => {
      for (let r = Math.max(0, Math.floor(wl));r < H15; r++) {
        const dy = r + 0.5 - wl;
        const a = Math.exp(-dy / len) * amp * smooth15(-0.5, 1, dy);
        if (a < 0.01)
          break;
        for (let x = Math.max(0, Math.floor(fx - 3 * width - 1));x < Math.min(W15, fx + 3 * width + 1); x++) {
          const k = r * W15 + x;
          if (mat[k] === WATER2)
            dref[k] += a * Math.exp(-(((x + 0.5 - fx) / width) ** 2));
        }
      }
    };
    const BS = 0.85;
    const boatAt = (lx, ly) => {
      const L = 9;
      if (Math.abs(lx) < L && ly > -0.6 && ly < 1.2 + 1.4 * Math.pow(Math.abs(lx) / L, 3))
        return 1;
      if (lx > 4.6 && lx < 5.8 && ly > 0 && ly < 6.6)
        return 1;
      if (Math.abs(lx - 5.2) < 0.7 && Math.abs(ly - 7.2) < 0.7)
        return 1;
      const ox = lx - 5.6, oy = ly - 5.4;
      const along = ox * 0.42 - oy * 0.91;
      if (along > 0 && along < 8 && Math.abs(ox * 0.91 + oy * 0.42) < 0.32)
        return 1;
      if (lx > -4 && lx < -0.5 && ly > 0 && ly < 2.6 - 0.25 * Math.abs(lx + 2.2))
        return 1;
      return 0;
    };
    return (t, { color } = {}) => {
      for (let c = 0;c < 3; c++)
        dyn[c].fill(0);
      dref.fill(0);
      arm.fill(0);
      aarti.forEach(([ax, sw, sl], i) => {
        const s = scF2(ax), u = 1.3 * s, base = wlF(ax) - 2.6 * s;
        const ph = t * 1.1 + i * 1.3;
        const fx = ax + 0.9 * u + Math.cos(ph) * 1.1 * u, fy = base - 7.2 * u + Math.sin(ph) * 0.6 * u;
        const sx0 = ax + 0.62 * u, sy0 = base - 3.8 * u;
        const ex = fx - sx0, ey = fy + 0.6 * u - sy0, el = ex * ex + ey * ey;
        for (let r = Math.floor(Math.min(sy0, fy) - 1);r <= Math.max(sy0, fy) + 1; r++) {
          for (let x = Math.floor(Math.min(sx0, fx) - 1);x <= Math.max(sx0, fx) + 1; x++) {
            if (x < 0 || x >= W15 || r < 0 || r >= H15)
              continue;
            const px = x + 0.5 - sx0, py = r + 0.5 - sy0;
            const q = clamp15((px * ex + py * ey) / el);
            if (Math.hypot(px - q * ex, py - q * ey) < 0.28 * u)
              arm[r * W15 + x] = 1;
          }
        }
        const fl = 0.85 + 0.15 * Math.sin(t * 13 + i * 5) * Math.sin(t * 7.3 + i);
        addGlow(fx, fy, 0.6 * u, 1.7 * u, fl);
        addWash(fx, fy + 2 * u, 7.5 * s, 0.34 * fl);
        addStreak(fx, wlF(fx), 0.8 * s * sw, 15 * s * sl, 0.75 * fl);
      });
      for (const [k, ph] of stepLamps) {
        const v = 0.7 + 0.3 * Math.sin(t * 5 + ph);
        dyn[0][k] += v * FLAME2[0], dyn[1][k] += v * FLAME2[1] * 0.95, dyn[2][k] += v * FLAME2[2];
      }
      for (const [x0, y, ph, sz] of diyas) {
        const near = (y - HZ8) / (H15 - HZ8);
        const x = ((x0 + t * (0.25 + 0.9 * near)) % 260 + 260) % 260 - 30;
        if (x < -3 || x > W15 + 3 || y < wlF(x) + 0.8)
          continue;
        const fl = 0.8 + 0.2 * Math.sin(t * 9 + ph);
        const s = (0.35 + 0.9 * near) * sz;
        addGlow(x, y - 0.3, 0.45 + 0.3 * s, 0.6 + 1.2 * s, fl * 0.8);
        addStreak(x, y + 0.2, 0.3 + 0.35 * s, 2 + 5 * s, 0.6 * fl);
      }
      const drift = t * 0.9 + 720;
      const bx = ((159 - t * 0.1 + 24) % 250 + 250) % 250 - 24, by = 71 + Math.sin(t * 0.9) * 0.15;
      for (let r = 0;r < H15; r++) {
        const y = r + 0.5;
        for (let x = 0;x < W15; x++) {
          const k = r * W15 + x;
          const m = mat[k];
          let cr = sR[k], cg = sG[k], cb = sB[k], floor = flo[k], fade = 1, star = false;
          if (m === SKY7) {
            if (r < CH) {
              const sx = x + drift, ix = Math.floor(sx), fx = sx - ix;
              const i0 = r * CW + ix % CW, i1 = r * CW + (ix + 1) % CW;
              const c = cover[i0] + (cover[i1] - cover[i0]) * fx;
              if (c > 0.01) {
                const l = clit[i0] + (clit[i1] - clit[i0]) * fx;
                const lo = smooth15(12, 30, y);
                const lit = mix15(0.3 + 0.7 * l, 0.9 * l * l, lo);
                const i = rampAt(0.56 + 0.38 * warm[k] + 0.08 * l) * 3;
                const kr = mix15(0.075, RT[i], lit), kg = mix15(0.05, RT[i + 1], lit), kb = mix15(0.15, RT[i + 2], lit);
                cr = mix15(cr, kr, c), cg = mix15(cg, kg, c), cb = mix15(cb, kb, c);
                floor = mix15(floor, 0.06, c * (1 - lit));
              } else if (y < 24 && hash15(x, r * 3 + 11) > 0.993) {
                const tw = 0.4 + 0.25 * Math.sin(t * (1.3 + hash15(x, r) * 2) + hash15(r, x) * 6.28);
                cr = Math.max(cr, tw * 0.9), cg = Math.max(cg, tw * 0.88), cb = Math.max(cb, tw);
                star = true;
              }
            }
          } else if (m === WATER2) {
            const v = (y - HZ8) / (H15 - HZ8);
            const w = 0.6 * noise15(x * 0.05 + t * 0.08, y * 0.45 - t * 0.45, 0) + 0.4 * noise15(x * 0.16 - t * 0.15, y * 0.95 - t * 0.9, 0);
            const swell = 0.55 + 0.9 * w;
            cr = 0.035 * swell, cg = 0.045 * swell, cb = 0.12 * swell;
            const wob = (noise15(x * 0.04 + 7, y * 0.3 - t * 0.6, 0) - 0.5) * (1.2 + 4 * v);
            let sx = x + wob;
            if (sx < 0)
              sx = 0;
            if (sx > W15 - 1.001)
              sx = W15 - 1.001;
            const i0 = r * W15 + (sx | 0), fx = sx - (sx | 0);
            const dash = smooth15(0.25, 0.75, noise15(x * 0.12 + 3, y * 0.8 - t * 1.1, 0));
            const ref = (a) => a[i0] + (a[i0 + 1] - a[i0]) * fx;
            const reach = Math.exp(-(((x + 0.5 - GLOW[0]) / 15) ** 2)) * smooth15(HZ8 + 2.5, HZ8 + 5.5, y);
            const da = mix15(0.15 + 1.1 * dash, 0.7 + 0.5 * dash, reach);
            cr += ref(refl[0]) * da, cg += ref(refl[1]) * da, cb += ref(refl[2]) * da;
            const q = mirK[k];
            if (q >= 0)
              cr += dyn[0][q] * 0.4 * da, cg += dyn[1][q] * 0.4 * da, cb += dyn[2][q] * 0.4 * da;
            const fl = (ref(dref) + ref(sref)) * (0.2 + 1.1 * dash);
            cr += fl * FLAME2[0], cg += fl * FLAME2[1], cb += fl * FLAME2[2];
            const gw = 1.3 + (y - HZ8) * 0.15;
            const gx = (x + 0.5 - GLOW[0]) / gw;
            if (gx > -3 && gx < 3) {
              const road = Math.exp(-gx * gx) * Math.exp(-(y - HZ8) / 24);
              const rip = noise15(x * 0.45 + y * 0.1 - t * 0.3, y * 1.3 - t * 1.6, 0);
              const glint = smooth15(0.42, 0.78, 0.45 * w + 0.55 * rip) * road;
              cr += 1 * glint + 0.12 * road, cg += 0.78 * glint + 0.07 * road, cb += 0.42 * glint + 0.04 * road;
            }
            floor = 0.12;
            fade = smooth15(H15 + 4, H15 - 16, y);
          }
          const lx = x + 0.5 - bx;
          if (lx > -14 && lx < 15 && r > by - 11 && r < by + 11) {
            let cov = 0, rc = 0;
            for (let sy2 = 0;sy2 < 2; sy2++)
              for (let sx2 = 0;sx2 < 2; sx2++) {
                const px = (lx - 0.25 + sx2 * 0.5) / BS, py = (by - (r + 0.25 + sy2 * 0.5)) / BS;
                cov += boatAt(px, py);
                if (m === WATER2)
                  rc += boatAt(px, -py * 0.9);
              }
            cov /= 4, rc /= 4;
            if (cov > 0) {
              cr = mix15(cr, 0.035, cov), cg = mix15(cg, 0.022, cov), cb = mix15(cb, 0.035, cov);
              floor = mix15(floor, 0.02, cov), star = false;
            } else if (rc > 0)
              cr *= 1 - 0.8 * rc, cg *= 1 - 0.8 * rc, cb *= 1 - 0.75 * rc;
          }
          if (arm[k])
            cr = 0.035 + dyn[0][k] * 0.12, cg = 0.022 + dyn[1][k] * 0.12, cb = 0.035 + dyn[2][k] * 0.12, floor = 0.02;
          else
            cr += dyn[0][k], cg += dyn[1][k], cb += dyn[2][k];
          const peak = Math.max(cr, cg, cb, 0.0001);
          const level = clamp15(floor + (1 - floor) * Math.pow(peak, 0.72) * 0.95) * fade;
          const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER15[(r & 3) * 4 + (x & 3)])));
          out[k] = DOTS15[step];
          if (color) {
            if (star)
              color[k] = STAR;
            else {
              const want = step ? Math.min(1, (level + 0.06) / COVER15[step]) : 0;
              const s = Math.min(LIFT[step], (0.3 + 0.7 * want) / peak);
              color[k] = nearest(clamp15(cr * s), clamp15(cg * s), clamp15(cb * s));
            }
          }
        }
      }
      const lines = [];
      for (let r = 0;r < H15; r++)
        lines.push(out.slice(r * W15, (r + 1) * W15).join(""));
      return lines.join(`
`);
    };
  }

  // Sources/Fine/Scenes/catalog.ts
  var scenes = {
    "alpine-dawn": exports_alpine_dawn,
    "aurora-fjord": exports_aurora_fjord,
    "deep-reef": exports_deep_reef,
    "desert-night": exports_desert_night,
    earthrise: exports_earthrise,
    "kyoto-dusk": exports_kyoto_dusk,
    "lantern-lake": exports_lantern_lake,
    "marine-drive": exports_marine_drive,
    "misty-forest": exports_misty_forest,
    "night-coast": exports_night_coast,
    "ocean-sunset": exports_ocean_sunset,
    "storm-plains": exports_storm_plains,
    "taj-dawn": exports_taj_dawn,
    "tokyo-rain": exports_tokyo_rain,
    "varanasi-ghats": exports_varanasi_ghats
  };

  // Sources/Fine/Scenes/scene.ts
  var canvas = document.querySelector("#scene");
  var outgoing = document.querySelector("#outgoing");
  var composite = document.createElement("canvas");
  var name = location.hash.slice(1);
  if (!scenes[name])
    name = "misty-forest";
  var source = scenes[name];
  var frame = source.default();
  var frames = new Map([[name, frame]]);
  var elapsed = 0;
  var current = 0;
  var draws = 0;
  var playing = false;
  var fade;
  var stop = () => {};
  var times = new Map;
  var piece = () => ({
    meta: source.meta,
    default: () => (time, env) => {
      current = time;
      draws++;
      return frame(elapsed + time, env);
    }
  });
  function paint() {
    stop = mount(canvas, piece(), { fps: playing ? source.meta.fps : 0 });
    document.title = source.meta.name + " — ascii.rest";
  }
  function freezePresentation() {
    composite.width = canvas.width;
    composite.height = canvas.height;
    const ctx = composite.getContext("2d");
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
    outgoing.getContext("2d").drawImage(composite, 0, 0);
  }
  paint();
  window.fineScene = {
    names: Object.keys(scenes),
    setScene(next, animated = true) {
      if (!scenes[next] || next === name)
        return;
      freezePresentation();
      stop();
      times.set(name, elapsed + current);
      name = next;
      source = scenes[name];
      frame = frames.get(name) ?? source.default();
      frames.set(name, frame);
      elapsed = times.get(name) ?? 0;
      current = 0;
      paint();
      outgoing.style.opacity = "0";
      if (animated) {
        fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 220,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
          fill: "none"
        });
      }
    },
    setPlaying(value) {
      if (playing === value)
        return;
      stop();
      elapsed += current;
      current = 0;
      playing = value;
      paint();
    },
    thumbnail() {
      return canvas.toDataURL("image/png");
    },
    get state() {
      return {
        id: name,
        name: source.meta.name,
        playing,
        time: elapsed + current,
        draws,
        width: canvas.width,
        height: canvas.height,
        transitioning: fade?.playState === "running",
        outgoingOpacity: Number(getComputedStyle(outgoing).opacity),
        layers: document.querySelectorAll("canvas").length
      };
    }
  };
})();
