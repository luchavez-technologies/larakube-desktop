# LaraKube Desktop YouTube Series: Production Standard

Captioned, no-narration demo series for non-developers. Title pattern: "LaraKube Desktop: [what it does]." One episode per Cluster Tool (20+ planned). This doc is the durable reference — read it before starting a new episode's thumbnail or edit, instead of re-deriving the format from scratch.

## Canonical thumbnails (source of truth — copy the template, don't reinvent it)

- Ep.1 (create a server): https://claude.ai/artifact/UM4kwTsmDRi8PMMZvsTGkB
- Ep.2 (n8n): https://claude.ai/artifact/ENMf8W1ka23ezF3wzFjzFG
- Ep.3 (PocketBase): https://claude.ai/artifact/MX8wGTd37dQcTCp96FGp1t
- Ep.4 (WordPress): https://claude.ai/artifact/RDCTX1tMUSsBcDHqpKzNeZ

All three are the _same_ `index.html` template with only the brand-mark image, episode number, badge/headline/subline copy, and mockup screenshot swapped. When starting a new episode, copy this template verbatim and only change those five things.

### Thumbnail spec (1280×720)

- **Fonts:** Sora (display, weights 400/600/700/800) + DM Sans (body, 400/500/700), loaded via Google Fonts.
- **Palette:** `--bg-deep: #0b1220` · `--bg-panel: #121b2e` · `--accent-cyan: #35c7d6` · `--accent-orange: #e8683a` · `--text-hi: #f4f7fb` · `--text-lo: #9fb0c6`.
- **Background:** two radial glows (cyan top-left at 18%/15%, orange bottom-right at 92%/88%) over a 135° deep-navy linear gradient, plus a faint 48px grid overlay and one soft cyan glow-ring bottom-left.
- **Brand mark** (top-left, 56px/42px inset): 48×48 rounded-12px image of the real app icon — `desktop/public/icon.png` (1024×1024, ~200KB) — next to "LaraKube Desktop" (Sora 700, 22px) with "LUCHTECH" as a small cyan all-caps subline underneath.
- **Episode tag** (top-right, 56px/48px inset): cyan pill, `EP. 0X`, Sora 700 16px, dark text on cyan fill.
- **Headline block** (left column, starts at top:150px, width 560px):
    - Badge: orange pill, all-caps 2-4 word hook (e.g. "NO DEVOPS NEEDED", "ONE CLICK, ZERO CONFIG", "SELF-HOSTED, NOT RENTED").
    - Headline: Sora 800, 64px, line-height 1.04, one phrase in `--accent-cyan` for the key noun (tool name or benefit).
    - Subline: DM Sans 500, 24px, muted (`--text-lo`), one plain sentence of what the viewer gets.
- **Callout pill** (over the mockup, left:100px top:585px): small dark pill with a glowing green dot + a short status line ("Server ready in 3m 02s", "Live in under a minute", "Live and ready to log in").
- **Mockup** (right column, top:116px left:648px, 672×560): the episode's actual UI screenshot, tilted in 3D (`perspective(1400px) rotateY(-7deg) rotateX(3deg) scale(1.02)`), heavy drop shadow, 18px radius border.
- Publish via `publish_files` (not inline base64) so the logo and screenshot stay as real files — keeps the artifact readable/editable later instead of one giant base64 blob line.

### To make a new episode's thumbnail

1. Pick the next `EP. 0X`.
2. Write one badge (orange pill hook), one headline with one cyan-accented word/phrase, one subline, one callout status line — in the voice of the existing three (plain, benefit-first, no hype).
3. Grab a real screenshot of the tool's installed/running state in Desktop for the mockup.
4. Copy the Ep.3 artifact's `index.html` as the base, swap only: ep-tag, badge, headline, subline, callout text, and `card.png`. Reuse `logo.png` (`desktop/public/icon.png`) unchanged.
5. Publish with `publish_files`, `mode: "replace"`, as a _new_ artifact (title `LaraKube Desktop Ep.N Thumbnail`) — don't overwrite a prior episode's artifact.

## Video structure (captions, no narration)

1. **Intro contrast beat** (~0–18s): two real competitor/landscape pages (e.g. a paid SaaS pricing page, then the open-source tool's landing page), each with one caption naming the actual contrast (price, ownership, simplicity — never a misleading or fabricated number). Caption each half separately; don't leave either half silent.
2. **Desktop Quick Launch flow**: captions on each meaningful step (app picker, cluster picker, DNS/SSL auto-config, standalone/config callouts, deploy-in-progress). A 4x speed region covers any real wait (e.g. deploy polling) rather than cutting it.
3. **Browser tour**: live credentials reveal caption, login prompt caption, final "you're in" caption covering the admin UI tour.
4. Re-verify every caption's placement with `getFrames` after any trim/crop — if the user is editing the same OpenScreen project live in parallel, timeline boundaries shift and captions must be re-checked, not assumed.
5. Export is reserved for the user — never call `exportVideo` or claim the clip is exported.

## YouTube metadata format

### Titles — A/B test 3 variants

Write 3 title variants per episode for YouTube's title A/B test. The **main** variant (the one submitted first / treated as control) always starts with `"LaraKube Desktop: "` followed by the benefit/action. The other 2 variants are free-form — different angles (price contrast, speed, "how to self-host X") — but still read as a real sentence, not keyword stuffing. Example set for an n8n episode:

1. `LaraKube Desktop: Install n8n (Self-Hosted Automation) in One Click` — main
2. `Self-Host n8n for Free in Under a Minute — No Docker, No YAML`
3. `Stop Paying for n8n Cloud — One-Click Self-Hosted Setup`

### Description — fixed template

```text
Watch LaraKube Desktop install {Tool} — {one-line what it is} — on your own server with a single click. No Docker, no YAML, no terminal.

{Tool} is {one-sentence plain-language description, with a familiar comparison if one exists}. In this video:
📌 {Tool} Cloud/hosted pricing or the manual self-host pain — a real number or a real friction point, never invented.
📌 LaraKube Desktop does it in one click instead — DNS and a free SSL certificate are wired up automatically, no config needed.
📌 {One genuine capability/default worth knowing — e.g. default storage engine, a drop-in alternative it supports, an SSO/relay option.}
📌 From click to live URL, start to finish.

This is Episode {N} of a series showing LaraKube Desktop installing popular self-hosted apps{ — Episode 1 covered spinning up the cloud server itself, if N > 1, or name the directly preceding episode}.

🔗 Docs: https://docs.larakube.app
```

Keep each 📌 line to one real, specific, checkable claim — no invented prices (see [[feedback_no_fake_prices_prefer_link]]), no invented percentages or speed claims not actually observed in the recording.

### Tags — fixed core + per-episode

Comma-separated, lowercase, no spaces after commas. Fixed core set every episode: `laravel,kubernetes,opentofu,docker,deploy,selfhosted,devtools`. Add 1-3 episode-specific tags (the tool's own name/category, e.g. `n8n,automation` or `pocketbase,backend,sqlite`).
