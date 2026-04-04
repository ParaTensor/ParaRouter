# OpenHub UI Development Guidelines

To ensure a stable and high-quality user experience, all developers (and AI assistants) must follow these UI standards.

## 1. Modal-First Editing

**Standard**: Avoid direct inline editing of complex data structures within tables or lists.

- **Why**: Inline editing often causes layout shifts, component instability, and increases the risk of accidental data loss. It makes the UI feel "jittery" and harder to maintain as validation logic grows.
- **Rule**: All data modification (Create/Edit) should be performed within a **Modal (Dialog)** or a dedicated **Side Drawer**.
- **Exception**: Very simple toggles (e.g., Enable/Disable) can stay inline if they don't change the layout.

## 2. Component Stability

- Do not dynamically inject large input components into an existing list row.
- Use consistent transition animations for modals to provide clear visual feedback.
- Ensure all interactive elements have hover effects and clear focus states.

## 3. Design Aesthetics

- Prioritize visual excellence. Use curated color palettes (HSL), sleek dark modes, and modern typography (e.g., Inter, Outfit).
- Use smooth gradients and subtle micro-animations for enhanced user engagement.
- Avoid generic browser defaults; use TailwindCSS or Vanilla CSS with high-quality design tokens.
