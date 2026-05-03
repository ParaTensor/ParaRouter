# ParaRouter UI & UX Design Guidelines

To ensure a stable, professional, and high-quality user experience across the ParaRouter application, all developers must adhere to the following Universal UI & UX Design Principles. These guidelines are derived from our core philosophy: **Restrained, Unified, and Intuitive.**

## 1. Structural Stability & Anti-Flickering
UI fundamentals rely on a steady visual state. Any unexpected jumps, layout shifts, or flickering significantly degrade the professional feel of the product.

- **Prevent Layout Shifts**: Floating layers (Modals, Dropdowns, Drawers) must have predictable heights or fixed minimum heights. This prevents the panel from expanding and contracting erratically during async data loading or form validation.
- **No Direct DOM Mutations & Interaction**: Do not manually manipulate low-level DOM styles (e.g., `document.body.style.overflow`) to manage scroll locks. Always utilize robust ecosystem libraries (like `@headlessui/react` `Dialog`) that handle accessibility (a11y) and focus/scroll trapping automatically. All modals MUST automatically close when the user clicks the backdrop (outside the panel) or presses `Escape`.
- **Form Input Consistency**: Modal form fields should consistently use the `px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all` tailwind style pattern (see **section 5 — Visual language** for tokens). Primary actions within modals should use solid brand purple (`bg-purple-600 hover:bg-purple-500 text-white`) or neutral black where a quieter action is required, matching sibling pages. Form labels should use `text-xs font-bold uppercase tracking-widest text-zinc-400` (or `text-gray-400` / `text-muted-foreground` when using theme tokens).
- **Modal-First Editing**: Avoid complex "inline editing" within tables or lists if the task involves more than three fields or intricate validation logic. Use side drawers or modals to isolate the interactive context and keep the main layout undisturbed.

## 2. Workflow Minimization & Visual Denoising
Reduce cognitive load. The best UI does not require a user manual.

- **Eradicate Intermediate States**: Avoid confusing development-centric states like "Drafts". Interactions should follow a direct "Edit-to-Publish" flow. For strong transactional actions, the principle is: "Do not apply if unconfirmed, apply instantly once confirmed."
- **Flattened Hierarchies**: Reject meaningless tabs or overly nested expandable panels. If related form fields can be reasonably arranged in a single view (e.g., grid layouts), do not hide core configurations behind "Advanced Settings".
- **Restrained Copywriting**:
  - **No Technical Jargon**: Use plain language. Replace internal engineering terms with intuitive words (e.g., use "Context Length" instead of "Association Limit").
  - **No Parentheses in Labels**: Strictly avoid cluttering form labels with large amounts of explanatory text in parentheses `( )`. Use Tooltips (`?` icons) for additional context.
  - **No Gratuitous Badges**: Refrain from using "Trending" or "Recommended" sticky badges unless backed by objective, quantifiable system data. Maintain a neutral interface.

## 3. Automation & Error-Proofing
The interface should guide the user effortlessly rather than passively waiting for commands.

- **Intelligent Defaults**: When opening a form or configuration panel, the system must establish a reasonable default selection. Never present the user with a completely blank state that forces manual entry from scratch without necessity.
- **Triggerless Interactions & Auto-Saving**:
  - Remove redundant "Calculate" or "Apply" buttons for real-time operations like applying discounts.
  - Rely heavily on native form events (`onChange`, `onBlur`). The moment a user finishes typing and loses focus, the system should instantly calculate and auto-save the values in the background—achieving a "what you type is what you get" experience.
- **Persistent Global Notifications**: Success, error, or critical state-change toasts/notifications must remain on screen for an adequate duration (typically 3–5 seconds) to ensure they catch the user's eye.

## 4. Global Consistency
While the backend code may be decoupled, the user-facing surface must feel like a unified entity.

- **Strictly No Hardcoded Text**: All UI display texts, including table headers, button labels, and validation error placeholders, must NEVER be hardcoded into React components. They must be managed via translation dictionaries (`i18n`, `zh.json`, `en.json`) to enforce absolute lexical consistency.
- **Data-Driven UI over Mocks**: The UI is a projection of actual data. Strictly avoid using hardcoded "mock" structures in the presentation layer. The interface should only render when definitive backend states are fetched to prevent discrepancies and maintain user trust.

## 5. Visual language (brand, type, components)

ParaRouter’s marketing and product surfaces share a **white canvas + saturated purple accent** look (aligned with the public landing). Prefer these conventions over ad-hoc blues or rainbow accents unless a chart or third-party widget requires an exception.

### 5.1 Color palette

| Role | Hex (reference) | Tailwind (typical) | Usage |
| --- | --- | --- | --- |
| Primary accent | `#9333EA` | `purple-600` | Logo mark, primary buttons, inline emphasis on keywords |
| Accent hover / lift | `#A855F7` | `purple-500` | Hover on solid purple controls |
| Page background | `#FFFFFF` | `bg-white` | Default page and cards |
| Heading / primary text | `#000000` (or near-black) | `text-zinc-950` / `text-black` | Titles, nav brand wordmark |
| Body / secondary | `#4B5563` | `text-gray-600` / `text-zinc-600` | Descriptions, supporting copy |
| Tertiary / meta | `#9CA3AF` | `text-gray-400` / `text-zinc-500` | Table meta, placeholders, footnotes |
| Borders / dividers | `#E5E7EB` | `border-gray-200` / `border-zinc-200` | Inputs, cards, section rules |
| Soft purple surfaces | — | `bg-purple-50`, `border-purple-100`, `text-purple-800` | Highlights, info strips, subtle model tiles |

Global design tokens live in `web/src/index.css` under `@theme` (`background`, `foreground`, `muted`, `brand`, etc.). Prefer those names when adding new primitives; existing screens may still use `purple-*` / `zinc-*` utilities—**new work should not introduce `blue-*` for brand actions** (migrate opportunistically to purple + neutrals above).

### 5.2 Typography

- **Font**: **Inter** (already loaded in `index.css`); fall back to system UI sans.
- **Hero / major headings**: bold, very large (`text-4xl` → `text-6xl` by breakpoint), tight tracking (`tracking-tight`), near-black.
- **Section titles**: bold, `text-2xl`–`text-3xl`.
- **Body**: regular weight; lead lines may be `text-lg`–`text-xl` and `text-gray-600` / `text-zinc-600`.
- **In-copy emphasis**: semibold + **accent purple** on key terms (pricing, latency, “usage-based”, etc.), not arbitrary colors.

### 5.3 Core components

- **Primary button**: pill shape (`rounded-full`), `bg-purple-600`, white text, light shadow; hover `bg-purple-500`.
- **Secondary / ghost**: pill, white fill, dark text, `border` neutral (`border-zinc-200` / `border-gray-200`); optional trailing icon (e.g. `ArrowRight` from `lucide-react`).
- **Language switcher**: pill, thin border, globe + label (see landing header).
- **Top nav**: ~56–64px height, sticky optional; logo = rounded-square purple tile + white glyph + bold “ParaRouter”; links are plain text, no underline; hover darkens text only.

### 5.4 Layout, spacing, icons

- **App content width**: the authenticated main column, navbar inner row, and public **Landing** page share one horizontal constraint — **`max-w-[1600px]`** with **`px-4 sm:px-6 lg:px-8`** — via `web/src/lib/appShellLayout.ts` (`APP_SHELL_MAX_CLASS`, `APP_SHELL_PAD_CLASS`). Do not reintroduce `max-w-6xl` on those shells; it narrows the marketing page relative to `/models` and feels like a different product.
- **Unauthenticated Landing column**: the navbar row still uses **`APP_SHELL_MAX_CLASS`** (**1600px**), but the scrollable blocks below (**hero + stats**, **「全部模型」**, **bottom CTA**) share **`LANDING_CONTENT_COLUMN_CLASS`** in `appShellLayout.ts` — i.e. **`max-w-6xl`** with the same horizontal padding as the shell — so the model explorer does not read wider than the hero. Logged-in `/models` remains **full `APP_SHELL`** width for parity with the product shell.
- **Whitespace**: generous vertical rhythm and section padding; avoid cramped marketing blocks.
- **Alignment**: hero and primary narrative **left-aligned**; tables and dashboards may follow data grid norms.
- **Section separation**: light horizontal rules (`border-t` / `border-b` on `zinc-100` or `gray-100`).
- **Icons**: thin stroke, minimal (`lucide-react` defaults); pair with text at `h-4 w-4`–`h-5 w-5` in headers and buttons.

### 5.5 Information-dense card grids (model catalog, pricing summaries)

Cards that bundle **many independent facts** (title, id badge, provider line, description, 2×2 pricing blocks, footnotes) need a **minimum readable width**. Packing six narrow columns on wide monitors causes awkward wrapping, truncated titles, and weak “card” grouping.

- **Column cap**: for this pattern, use **at most 4 columns** from the `lg` breakpoint upward (`grid-cols-1` → `sm:2` → `md:3` → `lg:4`). Do **not** add `xl:grid-cols-5` or `2xl:grid-cols-6` for the same tile design unless the card content is drastically simplified (e.g. single line + one metric).
- **Gutter**: use **`gap-4`** (16px) between tiles, not `gap-3`, so columns read as separate units.
- **Card padding**: prefer **`p-4`** on the card shell for tiles that include sub-grids (pricing cells).
- **Single source of truth**: the landing “全部模型” explorer and the authenticated `/models` view must share the same grid + shell classes (`web/src/lib/modelCardShell.ts` — `MODEL_CARD_GRID`, `MODEL_CARD_SHELL`) so logged-in and logged-out layouts stay aligned.
- **Wider canvases**: if the product needs more models visible above the fold, prefer **pagination, search, or collapsible sections**—not extra columns that shrink each card below a comfortable width.
