# ParaRouter UI & UX Design Guidelines

To ensure a stable, professional, and high-quality user experience across the ParaRouter application, all developers must adhere to the following Universal UI & UX Design Principles. These guidelines are derived from our core philosophy: **Restrained, Unified, and Intuitive.**

## 1. Structural Stability & Anti-Flickering
UI fundamentals rely on a steady visual state. Any unexpected jumps, layout shifts, or flickering significantly degrade the professional feel of the product.

- **Prevent Layout Shifts**: Floating layers (Modals, Dropdowns, Drawers) must have predictable heights or fixed minimum heights. This prevents the panel from expanding and contracting erratically during async data loading or form validation.
- **No Direct DOM Mutations**: Do not manually manipulate low-level DOM styles (e.g., `document.body.style.overflow`) to manage scroll locks. Always utilize robust ecosystem libraries (like `@headlessui/react` `Dialog`) that handle accessibility (a11y) and focus/scroll trapping automatically.
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
