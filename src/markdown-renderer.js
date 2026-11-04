import { marked } from "marked";
import DOMPurify from "dompurify";

export function renderMarkdown(source, purify = DOMPurify) {
    return purify.sanitize(marked.parse(source, { gfm: true, breaks: true }), {
      ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
        "pre", "code", "em", "strong", "del", "a", "br", "hr", "table", "thead", "tbody", "tr", "th", "td"],
      ALLOWED_ATTR: ["href", "title", "start", "align"],
    });
}
if (typeof window !== "undefined") window.MarkdownView = { render: renderMarkdown };
