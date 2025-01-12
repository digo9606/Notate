import { createHighlighter, Highlighter } from "shiki";

let highlighter: Highlighter | null = null;
export async function initializeShiki() {
  highlighter = await createHighlighter({
    themes: ["github-dark-dimmed"],
    langs: [
      "javascript",
      "typescript", 
      "python",
      "html",
      "css",
      "json",
      "bash",
      "java",
      "c",
      "cpp",
      "csharp",
      "go",
      "rust",
      "ruby",
      "php",
      "swift",
      "kotlin",
      "sql",
      "yaml",
      "xml",
      "markdown",
      "shell",
      "dockerfile"
    ],
  });
}

export function highlightCode(code: string, language: string): string {
  if (!highlighter) {
    console.error("Shiki highlighter not initialized");
    return code;
  }
  try {
    return highlighter.codeToHtml(code, {
      lang: language,
      theme: "github-dark-dimmed",
      
    });
  } catch (error) {
    console.error("Error highlighting code:", error);
    return code;
  }
}
