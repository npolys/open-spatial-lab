// Phase 8 (scoped down): proves the server's Accept-header content negotiation for
// model/x3d+xml actually works end-to-end against a live backend — model/x3d+xml is already
// offered as a peer format for hosted primitives (runtime/world-server/src/wow-model-writers.js,
// negotiated via wow-media-types.js), but nothing in the client currently calls this endpoint
// (see the README's Render-engine adapter section). This is a direct HTTP check, no browser
// needed — run with launchOpenSpatialLab.sh already up.
const BACKEND_A_BASE = process.env.OSL_BACKEND_A_BASE || "http://127.0.0.1:18151";

async function main() {
  const results = {};

  const sceneRes = await fetch(`${BACKEND_A_BASE}/demo/scene-objects`);
  const scene = await sceneRes.json();
  const objects = scene.objects || [];
  results.sceneObjectsFetched = sceneRes.status === 200 && objects.length >= 3;
  // wow-asset.js marks objs[0] restricted (403) and objs[1] hidden (404) by construction —
  // pick objs[2] as the plain, unrestricted primitive to negotiate against.
  const restrictedId = "primitive-" + objects[0].object_id;
  const hiddenId = "primitive-" + objects[1].object_id;
  const openId = "primitive-" + objects[2].object_id;

  async function negotiate(assetId, accept) {
    const res = await fetch(`${BACKEND_A_BASE}/wow/asset/${encodeURIComponent(assetId)}`, {
      headers: accept ? { Accept: accept } : {},
    });
    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    return { status: res.status, contentType, body };
  }

  const x3d = await negotiate(openId, "model/x3d+xml");
  results.x3dNegotiation = {
    status: x3d.status,
    contentType: x3d.contentType,
    isX3dXml: x3d.status === 200 && x3d.contentType === "model/x3d+xml" &&
      x3d.body.includes("<X3D") && x3d.body.includes("<Shape"),
  };

  const gltf = await negotiate(openId, "model/gltf+json");
  let gltfParsesAsGltf = false;
  try {
    const parsed = JSON.parse(gltf.body);
    gltfParsesAsGltf = !!(parsed && parsed.asset && typeof parsed.asset === "object");
  } catch { /* leave false */ }
  results.gltfNegotiation = {
    status: gltf.status,
    contentType: gltf.contentType,
    gltfParsesAsGltf,
  };

  const wildcard = await negotiate(openId, "*/*");
  results.wildcardNegotiation = { status: wildcard.status, contentType: wildcard.contentType };

  const unacceptable = await negotiate(openId, "application/pdf");
  let offeredTypes = [];
  try {
    offeredTypes = JSON.parse(unacceptable.body).offered || [];
  } catch { /* leave empty */ }
  results.unacceptableNegotiation = {
    status: unacceptable.status,
    offersIncludeX3d: offeredTypes.includes("model/x3d+xml"),
  };

  const restricted = await negotiate(restrictedId, "model/x3d+xml");
  results.restrictedGivesForbidden = restricted.status === 403;

  const hidden = await negotiate(hiddenId, "model/x3d+xml");
  results.hiddenGivesNotFound = hidden.status === 404;

  const ok = results.sceneObjectsFetched &&
    results.x3dNegotiation.isX3dXml &&
    results.gltfNegotiation.status === 200 && results.gltfNegotiation.gltfParsesAsGltf &&
    results.wildcardNegotiation.status === 200 &&
    results.unacceptableNegotiation.status === 406 && results.unacceptableNegotiation.offersIncludeX3d &&
    results.restrictedGivesForbidden && results.hiddenGivesNotFound;

  console.log("RESULT:", JSON.stringify({ ok, ...results }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.log("ERROR:", err && err.stack || err);
  process.exitCode = 1;
});
