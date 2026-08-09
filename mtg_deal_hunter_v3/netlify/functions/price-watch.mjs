import { store, json, referencePriceForCard } from "./_shared.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const STARTER_WATCHES = "mar|77|nonfoil|4.00;znr|289|nonfoil|5.00";

function parseWatches() {
  const raw = process.env.SCRYFALL_WATCHES || STARTER_WATCHES;
  return raw.split(";").map(x => x.trim()).filter(Boolean).slice(0, 40).map(entry => {
    const [set, collectorNumber, finish = "nonfoil", target = ""] = entry.split("|").map(x => x.trim());
    return { set, collectorNumber, finish: finish.toLowerCase(), target: Number(target) || null };
  }).filter(x => x.set && x.collectorNumber);
}

export default async () => {
  const watches = parseWatches();
  const results = [];

  for (const watch of watches) {
    try {
      const url = `https://api.scryfall.com/cards/${encodeURIComponent(watch.set.toLowerCase())}/${encodeURIComponent(watch.collectorNumber)}`;
      const r = await fetch(url, { headers: { "user-agent": "MTGDealHunter/3.3", "accept": "application/json" } });
      if (!r.ok) throw new Error(`Scryfall ${r.status}`);
      const card = await r.json();
      const ref = await referencePriceForCard(card, watch.finish);
      const price = ref.price;
      results.push({
        id: card.id,
        name: card.name,
        set: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        finish: watch.finish,
        price,
        price_source: ref.source,
        target: watch.target,
        hit: Boolean(price != null && watch.target != null && price <= watch.target),
        scryfall_uri: card.scryfall_uri,
        tcgplayer_id: card.tcgplayer_id || null,
        checked_at: new Date().toISOString()
      });
    } catch (error) {
      results.push({ ...watch, error: error.message, checked_at: new Date().toISOString() });
    }
    await sleep(110);
  }

  const payload = {
    ok: true,
    source: results.some(x=>x.price_source==="TCGplayer Market") ? "TCGplayer Market" : "Scryfall USD fallback",
    configured: watches.length,
    hits: results.filter(x => x.hit).length,
    updated_at: new Date().toISOString(),
    watches: results
  };

  try { await store().setJSON("price-watches", payload); } catch {}
  return json(payload);
};
