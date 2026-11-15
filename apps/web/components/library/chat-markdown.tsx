"use client"

import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/** GitHub-flavoured Markdown for AI replies (headings, lists, tables, code, quotes). Raw HTML is not rendered. */
function Body({ md }: { md: string }) {
  return (
    <div className="chat-md" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="c-accent underline">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
        }}
      >{md}</ReactMarkdown>
    </div>
  )
}

export const ChatMarkdown = memo(Body)
