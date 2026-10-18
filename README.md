# NeuroCapybara

An interactive companion website for **UCG1SS05 Biopsychology** at University College Groningen.
Short lessons, simulations you can poke, and practice tools. A sibling of [StatsCapybara](https://statscapybara.com).

Live site: https://hkarsilar.github.io/biopsychology_companion/

## Working on the site

You need Node.js 22.12 or newer.

```sh
npm install        # once
npm run dev        # local site at http://localhost:4321/biopsychology_companion/
npm test           # model tests (vitest)
npm run check      # type and template checks
npm run build      # build the static site into dist/
npm run test:e2e   # browser tests against a built site (Playwright + axe)
```

## How it is organised

| Where | What |
| --- | --- |
| `src/data/chapters.ts` | The course map: 9 chapters, every planned lesson and its URL |
| `src/data/schedule.ts` | Class schedule shown on `/course/`. Update the dates here each year |
| `src/data/sims.ts` | Simulations that get their own page in the lab |
| `src/data/glossary.ts`, `funfacts.ts`, `objectives.ts` | Glossary, home page facts, learning objectives |
| `src/content/lessons/<chapter>/<lesson>.mdx` | Lessons. A lesson goes live as soon as its file exists |
| `src/components/lesson/` | Lesson building blocks: Hook, Predict, TryIt, Notice, CheckYourself, Faq, Term, Math… |
| `src/sims/` | Simulations as framework-free web components (`<nc-…>`), each with a pure model and tests |
| `src/styles/tokens.css` | Colours, fonts and sizes for both themes |

### Adding a lesson

1. Create `src/content/lessons/<chapter-slug>/<lesson-slug>.mdx`. The `number`, `chapter` and `slug` in its frontmatter must match `src/data/chapters.ts` (the build checks this).
2. Copy the structure of `src/content/lessons/neuron/action-potential.mdx`.
3. Run `npm run dev` and open the lesson. Chapter pages, the course page and next/previous links update by themselves.

### The sorter

`<Sorter>` (`src/components/lesson/Sorter.astro`) is a sorting activity that works with buttons only, so it is usable with a keyboard and a screen reader and fits a phone screen. Nothing is stored or sent.

| Prop | What it does |
| --- | --- |
| `id` | Unique id on the page |
| `mode` | `"categories"` (sort cards into boxes) or `"order"` (put steps in order) |
| `title`, `prompt` | Optional heading and instructions. Each mode has a sensible default prompt |
| `bins` | Categories mode only: `[{ id, label }]`, at least two |
| `items` | `[{ text, bin?, explain? }]`. In categories mode, `bin` is the right box. In order mode, list the items in the right order; the sorter shuffles them. `explain` is shown after checking |
| `seed` | Optional number for a fixed shuffle, mainly for tests |

```mdx
<Sorter id="steps" mode="order" title="Put the steps in order"
  items={[{ text: 'First step' }, { text: 'Second step', explain: 'Why it comes second' }, { text: 'Third step' }]} />
```

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup in the repository:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

### Moving to a custom domain later

1. In `.github/workflows/deploy.yml`, set `SITE_URL` to the new address (for example `https://neurocapybara.com`) and `SITE_BASE` to `/`.
2. Add a file `public/CNAME` containing just the domain name.
3. Point the domain's DNS at GitHub Pages and enter the domain under Settings → Pages.

All internal links go through `src/lib/url.ts`, so nothing else needs to change.

## Licences

- Code: MIT (`LICENSE`).
- Lessons, text, figures and the mascot: CC BY 4.0 (`LICENSE-CONTENT.md`).
