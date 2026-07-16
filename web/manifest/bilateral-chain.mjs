import { stampBilateral, mintExchangeId, correlateDualReceipts, reserveChainLinkFields, promoteReceiptToManifest, buildDepartureManifestDraft, validateReceiptShape, } from "./receipt-hub.mjs";
import { canonicalManifestHash } from "./projection.mjs";
import { negotiateBilateralFloor } from "./trust-tier.mjs";
import { attachSignatureProfileA, verifyManifestProfileA, sign, verify } from "../signing/um-signature-profile-a.mjs";
import { publicKeyToDidKey } from "../signing/did.mjs";
import { spkiToRawPublicKey } from "../signing/ed25519.mjs";
import { base64ToBytes } from "../signing/codecs.mjs";
export { mintExchangeId };
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return isNonEmptyString(v) && Number.isFinite(Date.parse(v));
}
function randomHex(bytes) {
    const buf = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(buf);
    let hex = "";
    for (const b of buf)
        hex += b.toString(16).padStart(2, "0");
    return hex;
}
function utf8ToHex(str) {
    const bytes = new TextEncoder().encode(str);
    let hex = "";
    for (const b of bytes)
        hex += b.toString(16).padStart(2, "0");
    return hex;
}
export const SESSION_STATES = Object.freeze([
    "initiated",
    "manifests-exchanged",
    "receipts-exchanged",
    "completed",
    "expired",
]);
const FORWARD_STATES = SESSION_STATES.slice(0, 4);
export const ACTIVE_SESSION_STATES = Object.freeze(["initiated", "manifests-exchanged", "receipts-exchanged"]);
export function mintSessionId() {
    return `urn:um:session:${randomHex(16)}`;
}
export function assertBilateralSessionShape(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Session must be an object");
    if (value["@type"] !== "um:BilateralSession")
        throw new Error("Session @type must be um:BilateralSession");
    if (!isNonEmptyString(value.sessionId))
        throw new Error("Session missing sessionId");
    if (!isNonEmptyString(value.exchangeId))
        throw new Error("Session missing exchangeId");
    if (!Array.isArray(value.participants) || value.participants.length !== 2) {
        throw new Error("Session participants must be an array of exactly 2 entries");
    }
    for (const p of value.participants) {
        if (!p || typeof p !== "object")
            throw new Error("Session participant must be an object");
        if (!isNonEmptyString(p.did))
            throw new Error("Session participant missing did");
        if (p.role !== "initiator" && p.role !== "responder") {
            throw new Error("Session participant role must be initiator or responder");
        }
    }
    if (!isIsoDateTime(value.initiatedAt))
        throw new Error("session.initiatedAt must be an ISO 8601 date-time");
    if (!isIsoDateTime(value.expiresAt))
        throw new Error("session.expiresAt must be an ISO 8601 date-time");
    if (!SESSION_STATES.includes(value.state)) {
        throw new Error(`Session state must be one of ${SESSION_STATES.join("|")}`);
    }
}
export function validateBilateralSessionShape(session) {
    try {
        assertBilateralSessionShape(session);
        return { valid: true, errors: [] };
    }
    catch (e) {
        return { valid: false, errors: [e.message] };
    }
}
export function createBilateralSession({ initiatorDid, responderDid, initiatedAt, ttlSeconds = 3600, sessionId, exchangeId } = {}) {
    if (!isNonEmptyString(initiatorDid) || !isNonEmptyString(responderDid)) {
        throw new Error("createBilateralSession: initiatorDid and responderDid are required");
    }
    if (initiatorDid === responderDid) {
        throw new Error("createBilateralSession: the two participants must be DISTINCT parties");
    }
    if (!(Number.isFinite(ttlSeconds) && ttlSeconds > 0)) {
        throw new Error("createBilateralSession: ttlSeconds must be a positive number");
    }
    const initiated = isIsoDateTime(initiatedAt) ? initiatedAt : new Date().toISOString();
    const session = {
        "@type": "um:BilateralSession",
        sessionId: isNonEmptyString(sessionId) ? sessionId : mintSessionId(),
        exchangeId: isNonEmptyString(exchangeId) ? exchangeId : mintExchangeId(),
        participants: [
            { did: initiatorDid, role: "initiator" },
            { did: responderDid, role: "responder" },
        ],
        initiatedAt: initiated,
        expiresAt: new Date(Date.parse(initiated) + ttlSeconds * 1000).toISOString(),
        state: "initiated",
    };
    if (session.sessionId === session.exchangeId) {
        throw new Error("createBilateralSession: sessionId and exchangeId must be distinct correlation tokens");
    }
    for (const [kind, token] of [["session", session.sessionId], ["exchange", session.exchangeId]]) {
        const lint = lintCorrelationToken(token, { kind, partyIds: [initiatorDid, responderDid] });
        if (!lint.ok) {
            throw new Error(`createBilateralSession: ${kind} token failed the correlation-token lint — ${lint.problems.join("; ")}`);
        }
    }
    assertBilateralSessionShape(session);
    return session;
}
export function expireSessionIfPastTtl(session, { now } = {}) {
    assertBilateralSessionShape(session);
    const nowMs = isIsoDateTime(now) ? Date.parse(now) : Date.now();
    if (ACTIVE_SESSION_STATES.includes(session.state) && nowMs > Date.parse(session.expiresAt)) {
        session.state = "expired";
    }
    return session;
}
export function advanceSessionState(session, next, { now } = {}) {
    assertBilateralSessionShape(session);
    if (!SESSION_STATES.includes(next)) {
        throw new Error(`advanceSessionState: unknown state "${next}" (must be one of ${SESSION_STATES.join("|")})`);
    }
    const before = session.state;
    expireSessionIfPastTtl(session, { now });
    if (session.state === "expired") {
        if (next === "expired")
            return session;
        throw new Error(`advanceSessionState: session is expired (expiresAt ${session.expiresAt}) — "${next}" rejected fail-closed ` +
            `(O4.1: a participant MUST NOT perform session operations after expiresAt)`);
    }
    if (next === "expired") {
        if (!ACTIVE_SESSION_STATES.includes(session.state)) {
            throw new Error(`advanceSessionState: "expired" may only be entered from an active state (O4.2: TTL elapsed WITHOUT "completed"), not from "${session.state}"`);
        }
        session.state = "expired";
        return session;
    }
    const from = FORWARD_STATES.indexOf(session.state);
    const to = FORWARD_STATES.indexOf(next);
    if (from === -1) {
        throw new Error(`advanceSessionState: no transitions out of terminal state "${before}"`);
    }
    if (to !== from + 1) {
        throw new Error(`advanceSessionState: illegal transition "${session.state}" → "${next}" — the lifecycle is STRICTLY FORWARD ` +
            `(O4.2: ${FORWARD_STATES.join(" → ")}; no return to a previous state, no skipped stage)`);
    }
    session.state = next;
    return session;
}
export function assertSessionOperable(session, { now } = {}) {
    expireSessionIfPastTtl(session, { now });
    if (session.state === "expired") {
        throw new Error("session operation rejected: session is expired (O4.1 fail-closed; already-exchanged receipts remain valid records)");
    }
    if (session.state === "completed") {
        throw new Error("session operation rejected: session already completed — one exchange round per session; start a NEW session with fresh sessionId/exchangeId (O4.1)");
    }
    return session;
}
export function lintCorrelationToken(token, { kind, partyIds = [] } = {}) {
    const problems = [];
    if (!isNonEmptyString(token))
        return { ok: false, problems: ["token must be a non-empty string"] };
    const m = /^urn:um:(session|exchange):([0-9a-f]+)$/.exec(token);
    if (!m) {
        problems.push('shape: expected "urn:um:session:<hex>" or "urn:um:exchange:<hex>" (lowercase hex payload)');
    }
    else {
        if (kind !== undefined && m[1] !== kind)
            problems.push(`kind: expected a urn:um:${kind}:… token, got urn:um:${m[1]}:…`);
        const hex = m[2];
        if (hex.length < 32)
            problems.push(`entropy: hex payload is ${hex.length * 4} bits — below the 128-bit minimum (O4.1)`);
        const distinct = new Set(hex).size;
        if (distinct < 6)
            problems.push(`entropy: only ${distinct} distinct nibble values — constant/counter-like, not crypto-random`);
        let run = 1;
        let maxRun = 1;
        for (let i = 1; i < hex.length; i++) {
            run = hex[i] === hex[i - 1] ? run + 1 : 1;
            if (run > maxRun)
                maxRun = run;
        }
        if (maxRun > 12)
            problems.push(`entropy: ${maxRun}-character repeat run — padded-counter/timestamp shape, not crypto-random`);
        if (hex.length >= 32) {
            const nibbles = [...hex].map((c) => parseInt(c, 16));
            const deltaCounts = new Map();
            for (let i = 1; i < nibbles.length; i++) {
                const d = (((nibbles[i] - nibbles[i - 1]) % 16) + 16) % 16;
                deltaCounts.set(d, (deltaCounts.get(d) ?? 0) + 1);
            }
            const totalDeltas = nibbles.length - 1;
            let dominant = 0;
            for (const c of deltaCounts.values())
                if (c > dominant)
                    dominant = c;
            if (totalDeltas > 0 && dominant / totalDeltas >= 0.7) {
                problems.push(`entropy: ${dominant}/${totalDeltas} consecutive-nibble deltas are identical — arithmetic/counter-like progression, not crypto-random`);
            }
        }
    }
    const low = token.toLowerCase();
    for (const id of partyIds) {
        if (!isNonEmptyString(id))
            continue;
        const idLow = id.toLowerCase();
        const methodSpecific = idLow.startsWith("did:") ? idLow.split(":").slice(2).join(":") : idLow;
        if (low.includes(idLow)) {
            problems.push(`party identifier embedded: token contains "${id}" (O4.1: MUST NOT encode party identifiers)`);
        }
        else if (methodSpecific.length >= 6 && low.includes(methodSpecific)) {
            problems.push(`party identifier embedded: token contains the DID method-specific id of "${id}"`);
        }
        else if (low.includes(utf8ToHex(idLow))) {
            problems.push(`party identifier embedded (hex-encoded): token contains hex(UTF-8) of "${id}"`);
        }
    }
    return { ok: problems.length === 0, problems };
}
export function negotiatedTierFloor(manifestA, manifestB) {
    return negotiateBilateralFloor(manifestA?.requiredTrustTier, manifestB?.requiredTrustTier);
}
export function enforceExchangeFloor({ floor, verifiedTiers = {}, sybilCritical = true } = {}) {
    if (!(Number.isInteger(floor) && floor >= 0 && floor <= 3)) {
        throw new Error("enforceExchangeFloor: floor must be an integer 0..3 (use negotiatedTierFloor)");
    }
    const unsatisfied = Object.entries(verifiedTiers)
        .filter(([, tier]) => (Number.isInteger(tier) ? tier : 0) < floor)
        .map(([party]) => party);
    const satisfied = unsatisfied.length === 0;
    return {
        floor,
        satisfied,
        unsatisfied,
        sybilCritical,
        action: satisfied ? "proceed" : sybilCritical ? "fail-closed" : "restricted-mode",
    };
}
export function pairSessionReceipts(session, receiptByInitiator, receiptByResponder, { now } = {}) {
    assertSessionOperable(session, { now });
    if (session.state !== "manifests-exchanged") {
        throw new Error(`pairSessionReceipts: receipts are produced after both manifests are presented — session is "${session.state}", expected "manifests-exchanged"`);
    }
    const initiator = session.participants.find((p) => p.role === "initiator");
    const responder = session.participants.find((p) => p.role === "responder");
    if (!initiator || !responder)
        throw new Error("pairSessionReceipts: session must carry one initiator and one responder");
    const out = correlateDualReceipts(receiptByInitiator, receiptByResponder, {
        exchangeId: session.exchangeId,
        evaluatorIdA: initiator.did,
        evaluatorIdB: responder.did,
    });
    advanceSessionState(session, "receipts-exchanged", { now });
    return out;
}
export function correlateReceiptPair(receipts, exchangeId) {
    if (!isNonEmptyString(exchangeId))
        throw new Error("correlateReceiptPair: exchangeId is required");
    const matches = (Array.isArray(receipts) ? receipts : []).filter((r) => r && r.exchangeId === exchangeId);
    const evaluators = new Set(matches.map((r) => r.evaluatorId));
    const ok = matches.length === 2 && evaluators.size === 2 && !evaluators.has(undefined);
    return {
        exchangeId,
        ok,
        found: matches.length,
        pair: ok ? matches : null,
        ...(ok
            ? {}
            : {
                problem: matches.length !== 2
                    ? `expected exactly 2 receipts sharing ${exchangeId}, found ${matches.length}`
                    : "the two receipts must carry DISTINCT evaluatorIds",
            }),
    };
}
export function createReceiptHashChain(source = {}) {
    let chainId;
    if (source && source["@type"] === "um:BilateralSession") {
        assertBilateralSessionShape(source);
        chainId = source.sessionId;
    }
    else {
        chainId = isNonEmptyString(source.chainId) ? source.chainId : `urn:um:chain:${randomHex(16)}`;
    }
    return { chainId, createdAt: new Date().toISOString(), sealed: false, links: [] };
}
function isPromotedReceiptManifest(r) {
    const t = r?.["@type"];
    return Array.isArray(t) && t.includes("um:Manifest") && t.includes("um:Receipt") && isNonEmptyString(r?.["@context"]);
}
function signerDidKeyOfLink(link) {
    const sig = link?.signature;
    if (sig && typeof sig === "object" && typeof sig.publicKeySpkiB64 === "string" && sig.publicKeySpkiB64.length > 0) {
        return publicKeyToDidKey(spkiToRawPublicKey(base64ToBytes(sig.publicKeySpkiB64)));
    }
    if (sig && typeof sig === "object" && typeof sig.keyRef === "string" && sig.keyRef.startsWith("did:key:")) {
        return sig.keyRef.split("#")[0];
    }
    return null;
}
export async function appendReceiptToChain(chain, receipt, { envelope = {}, privateKeyInput, keyRef } = {}) {
    if (!chain || !Array.isArray(chain.links))
        throw new Error("appendReceiptToChain: a receipt hash chain is required");
    if (chain.sealed)
        throw new Error("appendReceiptToChain: chain is sealed (flushPolicy session-end) — no further links");
    if (!privateKeyInput) {
        throw new Error("appendReceiptToChain: privateKeyInput is required — chain links are Profile A signed (O4.3 tamper-diagnostics)");
    }
    const seq = chain.links.length;
    const prevHash = seq === 0 ? null : await canonicalManifestHash(chain.links[seq - 1]);
    let promoted;
    if (isPromotedReceiptManifest(receipt)) {
        if (receipt.signature) {
            throw new Error("appendReceiptToChain: receipt is already signed — chain-link fields must sit INSIDE the signed payload; pass the unsigned receipt");
        }
        promoted = { ...receipt };
    }
    else {
        promoted = promoteReceiptToManifest(receipt, envelope);
    }
    reserveChainLinkFields(promoted, { seq, prevHash, chainId: chain.chainId });
    const signed = await attachSignatureProfileA(promoted, privateKeyInput, keyRef ? { keyRef } : {});
    chain.links.push(signed);
    return signed;
}
export async function sealReceiptHashChain(chain, { at } = {}) {
    if (!chain || chain.sealed)
        throw new Error("sealReceiptHashChain: chain missing or already sealed");
    if (chain.links.length === 0)
        throw new Error("sealReceiptHashChain: cannot seal an empty chain");
    chain.sealed = true;
    chain.sealedAt = isIsoDateTime(at) ? at : new Date().toISOString();
    chain.headSeq = chain.links.length - 1;
    chain.headHash = await canonicalManifestHash(chain.links[chain.links.length - 1]);
    return chain;
}
export async function verifyReceiptChain(chainOrLinks, { expectChainId, session, participants, expectHead } = {}) {
    const links = Array.isArray(chainOrLinks) ? chainOrLinks : Array.isArray(chainOrLinks?.links) ? chainOrLinks.links : [];
    const chainObject = !Array.isArray(chainOrLinks) && Array.isArray(chainOrLinks?.links) ? chainOrLinks : null;
    const authorizedDids = Array.isArray(participants)
        ? participants.filter(isNonEmptyString)
        : session && Array.isArray(session.participants)
            ? session.participants.map((p) => p?.did).filter(isNonEmptyString)
            : null;
    const authorizedSet = authorizedDids && authorizedDids.length ? new Set(authorizedDids) : null;
    const effectiveExpectChainId = expectChainId !== undefined ? expectChainId : session && isNonEmptyString(session.sessionId) ? session.sessionId : undefined;
    const bound = effectiveExpectChainId !== undefined || participants !== undefined || session !== undefined || expectHead !== undefined;
    const report = { valid: true, chainId: null, length: links.length, brokenAt: null, links: [], errors: [] };
    if (links.length === 0) {
        report.valid = false;
        report.errors.push("empty chain — nothing to verify");
        return report;
    }
    const chainId = links[0]?.chainId;
    report.chainId = chainId ?? null;
    if (!isNonEmptyString(chainId)) {
        report.valid = false;
        report.errors.push("genesis link carries no chainId");
    }
    if (effectiveExpectChainId !== undefined && chainId !== effectiveExpectChainId) {
        report.valid = false;
        report.errors.push(`chainId "${chainId}" does not equal expected "${effectiveExpectChainId}" (O3.1: a bilateral session's chainId MUST equal its sessionId)`);
    }
    const headAnchor = expectHead && typeof expectHead === "object"
        ? { headSeq: expectHead.headSeq, headHash: expectHead.headHash, source: "an external signed head anchor (expectHead)" }
        : chainObject && chainObject.sealed === true
            ? { headSeq: chainObject.headSeq, headHash: chainObject.headHash, source: "the chain seal (headSeq/headHash)" }
            : null;
    if (headAnchor) {
        const headIndex = links.length - 1;
        if (!Number.isInteger(headAnchor.headSeq) || headIndex !== headAnchor.headSeq) {
            report.valid = false;
            report.errors.push(`head mismatch: chain presents ${links.length} link(s) (head index ${headIndex}) but ${headAnchor.source} pins headSeq=${headAnchor.headSeq} — a truncated prefix / genesis-collapse is rejected fail-closed (V1)`);
        }
        const recomputedHead = await canonicalManifestHash(links[links.length - 1]);
        if (!isNonEmptyString(headAnchor.headHash) || recomputedHead !== headAnchor.headHash) {
            report.valid = false;
            report.errors.push(`head hash mismatch: recomputed head ${String(recomputedHead).slice(0, 20)}… ≠ anchored headHash ${String(headAnchor.headHash).slice(0, 20)}… — the presented head is not the sealed head (V1 fail-closed)`);
        }
    }
    let broken = false;
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const row = { seq: link?.seq, status: "verified", problems: [] };
        if (broken) {
            row.status = "unverified";
            row.problems.push("after the break — treated as unverified (O3.1)");
            report.links.push(row);
            continue;
        }
        if (link?.seq !== i)
            row.problems.push(`seq ${link?.seq} — expected ${i} (monotonic, gapless, genesis 0)`);
        if (link?.chainId !== chainId)
            row.problems.push(`chainId "${link?.chainId}" differs from the chain's "${chainId}"`);
        if (i === 0) {
            if (link?.prevHash !== null)
                row.problems.push(`genesis prevHash must be null, got ${JSON.stringify(link?.prevHash)}`);
        }
        else {
            const recomputed = await canonicalManifestHash(links[i - 1]);
            if (link?.prevHash !== recomputed) {
                row.problems.push(`prevHash mismatch: stored ${String(link?.prevHash).slice(0, 20)}… ≠ recomputed ${recomputed.slice(0, 20)}… — the prior link was altered or this link was forged`);
            }
        }
        const shape = validateReceiptShape(link);
        if (!shape.valid)
            row.problems.push(`canonical receipt shape violated: ${shape.errors[0]}`);
        const sig = await verifyManifestProfileA(link);
        if (!sig.ok)
            row.problems.push(`link signature failed: ${sig.reason}`);
        if (row.problems.length > 0) {
            row.status = "broken";
            broken = true;
            report.brokenAt = i;
            report.valid = false;
            for (const p of row.problems)
                report.errors.push(`link ${i}: ${p}`);
        }
        report.links.push(row);
    }
    if (!broken && bound) {
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const problems = [];
            const evaluatorId = link?.evaluatorId;
            if (isNonEmptyString(evaluatorId) && evaluatorId.startsWith("did:key:")) {
                let signerDid = null;
                try {
                    signerDid = signerDidKeyOfLink(link);
                }
                catch {
                    signerDid = null;
                }
                if (signerDid === null) {
                    problems.push(`signer identity not offline-derivable, yet evaluatorId is the did:key ${evaluatorId.slice(0, 24)}… — cannot bind the signing key to the claimed evaluator (fail closed, V2)`);
                }
                else if (signerDid !== evaluatorId) {
                    problems.push(`signer/evaluator mismatch: the signing key binds to ${signerDid.slice(0, 24)}… but the link claims evaluatorId ${evaluatorId.slice(0, 24)}… — a re-signed forgery under another party's identity (V2)`);
                }
            }
            if (authorizedSet && !(isNonEmptyString(evaluatorId) && authorizedSet.has(evaluatorId))) {
                problems.push(`evaluatorId ${String(evaluatorId).slice(0, 24)}… is not one of the authorized session participants (V2: evaluatorId ∈ session.participants)`);
            }
            if (problems.length > 0) {
                report.links[i].status = "broken";
                report.links[i].problems.push(...problems);
                report.brokenAt = i;
                report.valid = false;
                for (const p of problems)
                    report.errors.push(`link ${i}: ${p}`);
                for (let j = i + 1; j < links.length; j++) {
                    report.links[j].status = "unverified";
                    report.links[j].problems.push("after the break — treated as unverified (O3.1)");
                }
                break;
            }
        }
    }
    return report;
}
export async function fillChainSealFields(chainFacet, hashChain, { privateKeyInput, keyRef } = {}) {
    const entity = chainFacet?.entity;
    if (!entity || typeof entity !== "object")
        throw new Error("fillChainSealFields: a receipt-chain facet (hub buildReceiptChainFacet) is required");
    if (!hashChain?.sealed)
        throw new Error("fillChainSealFields: seal the receipt hash chain first (flushPolicy session-end)");
    if (!Array.isArray(hashChain.links) || hashChain.links.length === 0)
        throw new Error("fillChainSealFields: the hash chain has no links");
    if (!privateKeyInput)
        throw new Error("fillChainSealFields: privateKeyInput is required for the seal signature");
    entity.seq = hashChain.links.length - 1;
    entity.prevHash = await canonicalManifestHash(hashChain.links[hashChain.links.length - 1]);
    const payload = { ...entity };
    delete payload.sealSignature;
    const { signature, protected: prot } = await sign(payload, privateKeyInput, keyRef ? { keyRef } : {});
    entity.sealSignature = { ...prot, value: signature };
    return chainFacet;
}
export async function verifyChainSealFields(chainFacet, hashChain = undefined) {
    const errors = [];
    const entity = chainFacet?.entity;
    if (!entity || typeof entity !== "object")
        return { ok: false, errors: ["not a receipt-chain facet"] };
    if (!entity.sealSignature || typeof entity.sealSignature !== "object")
        errors.push("sealSignature is missing (reserved field not filled)");
    if (!Number.isInteger(entity.seq))
        errors.push("seq is missing (reserved field not filled)");
    if (!/^sha256:[0-9a-f]{64}$/.test(String(entity.prevHash)))
        errors.push("prevHash is missing/malformed (reserved field not filled)");
    if (hashChain) {
        if (!hashChain.sealed)
            errors.push("hash chain is not sealed");
        else {
            const headSeq = hashChain.links.length - 1;
            if (entity.seq !== headSeq)
                errors.push(`seq ${entity.seq} ≠ chain head seq ${headSeq}`);
            const recomputed = await canonicalManifestHash(hashChain.links[hashChain.links.length - 1]);
            if (entity.prevHash !== recomputed)
                errors.push("prevHash does not match the RECOMPUTED chain-head hash");
        }
    }
    if (entity.sealSignature && typeof entity.sealSignature === "object") {
        const payload = { ...entity };
        delete payload.sealSignature;
        const ok = await verify(payload, entity.sealSignature);
        if (!ok)
            errors.push("seal signature does not verify over the facet entity's canonical bytes");
    }
    return { ok: errors.length === 0, errors };
}
export async function buildSealedDepartureManifest({ eventChain, hashChain, subject, issuedAt, ttlSeconds, id, privateKeyInput, keyRef } = {}) {
    const draft = buildDepartureManifestDraft(eventChain, { subject, issuedAt, ttlSeconds, id });
    await fillChainSealFields(draft.facets[0], hashChain, { privateKeyInput, keyRef });
    return attachSignatureProfileA(draft, privateKeyInput, keyRef ? { keyRef } : {});
}
export async function conductBilateralExchange({ initiator, responder, session, now, ttlSeconds = 3600, sybilCritical = true } = {}) {
    for (const [label, party] of [["initiator", initiator], ["responder", responder]]) {
        if (!party || !isNonEmptyString(party.did))
            throw new Error(`conductBilateralExchange: ${label}.did is required`);
        if (!party.manifest || typeof party.manifest !== "object")
            throw new Error(`conductBilateralExchange: ${label}.manifest is required`);
        if (typeof party.evaluateCounterparty !== "function") {
            throw new Error(`conductBilateralExchange: ${label}.evaluateCounterparty(manifest, ctx) is required — this module does not evaluate manifests itself`);
        }
        if (!party.privateKeyInput)
            throw new Error(`conductBilateralExchange: ${label}.privateKeyInput is required (chain links are signed by their evaluator)`);
    }
    const at = isIsoDateTime(now) ? now : new Date().toISOString();
    const sess = session ?? createBilateralSession({ initiatorDid: initiator.did, responderDid: responder.did, initiatedAt: at, ttlSeconds });
    assertSessionOperable(sess, { now: at });
    advanceSessionState(sess, "manifests-exchanged", { now: at });
    const receiptByInitiator = await initiator.evaluateCounterparty(responder.manifest, { now: at, evaluatorId: initiator.did, session: sess });
    const receiptByResponder = await responder.evaluateCounterparty(initiator.manifest, { now: at, evaluatorId: responder.did, session: sess });
    for (const [label, r] of [["initiator", receiptByInitiator], ["responder", receiptByResponder]]) {
        const shape = validateReceiptShape(r);
        if (!shape.valid)
            throw new Error(`conductBilateralExchange: ${label}'s receipt violates the canonical shape — ${shape.errors.join("; ")}`);
    }
    const floor = negotiatedTierFloor(initiator.manifest, responder.manifest);
    const admission = enforceExchangeFloor({
        floor,
        verifiedTiers: {
            responder: Number.isInteger(receiptByInitiator.effectiveTrustTier) ? receiptByInitiator.effectiveTrustTier : 0,
            initiator: Number.isInteger(receiptByResponder.effectiveTrustTier) ? receiptByResponder.effectiveTrustTier : 0,
        },
        sybilCritical,
    });
    pairSessionReceipts(sess, receiptByInitiator, receiptByResponder, { now: at });
    const chain = createReceiptHashChain(sess);
    const signedByInitiator = await appendReceiptToChain(chain, receiptByInitiator, {
        envelope: { subject: initiator.did, issuedAt: at, ttlSeconds },
        privateKeyInput: initiator.privateKeyInput,
        ...(initiator.keyRef ? { keyRef: initiator.keyRef } : {}),
    });
    const signedByResponder = await appendReceiptToChain(chain, receiptByResponder, {
        envelope: { subject: responder.did, issuedAt: at, ttlSeconds },
        privateKeyInput: responder.privateKeyInput,
        ...(responder.keyRef ? { keyRef: responder.keyRef } : {}),
    });
    advanceSessionState(sess, "completed", { now: at });
    await sealReceiptHashChain(chain, { at });
    return {
        session: sess,
        exchangeId: sess.exchangeId,
        floor,
        admission,
        admitted: admission.action === "proceed",
        receipts: { byInitiator: signedByInitiator, byResponder: signedByResponder },
        chain,
    };
}
export function bilateralPanelRecord(session, { floor, admission, chainReport } = {}) {
    assertBilateralSessionShape(session);
    return {
        kind: "um-bilateral-session",
        preview: "EXT-OPT O3/O4 PREVIEW (session object + receipt hash-chain); Base §4 exchangeId/evaluatorId fields are NOT preview",
        sessionId: session.sessionId,
        exchangeId: session.exchangeId,
        state: session.state,
        participants: session.participants.map((p) => `${p.role}: ${p.did}`),
        expiresAt: session.expiresAt,
        ...(floor !== undefined ? { negotiatedTierFloor: floor } : {}),
        ...(admission ? { admission: admission.action, floorSatisfied: admission.satisfied } : {}),
        ...(chainReport
            ? { chain: { chainId: chainReport.chainId, length: chainReport.length, valid: chainReport.valid, brokenAt: chainReport.brokenAt } }
            : {}),
        at: new Date().toISOString(),
    };
}
export const feature_BILATERAL_CONFORMANCE = Object.freeze({
    wo: "runtime",
    scoped_claim: "um:BilateralSession object (schema $defs.bilateralSession shape, strictly-forward O4.2 lifecycle, " +
        "TTL fail-closed) + paired-receipt correlation (shared exchangeId, per-evaluator evaluatorId) + THE " +
        "receipt hash-chain (seq gapless from 0, prevHash recompute-verified, chainId = sessionId, Profile A " +
        "signed links, tamper genuinely breaks verification) + the negotiated bilateral tier floor (runtime math, " +
        "Sybil-critical fail-closed)",
    preview_features: Object.freeze([
        "um:BilateralSession object + lifecycle — EXT-OPT O4 PREVIEW",
        "receipt hash-chaining seq/prevHash/chainId + facet seal — EXT-OPT O3.1/O4 PREVIEW (computed ONLY here)",
        "receipts-as-manifests chain links (@type [um:Manifest,um:Receipt]) — EXT-OPT O3 PREVIEW (hub shape)",
    ]),
    base_surface: Object.freeze([
        "exchangeId/evaluatorId on in-session receipts and the negotiated tier floor are Base §4 / CONFORMANCE §4 — NOT preview",
    ]),
    not_claimed: Object.freeze([
        "NO um_conformance flag is flipped by this module",
        "manifest evaluation itself (signature/freshness/consent/tier verification) is the stage engines' job — this module frames, correlates, and chains",
        "effectiveTrustTier values consumed by the floor gate are runtime/134 outputs, not verified here",
        "the completion acknowledgment uses the in-process transport binding (O4.4 transport independence — no network protocol claimed)",
        "sessionKeyAuthorization (O3.1 session-scoped signing keys) is not implemented — links are signed with each evaluator's key; noted as a privacy trade-off, not claimed",
    ]),
    spec_letter_deltas: Object.freeze([
        'prevHash encoding: house "sha256:<64 hex>" string (hub-validated), not multibase/multihash — O3.1 names the multihash encoding as an open wire-freeze input',
        "genesis prevHash: explicit null (house pin, hub-validated), where the O3.1 letter says omitted for seq 0",
        "chain hash preimage: canonicalManifestHash over the WHOLE prior receipt INCLUDING signature (pinned by runtime's binding-chain reference), where O3.1 says the prior receipt's canonical signing bytes",
    ]),
    chain_shape: Object.freeze({
        chain: "{ chainId, createdAt, sealed, sealedAt?, headSeq?, headHash?, links: [signed receipt manifests] }",
        link: '{ "@context", "@id", "@type":["um:Manifest","um:Receipt"], manifestVersion:"0.4", subject:<evaluator DID>, ' +
            "issuedAt, expiresAt, …canonical receipt members…, exchangeId, evaluatorId, seq, prevHash, chainId, signature } " +
            "— chain fields INSIDE the signed payload; prevHash(i) = canonicalManifestHash(link i-1)",
        reuse: "runtime: createReceiptHashChain({chainId}) | (session) → appendReceiptToChain → sealReceiptHashChain → verifyReceiptChain / fillChainSealFields / buildSealedDepartureManifest",
    }),
    hash_conventions: Object.freeze({
        chain: "canonicalManifestHash (runtime-projection.mjs): deep-key-sorted JSON over the WHOLE document INCLUDING signature",
        signing_input: "JCS RFC-8785 with {signature, postQuantumSignature, presentationProof} excluded (runtime/119)",
    }),
});
