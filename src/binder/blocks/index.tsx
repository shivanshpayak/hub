import type { BlockType, PageElement } from "../content";
import { awards } from "./awards";
import { button } from "./button";
import { card } from "./card";
import { file } from "./file";
import { gallery } from "./gallery";
import { image } from "./image";
import type { AddChoice, BlockUI, BlockViewProps, ToolActions } from "./kit";
import { model } from "./model";
import { sponsors } from "./sponsors";
import { stats } from "./stats";
import { text } from "./text";
import { timeline } from "./timeline";
import { video } from "./video";

/*
 * Every kind of block the hub can draw, in the order of the editor's Add
 * menu. Each one's file here says how it looks, what Add makes and which
 * buttons it gets; what it keeps is in ManuQueue's
 * src/lib/binder-blocks.ts. TypeScript won't build until every kind there
 * has an entry here. README.md has the steps for a new one.
 */
export const BLOCK_UI: { [K in BlockType]: BlockUI<K> } = {
  text,
  card,
  image,
  gallery,
  model,
  video,
  stats,
  timeline,
  awards,
  button,
  file,
  sponsors,
};

/** A block's UI, for code that handles every kind the same way */
type AnyBlockUI = {
  View: (props: BlockViewProps) => ReturnType<BlockUI<BlockType>["View"]>;
  growsToFit: boolean;
  add: AddChoice<BlockType>[];
  Tools?: (props: { element: PageElement; actions: ToolActions }) => ReturnType<BlockUI<BlockType>["View"]>;
  opening?: (element: PageElement, actions: ToolActions) => boolean;
  topBar?: { anchor: string; label: string };
  formatting?: boolean;
};

export function uiOf(element: PageElement): AnyBlockUI {
  return BLOCK_UI[element.type] as unknown as AnyBlockUI;
}

/** Any block, drawn by its kind's View */
export function ElementView({ element, edit, page }: BlockViewProps) {
  const { View } = uiOf(element);
  return <View element={element} edit={edit} page={page} />;
}

/** Every Add menu choice, in order, with the kind it adds */
export function addChoices(): { type: BlockType; choice: AddChoice<BlockType> }[] {
  return (Object.keys(BLOCK_UI) as BlockType[]).flatMap((type) =>
    (BLOCK_UI[type].add as AddChoice<BlockType>[]).map((choice) => ({ type, choice })),
  );
}

/** Names the top bar's own links use (#sponsors), which headings can't take */
export function topBarAnchors(): string[] {
  return Object.values(BLOCK_UI).flatMap((ui) => (ui.topBar ? [ui.topBar.anchor] : []));
}

/** The top bar's links for blocks a page has one of, like its sponsors */
export function topBarLinks(elements: readonly PageElement[]): { label: string; href: string }[] {
  return (Object.keys(BLOCK_UI) as BlockType[]).flatMap((type) => {
    const link = BLOCK_UI[type].topBar;
    return link && elements.some((e) => e.type === type)
      ? [{ label: link.label, href: `#${link.anchor}` }]
      : [];
  });
}
