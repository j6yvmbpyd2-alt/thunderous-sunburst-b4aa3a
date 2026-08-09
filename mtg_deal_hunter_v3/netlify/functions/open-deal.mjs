export default async (req) => {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("url") || "";
    const dest = new URL(raw);
    if (!/^https?:$/.test(dest.protocol)) {
      return new Response("Invalid deal URL", { status: 400 });
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: dest.toString(),
        "cache-control": "no-store"
      }
    });
  } catch {
    return new Response("Invalid deal URL", { status: 400 });
  }
};
