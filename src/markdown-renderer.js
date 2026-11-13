import { marked } from "marked";
import DOMPurify from "dompurify";

export function renderMarkdown(source, purify = DOMPurify) {
    return purify.sanitize(marked.parse(source, { gfm: true, breaks: true }), {
      ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
        "pre", "code", "em", "strong", "del", "a", "br", "hr", "table", "thead", "tbody", "tr", "th", "td"],
      ALLOWED_ATTR: ["href", "title", "start", "align"],
    });
}
export function sanitizeNoteHtml(source, purify = DOMPurify) {
    const fragment = purify.sanitize(source, {
      ALLOWED_TAGS: ["div", "p", "h2", "strong", "b", "u", "s", "strike", "del", "ul", "ol", "li", "br", "img"],
      ALLOWED_ATTR: ["src", "alt", "data-task-list", "data-done"],
      RETURN_DOM_FRAGMENT: true,
    });
    const container = fragment.ownerDocument.createElement("div");
    container.appendChild(fragment);
    for (const image of container.querySelectorAll("img")) {
      if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.getAttribute("src") || ""))
        image.remove();
    }
    for (const element of container.querySelectorAll("[data-task-list], [data-done]")) {
      if (element.tagName !== "UL" || element.getAttribute("data-task-list") !== "1")
        element.removeAttribute("data-task-list");
      if (element.tagName !== "LI" || element.parentElement?.getAttribute("data-task-list") !== "1")
        element.removeAttribute("data-done");
      else if (element.getAttribute("data-done") !== "1") element.setAttribute("data-done", "0");
    }
    return container.innerHTML;
}
if (typeof window !== "undefined") window.MarkdownView = { render: renderMarkdown, sanitizeNoteHtml };
