import { json } from "./_shared.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseWatches() {
  const raw = process.env.SCRYFALL_WATCHES || "";
  return raw.split(";").map(x => x.trim()).filter(Boolean).slice(0, 40).map(entry => {
    const [set, collectorNumber, finish = "nonfoil", target = ""] = entry.split("|").map(x => x.trim());
    return { set, collectorNumber, finish: finish.toLowerCase(), target: Number(target) || null };
  }).filter(x => x.set && x.collectorNumber);
}

function priceFor(card, finish) {
  const p = card.prices || {};
  if (finish === "foil") return p.usd_foil ? Number(p.usd_foil) : null;
  if (finish === "etched") return p.usd_etched ? Number(p.usd_etched) : null;
  return p.usd ? Number(p.usd) : null;
}

export default async () => {
  const watches = parseWatches();
  const results = [];

  for (const watch of watches) {
    try {
      const url = `https://api.scryfall.com/cards/${encodeURIComponent(watch.set.toLowerCase())}/${encodeURIComponent(watch.collectorNumber)}`;
      const r = await fetch(url, { headers: { "user-agent": "MTGDealHunter/3.1", "accept": "application/json" } });
      if (!r.ok) throw new Error(`Scryfall ${r.status}`);
      const card = await r.json();
      const price = priceFor(card, watch.finish);
      results.push({
        id: card.id,
        name: card.name,
        set: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        finish: watch.finish,
        price,
        target: watch.target,
        hit: Boolean(price != null && watch.target != null && price <= watch.target),
        scryfall_uri: card.scryfall_uri,
        checked_at: new Date().toISOString()
      });
    } catch (error) {
      results.push({ ...watch, error: error.message, checked_at: new Date().toISOString() });
    }
    await sleep(110);
  }

  return json({
    ok: true,
    source: "Scryfall exact-printing prices",
    configured: watches.length,
    hits: results.filter(x => x.hit).length,
    watches: results
  });
};
