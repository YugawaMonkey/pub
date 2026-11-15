const baseId = "app0Opb4i6Pg4c0s9";
const tableId = "tbll3DBcKb26qZWbh";
const viewId = "viwgVLFkH4R9sTUn8";

const fields = {
  name: "fldlTFNeAcTXzL0e6",
  category: "fldrSGDiA944tNQm4",
  status: "fldr2CzcJ9ZbxTPlg",
  purchasedOn: "fldgXLK6E6T3wLYb5",
  purchasePrice: "fldtQwzkE5XawTNb8",
  disposalMethod: "fldOTk9toDOd6VWrt",
  disposedOn: "fldwQtq3F5M9iQrFP",
  salePrice: "fldU37ebzlhCZagXZ",
  notes: "fldiVKLgx1V6zMQie",
  images: "fldfQLFhL246AUYa6",
} as const;

type Attachment = { id: string; filename: string; url: string };
type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};
type AirtablePage = { records: AirtableRecord[]; offset?: string };

function normalize(record: AirtableRecord) {
  const text = (id: string) => typeof record.fields[id] === "string" ? record.fields[id] : null;
  const amount = (id: string) => typeof record.fields[id] === "number" ? record.fields[id] : null;
  const attachments = record.fields[fields.images];
  return {
    id: record.id,
    name: text(fields.name),
    category: text(fields.category),
    status: text(fields.status),
    purchasedOn: text(fields.purchasedOn),
    purchasePrice: amount(fields.purchasePrice),
    disposalMethod: text(fields.disposalMethod),
    disposedOn: text(fields.disposedOn),
    salePrice: amount(fields.salePrice),
    notes: text(fields.notes),
    images: Array.isArray(attachments) ? attachments.map(({ id, filename, url }: Attachment) => ({ id, filename, url })) : [],
  };
}

async function loadAssets(airtableToken: string) {
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
  url.searchParams.set("view", viewId);
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const field of Object.values(fields)) url.searchParams.append("fields[]", field);

  const assets = [];
  const seenOffsets = new Set<string>();
  while (true) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${airtableToken}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Airtable HTTP " + response.status);
    const page: AirtablePage = await response.json();
    assets.push(...page.records.map(normalize));
    if (!page.offset) return assets;
    if (seenOffsets.has(page.offset)) throw new Error("Invalid Airtable pagination");
    seenOffsets.add(page.offset);
    url.searchParams.set("offset", page.offset);
  }
}

Deno.serve(async (request) => {
  const headers = {
    "Access-Control-Allow-Origin": Deno.env.get("ASSET_APP_ORIGIN") ?? "https://yugawamonkey.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };
  const json = (status: number, data: unknown) => Response.json(data, { status, headers });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json(405, { code: "method" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("AIRTABLE_ASSETS_TOKEN");
  const owner = Deno.env.get("ASSET_OWNER_ID")?.toLowerCase();
  if (!url || !anonKey || !serviceKey || !token || !owner) return json(503, { code: "setup" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { code: "login" });

  try {
    const auth = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
      signal: AbortSignal.timeout(8000),
    });
    if (auth.status === 401 || auth.status === 403) return json(401, { code: "login" });
    if (!auth.ok) return json(502, { code: "auth" });
    const user = await auth.json();
    if (user.id !== owner) return json(403, { code: "owner" });

    const startedAt = new Date().toISOString();
    let rows;
    try {
      rows = await loadAssets(token);
    } catch (error) {
      console.error("Airtable sync failed", error instanceof Error ? error.name : "UnknownError");
      return json(502, { code: "airtable" });
    }

    const save = await fetch(`${url}/rest/v1/rpc/save_fixed_asset_snapshot`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ asset_owner: owner, asset_rows: rows, sync_started_at: startedAt }),
      signal: AbortSignal.timeout(12000),
    });
    if (!save.ok) return json(502, { code: "storage" });
    return json(200, await save.json());
  } catch (error) {
    console.error("Fixed asset sync failed", error instanceof Error ? error.name : "UnknownError");
    return json(502, { code: "request" });
  }
});
