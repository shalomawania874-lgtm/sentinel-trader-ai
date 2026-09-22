import { NextRequest, NextResponse } from "next/server";

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
}

function readTag(block: string, tag: string) {
  const start = block.indexOf("<" + tag + ">");
  const end = block.indexOf("</" + tag + ">");
  if (start === -1 || end === -1 || end <= start) return "";
  return stripTags(block.slice(start + tag.length + 2, end));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "markets";

  try {
    const url =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(q + " markets trading") +
      "&hl=en-US&gl=US&ceid=US:en";

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("news unavailable");

    const xml = await response.text();
    const items = xml
      .split("<item>")
      .slice(1, 9)
      .map((block) => ({
        title: readTag(block, "title"),
        link: readTag(block, "link"),
        pub: readTag(block, "pubDate"),
      }))
      .filter((item) => item.title);

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { items: [], error: error instanceof Error ? error.message : "news unavailable" },
      { status: 503 }
    );
  }
}
