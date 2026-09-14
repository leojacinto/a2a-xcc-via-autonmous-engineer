"""Simple retrieval agent that answers questions using the three
strategic memo Markdown files pulled from repo_for_copilot."""

import re
from pathlib import Path

DOCS_DIR = Path(__file__).parent / "docs"


def _load_paragraphs() -> list[tuple[str, str]]:
    """Return a list of (source_file, paragraph_text) tuples for all docs."""
    paragraphs = []
    for md_file in sorted(DOCS_DIR.glob("*.md")):
        text = md_file.read_text(encoding="utf-8")
        for para in re.split(r"\n\s*\n", text):
            para = para.strip()
            if para:
                paragraphs.append((md_file.name, para))
    return paragraphs


class MemoAgent:
    """Answers questions by keyword-scoring paragraphs across the memos."""

    def __init__(self) -> None:
        self.paragraphs = _load_paragraphs()

    async def invoke(self, user_request: str) -> str:
        query_terms = {w.lower() for w in re.findall(r"[a-zA-Z0-9%$€]+", user_request) if len(w) > 2}
        if not query_terms:
            return "Please ask a question about one of the strategic memos."

        scored = []
        for source, para in self.paragraphs:
            para_terms = {w.lower() for w in re.findall(r"[a-zA-Z0-9%$€]+", para)}
            score = len(query_terms & para_terms)
            if score:
                scored.append((score, source, para))

        if not scored:
            return (
                "I couldn't find anything relevant in the European Product Launch, "
                "India Talent Initiative, or International Sales Expansion memos."
            )

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:3]
        answer_lines = []
        for score, source, para in top:
            answer_lines.append(f"[{source}] {para}")
        return "\n\n".join(answer_lines)
