import { useEffect, useMemo, useRef } from "react";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { CodeNode } from "@lexical/code";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/extension";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
  type ElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import type { ElementNode, LexicalEditor, LexicalNode } from "lexical";
import { $getRoot } from "lexical";
import { ToolbarPlugin } from "./Toolbar.plugin";

export type MarkdownEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: number | string;
  maxHeight?: number | string;
  autoFocus?: boolean;
};

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(\*\*\*|---|___)\s?$/,
  replace: (parentNode: ElementNode) => {
    const horizontalRuleNode = $createHorizontalRuleNode();
    parentNode.replace(horizontalRuleNode);
  },
  type: "element",
};

const MARKDOWN_TRANSFORMERS: Transformer[] = [HORIZONTAL_RULE, ...TRANSFORMERS];

const theme = {
  code: "block my-[0.85rem] py-[0.85rem] px-4 [border:1px_solid_color-mix(in_srgb,var(--t-line)_82%,var(--t-ink)_18%)] rounded bg-[color-mix(in_srgb,var(--t-panel)_76%,var(--t-bg)_24%)] text-t-ink font-mono text-xs leading-[1.55] whitespace-pre-wrap",
  heading: {
    h1: "mt-[1.2rem] mb-[0.55rem] font-bold leading-tight text-t-ink text-[1.85rem]",
    h2: "mt-[1.2rem] mb-[0.55rem] font-bold leading-tight text-t-ink text-[1.45rem]",
    h3: "mt-[1.2rem] mb-[0.55rem] font-bold leading-tight text-t-ink text-[1.15rem]",
  },
  link: "text-[#2368c4] underline underline-offset-2",
  list: {
    listitem: "my-[0.2rem]",
    nested: { listitem: "list-none" },
    ol: "mt-2 mb-3 pl-6 list-decimal",
    ul: "mt-2 mb-3 pl-6 list-disc",
  },
  paragraph: "mb-[0.8rem]",
  quote:
    "my-3 py-[0.15rem] pl-[0.9rem] [border-left:3px_solid_color-mix(in_srgb,var(--t-ink-soft)_42%,var(--t-line)_58%)] text-t-ink-soft",
  text: {
    bold: "font-bold",
    code: "py-[0.12rem] px-[0.28rem] border border-t-line rounded-[3px] bg-[color-mix(in_srgb,var(--t-panel)_82%,var(--t-bg)_18%)] font-mono text-[0.92em]",
    italic: "italic",
    strikethrough: "line-through",
  },
};

function toCssSize(value: number | string | undefined): string | undefined {
  if (typeof value === "number") return `${value}px`;
  return value;
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => {
    $getRoot().clear();
    $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS);
  });
}

function MarkdownValuePlugin({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (markdown: string) => void;
  readOnly: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const lastMarkdownRef = useRef(value);

  useEffect(() => {
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (value === lastMarkdownRef.current) return;
    lastMarkdownRef.current = value;
    importMarkdown(editor, value);
  }, [editor, value]);

  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
      onChange={(editorState) => {
        editorState.read(() => {
          const markdown = $convertToMarkdownString(MARKDOWN_TRANSFORMERS);
          if (markdown === lastMarkdownRef.current) return;
          lastMarkdownRef.current = markdown;
          onChange(markdown);
        });
      }}
    />
  );
}

export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = "Write Markdown...",
  minHeight = 260,
  maxHeight,
  autoFocus = false,
}: MarkdownEditorProps) {
  const initialConfig = useMemo(
    () => ({
      editable: !readOnly,
      namespace: "WorkspaceMarkdownEditor",
      nodes: [
        CodeNode,
        HeadingNode,
        HorizontalRuleNode,
        LinkNode,
        ListItemNode,
        ListNode,
        QuoteNode,
      ],
      onError(error: Error) {
        throw error;
      },
      editorState: () => {
        $convertFromMarkdownString(value, MARKDOWN_TRANSFORMERS);
      },
      theme,
    }),
    [],
  );

  const contentMaxHeight = maxHeight
    ? `calc(${toCssSize(maxHeight)} - 37px)`
    : undefined;

  return (
    <div
      className={`border border-gray-400 rounded-xl ${readOnly ? "bg-t-panel" : "bg-t-bg"} text-t-ink overflow-visible shadow-[0_1px_0_rgba(0,0,0,0.04)]`}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin readOnly={readOnly} />
        <div className="relative ">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="overflow-y-auto scrollbar-thumb-rounded-full scrollbar scrollbar-thumb-slate-700 scrollbar-track-transparent pt-5.5 px-7 pb-7 outline-none leading-[1.7] text-sm caret-t-ink"
                aria-label="Markdown editor"
                spellCheck
                style={{ minHeight, maxHeight: contentMaxHeight ?? maxHeight }}
              />
            }
            placeholder={
              <div className="absolute top-5.5 left-7 text-t-ink-softer text-sm pointer-events-none select-none">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <LinkPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
          {autoFocus && <AutoFocusPlugin />}
          <MarkdownValuePlugin
            value={value}
            onChange={onChange}
            readOnly={readOnly}
          />
        </div>
      </LexicalComposer>
    </div>
  );
}
