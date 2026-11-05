// Turns the private originals in brand-source/ into the web masters used by the site.
// Run with `npm run assets` whenever an original changes. The outputs are committed,
// so the public build never needs the originals.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE = "brand-source";
const MASTERS = "src/_images";
const STATIC_BRAND = "src/assets/images/brand";

const LOGO = `${SOURCE}/logo-principal.webp`;
const EMBLEM = `${SOURCE}/embleme.webp`;
const BANNER = `${SOURCE}/banniere.webp`;

const PAGE_BLACK = "#0B0B0D";
const PAGE_BLACK_RGB = [0x0b, 0x0b, 0x0d];
const MASTER_WEBP = { quality: 95, alphaQuality: 95, effort: 6 };

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// The originals sit on near-black with no transparency. Brightness becomes opacity, so
// they can be layered and animated freely. `fade` optionally dissolves what lies far
// from the centre, which removes the red haze around the emblem.
async function keyToTransparent(pipeline, { floor, knee, fade }) {
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const o = (y * width + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      let alpha = smoothstep(floor, knee, Math.max(r, g, b) / 255);

      if (fade) {
        const dx = (x - fade.cx * width) / (fade.rx * width);
        const dy = (y - fade.cy * height) / (fade.ry * height);
        alpha *= 1 - smoothstep(fade.inner, 1, Math.hypot(dx, dy));
      }

      // Brighten what turned translucent, so it reads the same once composited on black.
      const gain = alpha > 0 ? Math.min(1 / Math.max(alpha, 0.35), 2.2) : 1;
      out[o] = Math.min(255, r * gain);
      out[o + 1] = Math.min(255, g * gain);
      out[o + 2] = Math.min(255, b * gain);
      out[o + 3] = Math.round(alpha * 255);
    }
  }

  return sharp(out, { raw: { width, height, channels: 4 } });
}

// Paints out what is baked into an original (lettering, stray haze) through a feathered mask.
// The area fades to `color`, and nothing stays darker than it, or its edge would show.
async function paintOut(input, rects, sigma, { color = [0, 0, 0] } = {}) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const shapes = rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/>${shapes}</svg>`;
  const mask = await sharp(Buffer.from(svg)).blur(sigma).extractChannel(0).raw().toBuffer();

  const out = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    const keep = 1 - mask[p] / 255;
    for (let c = 0; c < 3; c++) {
      out[p * 3 + c] = Math.max(data[p * channels + c], color[c]) * keep + color[c] * (1 - keep);
    }
  }
  return sharp(out, { raw: { width, height, channels: 3 } });
}

async function save(pipeline, file) {
  await mkdir(path.dirname(file), { recursive: true });
  await pipeline.toFile(file);
  const { width, height, size } = await sharp(file).metadata().then(async (m) => ({ ...m, size: (await sharp(file).toBuffer()).length }));
  console.log(`${file}  ${width}x${height}  ${Math.round(size / 1024)} Ko`);
}

async function lockup() {
  // Emblem and wordmark come from the same official logo, so their proportions stay exact.
  const emblem = await keyToTransparent(sharp(LOGO).extract({ left: 500, top: 0, width: 750, height: 590 }), {
    floor: 0.16,
    knee: 0.42,
    fade: { cx: 0.46, cy: 0.56, rx: 0.56, ry: 0.62, inner: 0.72 },
  });
  await save(emblem.webp(MASTER_WEBP), `${MASTERS}/brand/lockup-emblem.webp`);

  const wordmark = await keyToTransparent(sharp(LOGO).extract({ left: 290, top: 582, width: 1100, height: 203 }), {
    floor: 0.2,
    knee: 0.5,
  });
  await save(wordmark.webp(MASTER_WEBP), `${MASTERS}/brand/lockup-wordmark.webp`);
}

async function openingBackground() {
  // The logo's own rock and lava, with the logo itself painted out.
  const background = await paintOut(LOGO, [[430, -100, 930, 760], [150, 520, 1380, 395]], 30, { color: PAGE_BLACK_RGB });
  await save(background.webp({ quality: 90, effort: 6 }), `${MASTERS}/home/opening-bg.webp`);
}

async function emblemAlone() {
  // Stray red haze around the ring, kept out of the small icons.
  const clean = await paintOut(EMBLEM, [[880, 1030, 374, 224], [0, 130, 135, 260], [1130, 400, 124, 430]], 9);
  const emblem = await keyToTransparent(sharp(await clean.png().toBuffer()), {
    floor: 0.17,
    knee: 0.42,
    fade: { cx: 0.49, cy: 0.5, rx: 0.6, ry: 0.6, inner: 0.84 },
  });
  await save(emblem.webp(MASTER_WEBP), `${MASTERS}/brand/emblem.webp`);

  // Icons and social preview, published as they are.
  const onBlack = await sharp(await emblem.png().toBuffer())
    .flatten({ background: PAGE_BLACK })
    .png()
    .toBuffer();
  for (const size of [32, 180, 512]) {
    await save(sharp(onBlack).resize(size, size).png({ compressionLevel: 9 }), `${STATIC_BRAND}/icon-${size}.png`);
  }
  await save(
    sharp(LOGO).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 84, mozjpeg: true }),
    `${STATIC_BRAND}/social-card.jpg`,
  );
}

// The four worlds of the banner. Coordinates are in banner pixels, measured against a ruler.
const WORLD_HEIGHT = 480;
const WORLDS = [
  { name: "forest", left: 0, width: 502 },
  { name: "monolith", left: 244, width: 580 },
  // Its lower left holds the end of the banner's wordmark: painted out.
  { name: "kingdom", left: 1127, width: 679, patch: [[-80, 300, 372, 260]] },
  { name: "frontier", left: 1556, width: 444 },
];

async function worlds() {
  for (const { name, left, width, patch } of WORLDS) {
    const crop = await sharp(BANNER).extract({ left, top: 0, width, height: WORLD_HEIGHT }).png().toBuffer();
    const image = patch ? await paintOut(crop, patch, 22) : sharp(crop);
    await save(image.webp({ quality: 92, effort: 6 }), `${MASTERS}/home/world-${name}.webp`);
  }
}

const MANOR_CAPTURES = ["grand-hall", "spotlight", "fireplace", "salon", "chandelier", "staircase", "vestibule", "mirror-hall"];

async function gameCaptures() {
  for (const name of MANOR_CAPTURES) {
    await save(
      sharp(`${SOURCE}/manor-verbier/${name}.png`).webp({ quality: 92, effort: 6 }),
      `${MASTERS}/games/manor-verbier/${name}.webp`,
    );
  }

  await save((await manorNight()).webp({ quality: 92, effort: 6 }), `${MASTERS}/games/manor-verbier/manor-night.webp`);
}

// The finish shared by the key art images: halos around the lights, optional extra layers underneath, and a vignette.
async function finishRender(file, { layers = () => [], halos, saturation, contrast = [1, 0] }) {
  const render = await sharp(file).removeAlpha().png().toBuffer();
  const { width, height } = await sharp(render).metadata();
  const scale = width / 1000;
  const highlights = await sharp(render).linear(2.3, -255 * 1.2).png().toBuffer();
  const overlay = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${body}</svg>`);
  const vignette = overlay(`<radialGradient id="v" cx="50%" cy="50%" r="72%"><stop offset="0.5" stop-color="#fff"/><stop offset="1" stop-color="#2a2a30"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/>`);

  const composite = layers(overlay).map((input) => ({ input, blend: "screen" }));
  for (const [sigma, gain] of halos) {
    composite.push({ input: await sharp(highlights).blur(sigma * scale).linear(gain, 0).png().toBuffer(), blend: "screen" });
  }
  composite.push({ input: vignette, blend: "multiply" });

  return sharp(await sharp(render).composite(composite).png().toBuffer())
    .linear(contrast[0], contrast[1])
    .modulate({ saturation });
}

// Key art of the manor, with moonlit haze behind the roofs.
const manorNight = () =>
  finishRender(`${SOURCE}/manor-verbier/manor-night-render.png`, {
    layers: (overlay) => [
      overlay(`<radialGradient id="g" cx="56%" cy="14%" r="52%"><stop offset="0" stop-color="#3f5a86"/><stop offset="0.45" stop-color="#16233c"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`),
    ],
    halos: [[5, 1.0], [22, 0.9]],
    saturation: 1.08,
  });

// The studio's banner on its stone wall, for the About page.
async function aboutScene() {
  const image = await finishRender(`${SOURCE}/about/banner-hall-render.png`, {
    halos: [[3, 0.32], [14, 0.34]],
    saturation: 1.1,
    contrast: [1.14, -7],
  });
  await save(image.clone().webp({ quality: 90, effort: 6 }), `${MASTERS}/about/banner-hall.webp`);
  // The window and the candles alone, for the Discord page.
  await save(
    image.clone().extract({ left: 1260, top: 0, width: 2580, height: 2160 }).webp({ quality: 90, effort: 6 }),
    `${MASTERS}/about/window-hall.webp`,
  );
}

// Captures for the Dev Blog. `crop` keeps the game's interface, still in French, out of the picture.
const BLOG_IMAGES = [
  { name: "hall-before", file: "hall-before.png" },
  { name: "hall-after", file: "hall-after.png" },
  { name: "first-person-lamp", file: "first-person-lamp.jpg", crop: { left: 0, top: 60, width: 1190, height: 840 } },
  { name: "slashed-portrait", file: "slashed-portrait.jpg" },
  { name: "cellars", file: "cellars.jpg" },
  { name: "veiled-mirror", file: "veiled-mirror.jpg" },
  { name: "hub-table-top", file: "hub-table-top.png", crop: { left: 0, top: 110, width: 1920, height: 951 } },
  { name: "stairs-before", file: "stairs-before.png" },
  { name: "stairs-after", file: "stairs-after.png" },
];

async function blogImages() {
  for (const { name, file, crop } of BLOG_IMAGES) {
    const image = sharp(`${SOURCE}/manor-verbier/blog/${file}`);
    if (crop) image.extract(crop);
    await save(image.webp({ quality: 90, effort: 6 }), `${MASTERS}/blog/${name}.webp`);
  }
}

await lockup();
await openingBackground();
await emblemAlone();
await worlds();
await gameCaptures();
await blogImages();
await aboutScene();
