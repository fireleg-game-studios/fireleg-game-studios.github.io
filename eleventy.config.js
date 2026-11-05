import path from "node:path";
import { HtmlBasePlugin } from "@11ty/eleventy";
import Image from "@11ty/eleventy-img";
import { bundleAsync } from "lightningcss";
import sharp from "sharp";

// On Windows, sharp's cache keeps files locked, which would block `npm run assets` during `npm run dev`.
sharp.cache(false);

const fontsource = "node_modules/@fontsource-variable";

// Fonts are self-hosted: no third-party request, and the OFL licence ships with them.
const FONT_FILES = {
  [`${fontsource}/cinzel/files/cinzel-latin-wght-normal.woff2`]: "assets/fonts/cinzel-latin-wght-normal.woff2",
  [`${fontsource}/cinzel/LICENSE`]: "assets/fonts/LICENSE-cinzel.txt",
  [`${fontsource}/montserrat/files/montserrat-latin-wght-normal.woff2`]: "assets/fonts/montserrat-latin-wght-normal.woff2",
  [`${fontsource}/montserrat/LICENSE`]: "assets/fonts/LICENSE-montserrat.txt",
};

const version = (major, minor = 0) => (major << 16) | (minor << 8);
const CSS_TARGETS = {
  chrome: version(111),
  edge: version(111),
  firefox: version(113),
  safari: version(16, 4),
  ios_saf: version(16, 4),
};

export default function (eleventyConfig) {
  // Rewrites root-relative URLs at build time, so the site works from
  // username.github.io, username.github.io/repo/ or a custom domain alike.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.setServerPassthroughCopyBehavior("copy");
  eleventyConfig.addPassthroughCopy(FONT_FILES);
  eleventyConfig.addPassthroughCopy("src/assets/js");
  eleventyConfig.addPassthroughCopy("src/assets/images");
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // CSS: main.css is the entry point, files starting with "_" are bundled into it.
  eleventyConfig.addTemplateFormats("css");
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: async function (_content, inputPath) {
      if (path.basename(inputPath).startsWith("_")) return;

      return async () => {
        const { code } = await bundleAsync({
          filename: inputPath,
          minify: true,
          targets: CSS_TARGETS,
        });
        return code.toString();
      };
    },
  });

  eleventyConfig.addWatchTarget("src/_images/");

  // Every file in src/games/ is a game. Lowest `order` comes first.
  eleventyConfig.addCollection("games", (api) =>
    api.getFilteredByGlob("src/games/*.md").sort((a, b) => a.data.order - b.data.order),
  );

  // Every file in src/dev-blog/posts/ is an article, dated by its file name. Newest first.
  eleventyConfig.addCollection("posts", (api) =>
    api
      .getFilteredByGlob("src/dev-blog/posts/*.md")
      .sort((a, b) => b.date - a.date || a.fileSlug.localeCompare(b.fileSlug)),
  );
  eleventyConfig.addFilter("featuredPost", (posts) => posts.find((post) => post.data.featured) ?? posts[0]);
  eleventyConfig.addFilter("except", (items, excluded) => items.filter((item) => item !== excluded));
  eleventyConfig.addFilter("readableDate", (date) =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date),
  );
  eleventyConfig.addFilter("isoDate", (date) => date.toISOString().slice(0, 10));

  const generateImage = (src, widths, formats = ["avif", "webp"]) =>
    Image(`src/_images/${src}`, {
      widths,
      formats,
      outputDir: path.join(eleventyConfig.directories.output, "assets/img/"),
      urlPath: "/assets/img/",
      sharpAvifOptions: { quality: 60, effort: 5 },
      sharpWebpOptions: { quality: 82, alphaQuality: 90 },
    });

  // Responsive images from the masters in src/_images, generated at build time.
  // In loops, use {% asyncEach %}: Nunjucks cannot wait for this inside a plain {% for %}.
  eleventyConfig.addAsyncShortcode("image", async function (src, alt, options = {}) {
    const { widths = [640, 960, 1280, 1600], formats, sizes = "100vw", eager = false } = options;
    const metadata = await generateImage(src, widths, formats);
    return Image.generateHTML(metadata, {
      alt,
      sizes,
      loading: eager ? "eager" : "lazy",
      decoding: eager ? "sync" : "async",
      ...(eager && { fetchpriority: "high" }),
    });
  });

  // A picture with its caption, for articles.
  eleventyConfig.addAsyncShortcode("figure", async function (src, alt, caption = "") {
    const metadata = await generateImage(src, [640, 960, 1280, 1600]);
    const picture = Image.generateHTML(metadata, {
      alt,
      sizes: "(max-width: 66rem) 100vw, 60rem",
      loading: "lazy",
      decoding: "async",
    });
    return `<figure class="post-figure">${picture}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
  });

  // A thumbnail that opens the full image: in the lightbox with JavaScript, as a plain link without.
  eleventyConfig.addAsyncShortcode("galleryImage", async function (src, alt, wide = false) {
    const metadata = await generateImage(src, [640, 960, 1600]);
    const picture = Image.generateHTML(metadata, {
      alt,
      sizes: wide ? "(max-width: 80rem) 100vw, 78rem" : "(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 33vw",
      loading: "lazy",
      decoding: "async",
    });
    return `<a class="gallery__link" href="${metadata.webp.at(-1).url}" data-lightbox>${picture}</a>`;
  });

  // Marks anything that still waits for a real asset, so it cannot be missed.
  eleventyConfig.addShortcode("placeholder", (label, ratio = "16 / 9") => {
    return `<div class="placeholder" style="aspect-ratio: ${ratio}" role="img" aria-label="Placeholder: ${label}">
      <span class="placeholder__tag">Placeholder</span>
      <span class="placeholder__label">${label}</span>
    </div>`;
  });

  // The style guide is a working tool: available in dev, never published.
  if (process.env.ELEVENTY_RUN_MODE === "build") {
    eleventyConfig.ignores.add("src/styleguide.njk");
  }
}

export const config = {
  dir: {
    input: "src",
    includes: "_includes",
    data: "_data",
    output: "_site",
  },
  pathPrefix: process.env.PATH_PREFIX || "/",
  markdownTemplateEngine: "njk",
  htmlTemplateEngine: "njk",
};
