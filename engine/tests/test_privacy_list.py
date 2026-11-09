"""Settings → What leaves your Mac (design §12; docs/launch/launch-readiness.md, M10)."""

from __future__ import annotations

from tearsheet import config, server


def names(rows) -> list[str]:
    return [r["name"] for r in rows]


def test_the_list_names_both_ai_tools_and_only_services_still_used(database):
    settings = config.Settings(database.conn)
    with database.conn:  # the default: article reading never turned on
        database.conn.execute("DELETE FROM settings WHERE key = 'news_articles'")
    rows = server.services(settings)
    text = " ".join(f"{r['name']} {r['key']} {r['sent']}" for r in rows)
    assert "Codex (OpenAI)" in text and "Claude Code (Anthropic)" in text
    assert "web search" in text  # the AI tool searches the web for news links
    assert "goes only to SEC" in text
    # No longer contacted: iShares (M3), Alpha Vantage (unused), Benzinga (never chosen).
    for gone in ("iShares", "Alpha Vantage", "Benzinga"):
        assert gone not in text
    news = next(r for r in rows if r["name"] == "News sites")
    assert "doesn't download" in news["sent"]


def test_turning_article_reading_on_changes_the_news_row(database):
    settings = config.Settings(database.conn)
    settings.set("news_articles", "on")
    rows = server.services(settings)
    assert "News sites" not in names(rows)
    assert server.NEWS_READ in rows
    assert len(rows) == len(server.SERVICES)
