# ParaRouter Table UI Standards

To maintain consistency across the ParaRouter web application, all data tables must follow one of the two standardized UI formats.

## Type 1: Internal Operation Output 
**Use Case:** Tables meant for system administrators or users who need to process dense, operational data. These tables prioritize compact spacing, raw information density, and clear horizontal dividers to optimize scanning.
**Examples:** Pricing Center (`PricingTable.tsx`), Global Models (`GlobalModels.tsx`), Model Providers (`ModelProviders.tsx`).

### CSS / Structure Rules
- **Container:** `<div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">`
  - *Note:* No `shadow-sm`, and uses `rounded-2xl`.
- **Inner Wrapper:** `<div className="overflow-x-auto">`
- **Table:** `<table className="w-full text-left border-collapse">`
- **Header (`<thead>`):** 
  - `<tr>` class: `bg-gray-50/70 border-b`
  - `<th>` class: `px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest`
  - *Note:* The padding is firmly set to `px-3 py-3` for maximum horizontal screen utilization.
- **Body (`<tbody>`):**
  - `<tbody>` class: `divide-y`
  - Row (`<tr>`) class: `hover:bg-gray-50/50 transition-colors`
  - Cell (`<td>`) class: `px-3 py-3 text-sm` (optionally `text-xs` based on need)


## Type 2: Content & Trends Output
**Use Case:** Standard consumer or user-facing tables where readability, aesthetics, and spaciousness are preferred over raw data density.
**Examples:** Activity / Trends (`Activity.tsx`), API Keys (`Keys.tsx`), Rankings (`Rankings.tsx`).

### CSS / Structure Rules
- **Container:** `<div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">`
  - *Note:* Uses `rounded-xl` and `shadow-sm`.
- **Optional Internal Header:** If the table needs an explicit title block inside the card, prepend the wrapping `<div className="overflow-x-auto">` with:
  ```tsx
  <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
    <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Section Title</h3>
  </div>
  ```
- **Inner Wrapper:** `<div className="overflow-x-auto">`
- **Table:** `<table className="w-full text-left border-collapse">`
- **Header (`<thead>`):** 
  - `<tr>` class: `bg-gray-50/50 border-b border-gray-50`
  - `<th>` class: `px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest`
  - *Note:* Uses spacious `px-6 py-4` padding.
- **Body (`<tbody>`):**
  - `<tbody>` class: `divide-y divide-gray-50`
  - Row (`<tr>`) class: `hover:bg-gray-50/50 transition-colors group`
  - Cell (`<td>`) class: `px-6 py-4`
