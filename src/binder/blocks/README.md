# Binder blocks

Everything on a binder page is a block: text, a card, a picture, a gallery, a
3D model, a video, stats, a timeline, awards, a button, a file (PDF) and the
sponsors. Each kind lives in two places:

- **What it keeps**: its entry in `BLOCKS` in ManuQueue's
  `manu-orders/src/lib/binder-blocks.ts`. ManuQueue's server checks every
  saved page against it, and the hub gets its types from it. That way the
  editor and the server can't disagree about what a block holds.
- **How it looks and edits**: its file here, like `card.tsx`, listed in
  `index.tsx`.

The page, the canvas, the editor's Add menu and toolbar all go through
`index.tsx`, so they need no changes for a new kind.

## Adding a kind of block

Say it's a video.

1. **In `manu-orders/src/lib/binder-blocks.ts`**, add it to `BLOCKS`:

   ```ts
   video: block({
     fields: {
       url: field.link("link"),
       caption: field.text(200, { name: "caption", oneLine: true }),
       frame: field.flag(),
     },
   }),
   ```

   Pick from the `field` kinds: `text`, `choice`, `flag`, `whole`,
   `decimal`, `link`, `color`, `image`, `model`, `optional`, `list` and
   `group`. If a new kind of field is needed, add it to `field` there.
   Optional extras:
   - `perPage: { max, tooMany }` for a limit per page (models have 6).
   - `nextSeason(element, { from, to, outlineOnly })` for what a new season
     keeps of it. Without it, a copied season keeps it as is and an outline
     leaves it out.

2. **Make `video.tsx` here.** Copy the closest existing block (`image.tsx`
   for something with a fixed size, `card.tsx` for something that grows with
   its text) and export a `BlockUI<"video">`:
   - `View`: how it's drawn. The same component draws it for visitors and in
     the editor. In the editor it gets `edit`, and `edit.active` means it's
     open for typing. Use `Editable` from `kit.tsx` for text typed in place.
     Give it `rich` to allow bold, italic and underline (kept as marks in
     the text, see `../formatting.tsx`), and draw that text elsewhere with
     `<Formatted text={...} />`.
   - `formatting` (optional): true when it has rich text, so the toolbar
     shows B, I and U while it's open.
   - `growsToFit`: true if its height follows its content (text, cards),
     false if it keeps the size it's dragged to (pictures, models).
   - `add`: its Add menu choices, each with a `make(team)` giving its
     starting fields, `w` and `h`.
   - `Tools` (optional): its toolbar buttons. Use `ToolButton` and
     `ToolDivider` from `kit.tsx`. Front, Back, Copy and Delete are added
     for every kind.
   - For lists inside a block (a timeline's steps, a gallery's pictures),
     `kit.tsx` has `RowActions` (move and remove), `AddRow` and `moved`;
     for a typed setting that isn't shown as page text (a link), `BlockField`.
     `timeline.tsx` and `button.tsx` show them in use.
   - `opening` (optional): runs on Add, double click and Enter. Return true
     after doing something else, like asking for a file it doesn't have yet.
   - `topBar` (optional): a top bar link, for a kind a page has only one of.

3. **List it in `index.tsx`** in `BLOCK_UI`. Its place there is its place in
   the Add menu.

4. **Style it** in `../binder.css`, under `.bp-el-video` (the canvas wraps
   each block in `.bp-el bp-el-<type>`). Give both looks (`[data-look="lambda"]`
   and `[data-look="gamma"]`) the same care.

TypeScript (`npm run build`) won't pass until steps 1 and 3 agree, and it
checks that `make` returns every field.

Then rebuild the hub into ManuQueue (`npm run build:manuqueue`) and deploy
ManuQueue. The server's checks and the hub's files have to go out together.

## Adding a field to a kind that's already on pages

Pages saved before the field existed won't have it. Give the field a
`missing` value in `binder-blocks.ts` (cards' `featuresTitle` has
`missing: "Features"`): the server fills it in when it sends pages out
(`withMissingFields`), and when it checks a save that lacks it. Then add it
to the kind's `make` here and use it in its `View`.

## Uploads

A block that needs a new kind of upload also needs a ManuQueue route to take
and serve it, a `field` kind that only accepts names that route gives out,
and a `pick...` action in `ToolActions` (`kit.tsx`), which the editor page
provides. The File block's PDFs are the model: `/api/binder/files`,
`saveBinderFile` in `src/lib/binder-images.ts`, `field.document()`, and
`pickFile`. Anything over 10 MB also needs its route left out of
`src/proxy.ts`'s matcher.
