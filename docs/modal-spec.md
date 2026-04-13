# ParaRouter Modal Visual Specification

All modal dialog windows across the application must share a unified visual language to ensure a consistent and high-quality user experience. The reference implementation for this design standard is the `EditPriceModal` (Configure New Price).

## Layout & Structure

Modals must consist of three distinct vertical sections:
1. **Header**: Title and description.
2. **Body**: Scrollable content area.
3. **Footer**: Action buttons.

The modal wrapper itself must not exceed the viewport, with `max-h-[90vh]` and `overflow-hidden`.

### 1. Backdrop & Container

- **Backdrop**: `fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity`
- **Container Positioning**: `fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6`
- **Panel Wrapper**: `relative w-full max-w-[size] bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200` (or using Headless UI / Framer Motion equivalent).

### 2. Header

The header must be clean and focus entirely on context.
**Do not include 'X' close buttons in the top right.**

- **Wrapper Classes**: `px-5 py-4 border-b flex items-center justify-between shrink-0 bg-white`
- **Title**: `<h3 className="font-bold text-lg">Title</h3>`
- **Subtitle** (optional): `<p className="text-xs text-zinc-500 mt-0.5">Subtitle description</p>`

### 3. Content Body

The body must handle its own overflow behavior to accommodate long content.
- **Wrapper Classes**: `flex-1 overflow-auto px-5 py-5 space-y-4`

### 4. Footer & Action Buttons

The footer acts as an action bar with a distinct light-grey background. Actions must be aligned to the right (or split left/right if there are secondary actions like destructive deleting, but primary action is on the right).

- **Wrapper Classes**: `border-t px-6 py-4 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-end shrink-0 gap-3`
- **Cancel Button** (Ghost style): `<button className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-3">Cancel</button>`
- **Primary Button** (Blue pill/rounded): `<button className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50">Action</button>`

By following these specifications, our UI will maintain the intended premium, unified aggregation gateway look and feel.
