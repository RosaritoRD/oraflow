# Jeshua Divine Dawn

Original thumbnail identity for **Oraciones en Presencia de Jeshua**. The system starts from the video's content, proposes a visual direction and composes the text in code over a finished, letter-free illustration or photograph.

Status: planner, renderer, service, CLI and Oraflow integration implemented and tested locally. The designer stores the finished thumbnail and production keeps it without generating it again. The tests use local images and simulated providers; they don't vouch for a live generation or a lab deployment.

## Identity and composition

| Element | Specification |
| --- | --- |
| Canvas | 1280 × 720 px, 16:9 |
| Safe margin | 64 px around all text and essential content |
| Navy | `#091A31` |
| Deep navy | `#061020` |
| Gold | `#E9B75D` |
| Dawn light | `#FFD783` |
| Ivory | `#FFF4DF` |
| Soft black | `#080D14` |
| Typeface | Barlow Condensed ExtraBold; keep the language's accents and marks |
| Hierarchy | Two levels at most: headline and optional support line |
| Headline | 3–7 words in total, even across several lines |

Keep one clear main subject, warm light and negative space for the headline. Navy carries the contrast; ivory and gold organize the reading. A night thumbnail keeps the palette but lowers the light and uses a calm atmosphere. Keep the lower-right corner free for YouTube's duration badge, with no words, faces, hands or other essential details.

The renderer must place the exact approved text: the generated image is never responsible for writing it. The support line is optional and doesn't add a third reading level. Don't shrink the letters until an over-long headline becomes illegible: rephrase it while keeping the meaning.

Variety may change framing, subject position, background, gesture and light distribution. Palette, typeface, hierarchy and devotional treatment stay. The motif can be a person, a silhouette, a Bible, hands or light depending on the topic; Jeshua isn't required in every image. References help understand visual needs, not reproduce another channel's faces, compositions, logos or thumbnails. An empty gradient background doesn't replace finished artwork.

## Six themes

The planner's identifiers are `morning`, `gratitude`, `anxiety`, `holy_spirit`, `protection` and `night`.

| Theme | Visual direction | Example ES headline |
| --- | --- | --- |
| `morning` | Golden dawn, openness and hope | COMIENZA EL DÍA CON JESHUA |
| `gratitude` | Warm daylight, a serene and grateful gesture | GRACIAS POR UN NUEVO DÍA |
| `anxiety` | Calm and closeness, a simple background with no sign of threat | ENTREGA TU ANSIEDAD A JESHUA |
| `holy_spirit` | Enveloping light, recollection and luminous air | ESPÍRITU SANTO GUÍA MIS PASOS |
| `protection` | A firm, welcoming presence, a feeling of refuge | JESHUA GUARDA MI HOGAR |
| `night` | Deep navy, faint warm light and rest | DESCANSA EN LA PAZ DE JESHUA |

They're original editorial proposals, not Bible quotes or promises of results. The video's real content decides which one applies. `time_of_day` guides the lighting; it doesn't automatically turn an anxiety prayer into a morning one.

## Input

The [example file](../examples/jeshua-thumbnail-input.json) lets you prepare a plan offline. The initial language scope is explicitly **ES/EN**, via `language: "es"` or `"en"`. Translation into other languages isn't considered implemented.

| JSON field | Use |
| --- | --- |
| `video_title` | The video's full title; not copied whole onto the thumbnail |
| `video_topic` | Central topic it must communicate |
| `video_summary` | Short summary to choose the angle |
| `script` | Script or a representative excerpt; guides editorial consistency |
| `bible_verse` | Bible reference and, only where appropriate, authorized text |
| `prayer_type` | One of the six identifiers above |
| `emotion` | Target emotion, e.g. peace or gratitude |
| `time_of_day` | Time of day, e.g. `dawn` or `night` |
| `language` | `es` or `en`; sets the language of the visible text |

Don't put API keys in this file. Use your own texts, photos and illustrations, or ones with a sufficient license. A reference to a psalm grants no rights over any modern translation or over someone else's music recording.

## CLI flow

From the Oraflow root, prepare the plan without calling providers:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --plan-only --out output/jeshua
```

Compose a preview for review using your own or a licensed image:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --artwork /path/image.jpg --variants 2 --out output/jeshua
```

Remote generation is an explicit option and uses an existing configured API:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --generate --variants 2 --out output/jeshua
```

`--variants N` accepts 1 to 4 variants. Check the provider's cost before running `--generate`; an app subscription doesn't imply credit or included access to its API. Cost also depends on the number of variants and attempts. `--plan-only` must stay offline and incur no charges.

After inspecting the chosen artwork, record that a person checked there are no letters, the anatomy and the visual consistency:

```bash
npm run thumbnail:jeshua -- --input examples/jeshua-thumbnail-input.json --artwork /path/reviewed-image.jpg --approve-artwork --out output/jeshua
```

`--approve-artwork` stands for that human review; it isn't a guarantee of OCR, face detection or automatic anatomy checks. Review again if the image changes. None of these commands publishes content.

The brand is enabled with `THUMBNAIL_STYLE=jeshua-divine-dawn` or when `CHANNEL_NAME` is `Oraciones en Presencia de Jeshua`. Set those options in the authorized environment; don't change credentials or restart the lab to test this flow.

By default the CLI saves to `data/thumbnails/jeshua`; each run creates a separate `jeshua-*` folder with `manifest.json` and one subfolder per variant. The app saves to `uploads/thumbnails`. `THUMBNAIL_ARTWORK_PATH` lets the automatic flow use a local image; without it the existing image provider is used. A missing or failing provider produces an error, not a fake thumbnail. The CLI reads keys from the environment or `.env` only with `--generate`; credentials saved in the panel go to the integrated agent.

Each generated variant requests different artwork. If a single `--artwork` is given, the variants reuse that image so text and composition can be compared. `--text-side left|right` fixes the side for a local image. Without it, the visual detail of both columns is compared and the calmer one is preferred. This is **not face detection**. Optionally the brief accepts `subject_region: {x,y,width,height}`, coordinates between 0 and 1 on the final 16:9 canvas, to keep text out of that area. On generated images, that area comes from the plan and must be checked visually.

## Master artwork prompt

English template. Replace the fields in braces with the plan; the language of this instruction doesn't set the language of the headline the renderer will add.

```text
Create an original finished devotional artwork for a 16:9 YouTube thumbnail
for the channel "Oraciones en Presencia de Jeshua".

Theme: {prayer_type}. Video meaning: {video_summary}.
Intended emotion: {emotion}. Time of day: {time_of_day}.
Visual concept: {visual_concept}. Subject position: {subject_position}.
Keep {text_side} as quiet negative space for typography added later.

Use the single focal motif specified in the plan: {subject_description}.
For people, retain natural facial proportions, a calm authentic expression,
and simple ivory or navy clothing.
Use one clear focal subject, believable anatomy, and restrained detail.
When hands are visible, make them natural and anatomically plausible.
Build a coherent scene with depth and meaningful atmosphere.

Brand palette: navy #091A31, deep navy #061020, gold #E9B75D,
sunrise light #FFD783, ivory #FFF4DF, soft black #080D14.
Use warm directional light for daytime scenes. For night scenes, use deep
navy surroundings with gentle warm illumination and a restful atmosphere.
Preserve clarity when reduced to a small mobile thumbnail.

Keep important content inside a 64-pixel safe margin on a 1280x720 canvas.
Leave the lower-right duration overlay area free of essential details.
Create a fresh composition; do not recreate an existing thumbnail,
photograph, painting, actor likeness, logo, or another channel's identity.

Artwork only. Absolutely no text, letters, numbers, captions, signatures,
logos, symbols resembling writing, or watermarks anywhere in the image.
The headline and all branding text will be added programmatically later.
```

Negative prompt:

```text
text, letters, numbers, captions, typography, pseudo-writing, calligraphy,
logo, watermark, signature, copied composition, recognizable actor likeness,
deformed anatomy, extra fingers, fused fingers, extra limbs, distorted face,
misaligned eyes, duplicate main subject, cropped face, cropped essential hands,
cluttered background, busy text area, illegible visual hierarchy, harsh neon,
muddy contrast, excessive glow, overprocessed skin, horror, threatening imagery,
empty gradient placeholder, unfinished artwork, low-resolution artifacts
```

The prompt's prohibitions reduce errors, but don't verify their absence. Reviewing the result is still necessary.

## Outputs and review

Artifacts per run:

- **`manifest.json`:** list of 1–4 variants with paths to their files.
- **`variant-N/plan.json`:** normalized input, language, theme, exact headline, optional support line, concept, composition and prompts.
- **`thumbnail.jpg` and `thumbnail.png`:** 1280 × 720 with lettering applied through Sharp/Pango and a bundled font under SIL OFL. The JPEG stays under 2 MB.
- **`mobile-320.jpg` and `mobile-160.jpg`:** real exports for mobile review.
- **`qa.json`:** text boxes, font size, minimum sampled contrast (target ≥4.5:1), 64 px margin, reserved duration area, SHA-256 hash of the artwork and cropping/resolution warnings. The headline is fitted between 88 and 132 px; if it doesn't fit, it's rejected with a request to shorten it. Text is never silently dropped.

`automaticChecksPassed` isn't editorial approval: `requiresVisualReview` stays on. `artworkReview` records `pending`, or `operator-confirmed` if `--approve-artwork` is used with a previously inspected local image; remote artwork that doesn't exist yet can't be approved in advance. There's no OCR, anatomy detector or semantic legibility meter. This report travels with the file without replacing Oraflow's review/publishing process.

Before requesting paid artwork, the service checks that the text fits with the real font. If the AI's text proposal doesn't fit, it falls back to the local editorial alternative for the same theme and records why; it doesn't pay for a second image to solve a typographic problem.

Checklist before accepting a variant:

- At **320 px wide**: the topic is understood, the headline has 3–7 words, the text matches exactly what was approved and the typeface keeps accents. If there's a support line, it adds information without competing.
- At **160 px wide**: the headline and the main subject are still recognizable; the message doesn't depend on small details or an illegible support line.
- At full resolution: text inside the 64 px margin, lower-right corner clear, no important cropping, no overflow and enough contrast across the whole reading area. Also check the output's dimensions and file size.
- Human inspection: no leftover text in the artwork, plausible hands and face, a fitting expression, consistency with the script and real differences between variants without losing the brand.
- Confirmed provenance: your own or licensed artwork and text; nothing copied from reference thumbnails. Final approval is never inferred from the automatic checks alone.
