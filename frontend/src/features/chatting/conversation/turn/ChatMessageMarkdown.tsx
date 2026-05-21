import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageMarkdownProps {
  content: string;
  streamingCursor?: boolean;
  selectionContext?: unknown;
  onReplace?: (text: string) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  suppressClarificationWidget?: boolean;
}

export function ChatMessageMarkdown(props: ChatMessageMarkdownProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {props.content}
    </ReactMarkdown>
  );
}
