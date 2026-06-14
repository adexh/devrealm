import React from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createCodeNode } from "@lexical/code";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $createParagraphNode, $getSelection, FORMAT_TEXT_COMMAND } from "lexical";

const toolBtn =
  "inline-flex items-center justify-center h-6.5 min-w-7 px-[7px] border border-transparent rounded-[3px] bg-transparent text-t-ink text-xs font-normal cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-default hover:enabled:border-t-line hover:enabled:bg-t-bg";

function ToolbarButton({
  children,
  disabled,
  onClick,
  title,
  className,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className ? `${toolBtn} ${className}` : toolBtn}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-5 mx-1.25 bg-t-line flex-none" />;
}

function ToolbarPlugin({ readOnly }: { readOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [blockMenuOpen, setBlockMenuOpen] = React.useState(false);

  const blockOptions = [
    { value: "paragraph", label: "Paragraph" },
    { value: "h1", label: "Heading 1" },
    { value: "h2", label: "Heading 2" },
    { value: "h3", label: "Heading 3" },
    { value: "quote", label: "Quote" },
    { value: "code", label: "Code block" },
  ];

  function formatBlock(blockType: string) {
    setBlockMenuOpen(false);
    editor.update(() => {
      const selection = $getSelection();
      if (blockType === "h1" || blockType === "h2" || blockType === "h3") {
        $setBlocksType(selection, () => new HeadingNode(blockType));
        return;
      }
      if (blockType === "quote") {
        $setBlocksType(selection, () => new QuoteNode());
        return;
      }
      if (blockType === "code") {
        $setBlocksType(selection, () => $createCodeNode());
        return;
      }
      $setBlocksType(selection, () => $createParagraphNode());
    });
  }

  function toggleLink() {
    const url = window.prompt("Link URL");
    if (url === null) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.trim() ? url.trim() : null);
  }

  return (
    <div className="sticky z-5 border-gray-400 border-b-[0.5px]">
      <div className="min-h-9.5 flex items-center gap-0.75 py-1.5 px-2 overflow-x-wrap">
        <div className="relative flex-none">
          <button
            type="button"
            className="min-w-30.5 inline-flex items-center justify-between gap-2.5 h-6.5 px-2 border border-t-line rounded-[3px] bg-t-bg text-t-ink text-xs font-normal cursor-pointer disabled:opacity-50 disabled:cursor-default hover:enabled:border-t-line hover:enabled:bg-t-bg"
            disabled={readOnly}
            onClick={() => setBlockMenuOpen((open) => !open)}
            title="Text type"
          >
            <span>Paragraph</span>
            <span className="text-t-ink-soft text-[10px]">▾</span>
          </button>
          {blockMenuOpen && (
            <div className="absolute z-20 top-7.5 left-0 min-w-37.5 p-1 border border-t-line rounded-[5px] bg-t-bg shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
              {blockOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="w-full h-6.75 flex items-center px-2 border-0 rounded-[3px] bg-transparent text-t-ink text-xs font-normal cursor-pointer text-left hover:bg-t-panel"
                  onClick={() => formatBlock(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        <ToolbarButton disabled={readOnly} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")} title="Bold">
          B
        </ToolbarButton>
        <ToolbarButton disabled={readOnly} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")} title="Italic" className="italic">
          I
        </ToolbarButton>
        <ToolbarButton disabled={readOnly} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")} title="Inline code" className="font-mono">
          {"</>"}
        </ToolbarButton>

        <Divider />

        <ToolbarButton disabled={readOnly} onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} title="Bullet list">
          Bullets
        </ToolbarButton>
        <ToolbarButton disabled={readOnly} onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} title="Numbered list">
          Numbers
        </ToolbarButton>
        <ToolbarButton disabled={readOnly} onClick={toggleLink} title="Add or remove link">
          Link
        </ToolbarButton>
      </div>
    </div>
  );
}

export { ToolbarPlugin };
