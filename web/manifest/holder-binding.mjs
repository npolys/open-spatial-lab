import { jcsCanonicalizeToBytes } from "../signing/jcs-rfc8785.mjs";
import { derivePublicKeyRaw, rawPublicKeyToSpki, signBytes, verifyBytes, } from "../signing/ed25519.mjs";
import { base64ToBytes, bytesToBase64, bytesToBase64Url, bytesToHex, utf8Encode } from "../signing/codecs.mjs";
import { publicKeyToDidKey, resolveKeyRefOffline } from "../signing/did.mjs";
import { verifyManifestProfileA, computeSigningInput } from "../signing/um-signature-profile-a.mjs";
export const HOLDER_BINDING_MODES = Object.freeze(["sd-jwt-kb", "bbs-holder-commitment", "reciprocal-control"]);
export const PRESENTATION_PROOF_TYPES = Object.freeze(["sd-jwt-kb", "bbs-derived", "did-auth"]);
export const IMPLEMENTED_PRESENTATION_PROOF_TYPES = Object.freeze(["did-auth"]);
export const AT_RISK_PRESENTATION_PROOF_TYPES = Object.freeze(["sd-jwt-kb", "bbs-derived"]);
export const VP_EMBEDDED_LIMIT_BYTES = 50 * 1024;
export const VP_TOTAL_LIMIT_BYTES = 500 * 1024;
export const HOLDER_BINDING_STATUSES = Object.freeze(["verified", "failed", "unsupported-mode", "absent"]);
export const PRESENTATION_PROOF_STATUSES = Object.freeze(["verified", "failed", "missing-required", "absent"]);
export const RECIPROCAL_HARDENED_PROFILE = "um:reciprocal-control:hardened-v2";
export const RECIPROCAL_HARDENED_DOMAIN = "um:reciprocal-control:hardened-v2";
export const RECIPROCAL_REPLAYABLE_WARNING_CODE = "um:warning:reciprocal-binding-replayable";
export const feature_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 EXT-T1 (holder binding T1.1 + presentation validation T1.2 + VP limits T1.5.1)",
    fixtures_owned: 12,
    did_auth_presentation_proof_real: true,
    reciprocal_control_crypto_when_resolvable: true,
    reciprocal_control_spec_recipe_replay_flagged: true,
    reciprocal_control_hardened_profile_replay_resistant: true,
    claim_proof_vp_size_limits_real: true,
    keyref_resolution_posture_real: true,
    signing_input_exclusion_v04: true,
    sd_jwt_kb_holder_binding_verification: false,
    bbs_holder_commitment_verification: false,
    sd_jwt_kb_presentation_proof: false,
    bbs_derived_presentation_proof: false,
    full_six_stage_evaluator: false,
    um_conformance_flag_flipped: false,
    scoped_claim: "runtime implements REAL did-auth presentation validation (issue + verify, byte-exact per EXT-T1 T1.2), " +
        "REAL reciprocal-control binding crypto over the manifest @id where key material resolves, REAL " +
        "VP size limits, and structural emit/validation for all three holderBinding modes. sd-jwt-kb and " +
        "bbs modes/proofTypes have NO crypto here: bindings record 'unsupported-mode' (Tier-0 cap) and " +
        "at-risk proofTypes are failed closed — never verified. This is the Stage-2 (2a/2b) slice, not " +
        "the full six-stage evaluator. AV-5 hardening: the literal T1.1.1 reciprocal recipe is replay-" +
        "vulnerable, so a binding verified under it is FLAGGED on the receipt (um:warning:reciprocal-" +
        "binding-replayable) rather than silently overclaimed, and an opt-in hardened profile " +
        "(um:reciprocal-control:hardened-v2, binding nonce+both DIDs+@id) resists the transplant/replay. " +
        "AV-14 hardening: string/array-of-string claimProofs are length-bounded so oversize data cannot " +
        "evade the 50 KB/500 KB VP caps as a nominal 'URI reference'.",
});
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return typeof v === "string" && Number.isFinite(Date.parse(v));
}
function concatBytes(parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
function subtle() {
    const s = globalThis.crypto?.subtle;
    if (!s)
        throw new Error("WebCrypto (crypto.subtle) unavailable — need Node >= 18.4 or a modern browser");
    return s;
}
async function sha256(bytes) {
    return new Uint8Array(await subtle().digest("SHA-256", bytes));
}
function utf8ByteLength(str) {
    return utf8Encode(str).length;
}
export function validateHolderBindingShape(binding, claimType = "claim") {
    const errors = [];
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
        return { valid: false, errors: [`claim ${claimType}: holderBinding must be an object`] };
    }
    if (!HOLDER_BINDING_MODES.includes(binding.mode)) {
        return {
            valid: false,
            errors: [`claim ${claimType}: holderBinding.mode must be one of ${HOLDER_BINDING_MODES.join("|")}`],
        };
    }
    if (binding.mode === "sd-jwt-kb") {
        if (!isNonEmptyString(binding.cnfThumbprint)) {
            errors.push(`claim ${claimType}: holderBinding.cnfThumbprint is required for sd-jwt-kb mode`);
        }
    }
    else if (binding.mode === "bbs-holder-commitment") {
        if (!isNonEmptyString(binding.commitment)) {
            errors.push(`claim ${claimType}: holderBinding.commitment is required for bbs-holder-commitment mode (EXT-T1 Section T1.1.1)`);
        }
        if (!isNonEmptyString(binding.proofValue)) {
            errors.push(`claim ${claimType}: holderBinding.proofValue is required for bbs-holder-commitment mode (EXT-T1 Section T1.1.1)`);
        }
    }
    else if (binding.mode === "reciprocal-control") {
        if (!isNonEmptyString(binding.boundDid)) {
            errors.push(`claim ${claimType}: holderBinding.boundDid is required for reciprocal-control mode`);
        }
        if (!isNonEmptyString(binding.subjectProof)) {
            errors.push(`claim ${claimType}: holderBinding.subjectProof is required for reciprocal-control mode`);
        }
        if (!isNonEmptyString(binding.boundDidProof)) {
            errors.push(`claim ${claimType}: holderBinding.boundDidProof is required for reciprocal-control mode`);
        }
    }
    return { valid: errors.length === 0, errors };
}
export function validatePresentationProofShape(validation) {
    const errors = [];
    if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
        return { valid: false, errors: ["presentationProof must be an object"] };
    }
    if (!PRESENTATION_PROOF_TYPES.includes(validation.proofType)) {
        errors.push(`presentationProof.proofType must be one of ${PRESENTATION_PROOF_TYPES.join("|")}`);
    }
    if (!isNonEmptyString(validation.challenge))
        errors.push("presentationProof: missing challenge");
    if (!isNonEmptyString(validation.audience))
        errors.push("presentationProof: missing audience");
    if (!isIsoDateTime(validation.created))
        errors.push("presentationProof.created must be an ISO 8601 date-time");
    if (!isNonEmptyString(validation.proofValue))
        errors.push("presentationProof: missing proofValue");
    return { valid: errors.length === 0, errors };
}
export function checkClaimProofSizeLimits(manifest) {
    const errors = [];
    const entries = [];
    let totalBytes = 0;
    const claims = Array.isArray(manifest?.claims) ? manifest.claims : [];
    for (const claim of claims) {
        const claimRef = isNonEmptyString(claim?.["@id"]) ? claim["@id"] : claim?.["@type"];
        const cp = claim?.claimProof;
        if (cp === undefined || cp === null)
            continue;
        const list = Array.isArray(cp) ? cp : [cp];
        for (const entry of list) {
            if (typeof entry === "string") {
                const strBytes = utf8ByteLength(entry);
                if (strBytes > VP_EMBEDDED_LIMIT_BYTES) {
                    errors.push(`claim ${claimRef}: string claimProof is ${strBytes} bytes — a claimProof URI reference MUST be a short reference, not embedded data; exceeds the 50 KB per-VP size limit (Section 6.4.3, EXT-T1 Section T1.5.1)`);
                }
                continue;
            }
            if (!entry || typeof entry !== "object")
                continue;
            const bytes = utf8ByteLength(JSON.stringify(entry));
            entries.push({ claimRef, bytes });
            if (bytes > VP_EMBEDDED_LIMIT_BYTES) {
                errors.push(`claim ${claimRef}: embedded claimProof VP is ${bytes} bytes — exceeds the 50 KB per-VP size limit (Section 6.4.3, EXT-T1 Section T1.5.1)`);
            }
            totalBytes += bytes;
        }
    }
    if (totalBytes > VP_TOTAL_LIMIT_BYTES) {
        errors.push(`total embedded VP payload across claims is ${totalBytes} bytes — exceeds the 500 KB limit (Section 6.4.3, EXT-T1 Section T1.5.1)`);
    }
    return { valid: errors.length === 0, errors, totalBytes, entries };
}
export function validateWo134Structural(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        return { valid: false, errors: ["manifest must be an object"] };
    }
    const claims = Array.isArray(manifest.claims) ? manifest.claims : [];
    for (const claim of claims) {
        if (claim && typeof claim === "object" && claim.holderBinding !== undefined) {
            const r = validateHolderBindingShape(claim.holderBinding, claim["@type"]);
            errors.push(...r.errors);
        }
    }
    if (manifest.presentationProof !== undefined) {
        const r = validatePresentationProofShape(manifest.presentationProof);
        errors.push(...r.errors);
    }
    const sizes = checkClaimProofSizeLimits(manifest);
    errors.push(...sizes.errors);
    return { valid: errors.length === 0, errors };
}
export function buildHolderBinding(mode, fields = {}) {
    const binding = { mode, ...fields };
    const r = validateHolderBindingShape(binding, "(emit)");
    if (!r.valid)
        throw new Error(`buildHolderBinding: ${r.errors.join("; ")}`);
    return binding;
}
export async function makeReciprocalControlBinding(opts = {}) {
    const { manifestId, subjectPrivateKey, boundDidPrivateKey } = opts;
    if (!isNonEmptyString(manifestId))
        throw new Error("makeReciprocalControlBinding: manifestId required");
    if (!subjectPrivateKey || !boundDidPrivateKey) {
        throw new Error("makeReciprocalControlBinding: subjectPrivateKey and boundDidPrivateKey required");
    }
    const challengeBytes = utf8Encode(manifestId);
    const [subjectSig, boundSig, boundRaw] = await Promise.all([
        signBytes(challengeBytes, subjectPrivateKey),
        signBytes(challengeBytes, boundDidPrivateKey),
        derivePublicKeyRaw(boundDidPrivateKey),
    ]);
    const boundDid = isNonEmptyString(opts.boundDid) ? opts.boundDid : publicKeyToDidKey(boundRaw);
    const binding = buildHolderBinding("reciprocal-control", {
        boundDid,
        subjectProof: bytesToBase64Url(subjectSig),
        boundDidProof: bytesToBase64Url(boundSig),
    });
    return { binding, boundDid };
}
function toRawEd25519PublicKey(key) {
    if (!(key instanceof Uint8Array))
        return null;
    if (key.length === 32)
        return key;
    if (key.length > 32)
        return key.slice(-32);
    return null;
}
function freshReciprocalNonce() {
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues)
        globalThis.crypto.getRandomValues(bytes);
    else
        for (let i = 0; i < bytes.length; i++)
            bytes[i] = Math.floor(Math.random() * 256);
    return `um-reciprocal-nonce-${bytesToHex(bytes)}`;
}
export function buildReciprocalHardenedMessage({ nonce, subjectDidKey, boundDid, manifestId }) {
    return utf8Encode(`${RECIPROCAL_HARDENED_DOMAIN}\n${nonce}\n${subjectDidKey}\n${boundDid}\n${manifestId}`);
}
export async function makeReciprocalControlBindingHardened(opts = {}) {
    const { manifestId, subjectPrivateKey, boundDidPrivateKey } = opts;
    if (!isNonEmptyString(manifestId))
        throw new Error("makeReciprocalControlBindingHardened: manifestId required");
    if (!subjectPrivateKey || !boundDidPrivateKey) {
        throw new Error("makeReciprocalControlBindingHardened: subjectPrivateKey and boundDidPrivateKey required");
    }
    const [subjectRaw, boundRaw] = await Promise.all([
        derivePublicKeyRaw(subjectPrivateKey),
        derivePublicKeyRaw(boundDidPrivateKey),
    ]);
    const subjectDidKey = publicKeyToDidKey(subjectRaw);
    const boundDid = isNonEmptyString(opts.boundDid) ? opts.boundDid : publicKeyToDidKey(boundRaw);
    const nonce = isNonEmptyString(opts.nonce) ? opts.nonce : freshReciprocalNonce();
    const message = buildReciprocalHardenedMessage({ nonce, subjectDidKey, boundDid, manifestId });
    const [subjectSig, boundSig] = await Promise.all([
        signBytes(message, subjectPrivateKey),
        signBytes(message, boundDidPrivateKey),
    ]);
    const binding = buildHolderBinding("reciprocal-control", {
        boundDid,
        subjectProof: bytesToBase64Url(subjectSig),
        boundDidProof: bytesToBase64Url(boundSig),
        bindingProfile: RECIPROCAL_HARDENED_PROFILE,
        nonce,
    });
    return { binding, boundDid, nonce, subjectDidKey };
}
export async function didAuthProofMessage(manifest, { challenge, audience, created }) {
    const input = computeSigningInput(manifest, {
        exclude: ["presentationProof", "postQuantumSignature"],
    });
    const hash = await sha256(input);
    return concatBytes([hash, utf8Encode(challenge), utf8Encode(audience), utf8Encode(created)]);
}
export async function attachPresentationProofDidAuth(signedManifest, privateKey, opts = {}) {
    if (!signedManifest || typeof signedManifest !== "object") {
        throw new Error("attachPresentationProofDidAuth: signed manifest object required");
    }
    if (!signedManifest.signature || !isNonEmptyString(signedManifest.signature.value)) {
        throw new Error("attachPresentationProofDidAuth: manifest must be SIGNED first (the validation binds the signed bytes)");
    }
    const challenge = opts.challenge;
    const audience = opts.audience;
    const created = isNonEmptyString(opts.created) ? opts.created : new Date().toISOString();
    if (!isNonEmptyString(challenge))
        throw new Error("attachPresentationProofDidAuth: challenge required");
    if (!isNonEmptyString(audience))
        throw new Error("attachPresentationProofDidAuth: audience required");
    const message = await didAuthProofMessage(signedManifest, { challenge, audience, created });
    const sig = await signBytes(message, privateKey);
    const raw = await derivePublicKeyRaw(privateKey);
    const embedded = signedManifest.signature.publicKeySpkiB64;
    if (isNonEmptyString(embedded)) {
        const embeddedSpki = base64ToBytes(embedded);
        const oursSpki = rawPublicKeyToSpki(raw);
        if (bytesToHex(embeddedSpki) !== bytesToHex(oursSpki)) {
            throw new Error("attachPresentationProofDidAuth: key is not the manifest signing key (signature.publicKeySpkiB64 mismatch)");
        }
    }
    const validation = {
        proofType: "did-auth",
        challenge,
        audience,
        created,
        proofValue: bytesToBase64Url(sig),
    };
    const shape = validatePresentationProofShape(validation);
    if (!shape.valid)
        throw new Error(`attachPresentationProofDidAuth: ${shape.errors.join("; ")}`);
    return { ...signedManifest, presentationProof: validation };
}
export function issueVerifierChallenge(opts = {}) {
    const audience = isNonEmptyString(opts.audience) ? opts.audience : "did:web:demo.local:world:destination";
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues)
        globalThis.crypto.getRandomValues(bytes);
    else
        for (let i = 0; i < bytes.length; i++)
            bytes[i] = Math.floor(Math.random() * 256);
    return {
        verifierChallenge: `um-challenge-${bytesToHex(bytes)}`,
        verifierAudience: audience,
        issuedAt: new Date().toISOString(),
    };
}
export async function verifyDidAuthPresentationProof(manifest, validation) {
    try {
        const sig = manifest?.signature;
        let keyInput = null;
        if (sig && isNonEmptyString(sig.publicKeySpkiB64)) {
            keyInput = base64ToBytes(sig.publicKeySpkiB64);
        }
        else if (sig && isNonEmptyString(sig.keyRef)) {
            const resolved = await resolveKeyRefOffline(sig.keyRef);
            if (resolved.resolution === "resolved")
                keyInput = resolved.rawPublicKey;
        }
        if (!keyInput)
            return false;
        const message = await didAuthProofMessage(manifest, validation);
        return await verifyBytes(message, validation.proofValue, keyInput);
    }
    catch {
        return false;
    }
}
export async function evaluatePresentationProof(manifest, context = {}) {
    const challengeIssued = isNonEmptyString(context.verifierChallenge);
    const validation = manifest?.presentationProof;
    if (!challengeIssued) {
        return { status: null, reject: false, rejectReason: null, warning: null };
    }
    if (!validation) {
        const reason = "presentationProof absent for a verifier-issued challenge — replay-suspect, rejected for interactive verification (EXT-T1 Section T1.2)";
        return {
            status: "missing-required",
            reject: true,
            rejectReason: reason,
            warning: { code: "um:reason:trust:presentation-validation-missing", message: `Verify stage (2b): ${reason}` },
        };
    }
    if (validation.challenge !== context.verifierChallenge) {
        const reason = "presentationProof.challenge does not match the verifier-issued nonce (EXT-T1 Section T1.4 sub-step 2b)";
        return {
            status: "failed",
            reject: true,
            rejectReason: reason,
            warning: { code: "um:reason:trust:presentation-validation-failed", message: `Verify stage (2b): ${reason}` },
        };
    }
    if (isNonEmptyString(context.verifierAudience) && validation.audience !== context.verifierAudience) {
        const reason = "presentationProof.audience does not match this verifier (EXT-T1 Section T1.4 sub-step 2b)";
        return {
            status: "failed",
            reject: true,
            rejectReason: reason,
            warning: { code: "um:reason:trust:presentation-validation-failed", message: `Verify stage (2b): ${reason}` },
        };
    }
    if (validation.proofType === "did-auth") {
        const ok = await verifyDidAuthPresentationProof(manifest, validation);
        if (ok)
            return { status: "verified", reject: false, rejectReason: null, warning: null };
        const reason = "presentationProof.proofValue does not validate over the signing-input hash, challenge, audience, and created (EXT-T1 Section T1.2)";
        return {
            status: "failed",
            reject: true,
            rejectReason: reason,
            warning: { code: "um:reason:trust:presentation-validation-failed", message: `Verify stage (2b): ${reason}` },
        };
    }
    const reason = `presentationProof.proofType "${validation.proofType}" is at-risk/unimplemented — failed closed for interactive verification (CONFORMANCE Section 9; EXT-T1 Section T1.4 sub-step 2b)`;
    return {
        status: "failed",
        reject: true,
        rejectReason: reason,
        warning: { code: "um:reason:trust:presentation-validation-failed", message: `Verify stage (2b): ${reason}` },
    };
}
async function reciprocalKeys(manifest, binding) {
    let subjectKey = null;
    const sig = manifest?.signature;
    if (sig && isNonEmptyString(sig.publicKeySpkiB64)) {
        try {
            subjectKey = base64ToBytes(sig.publicKeySpkiB64);
        }
        catch {
            subjectKey = null;
        }
    }
    else if (sig && isNonEmptyString(sig.keyRef)) {
        const r = await resolveKeyRefOffline(sig.keyRef);
        if (r.resolution === "resolved")
            subjectKey = r.rawPublicKey;
    }
    let boundKey = null;
    if (isNonEmptyString(binding.boundDid)) {
        try {
            const r = await resolveKeyRefOffline(binding.boundDid);
            if (r.resolution === "resolved")
                boundKey = r.rawPublicKey;
        }
        catch {
            boundKey = null;
        }
    }
    return { subjectKey, boundKey };
}
export async function verifyHolderBindingForClaim(manifest, claim) {
    const binding = claim?.holderBinding;
    if (binding === undefined)
        return { status: "absent", tier1Capable: false, reason: "claim carries no holderBinding" };
    const shape = validateHolderBindingShape(binding, claim["@type"]);
    if (!shape.valid) {
        return { status: "failed", tier1Capable: false, reason: shape.errors.join("; ") };
    }
    if (binding.mode === "reciprocal-control") {
        const manifestId = manifest?.["@id"];
        if (!isNonEmptyString(manifestId)) {
            return { status: "failed", tier1Capable: false, reason: "manifest @id missing — reciprocal challenge undefined" };
        }
        const { subjectKey, boundKey } = await reciprocalKeys(manifest, binding);
        if (!subjectKey || !boundKey) {
            return {
                status: "failed",
                tier1Capable: false,
                reason: "reciprocal-control keys not offline-resolvable (subject embedded key and/or boundDid) — cannot verify, failed closed (EXT-T1 Section T1.1.1)",
            };
        }
        const hardened = binding.bindingProfile === RECIPROCAL_HARDENED_PROFILE;
        let messageBytes;
        if (hardened) {
            if (!isNonEmptyString(binding.nonce)) {
                return {
                    status: "failed",
                    tier1Capable: false,
                    profile: "hardened",
                    replayable: false,
                    reason: `reciprocal-control hardened profile "${RECIPROCAL_HARDENED_PROFILE}" requires a nonce — absent, failed closed`,
                };
            }
            const subjectRaw = toRawEd25519PublicKey(subjectKey);
            let subjectDidKey = null;
            try {
                if (subjectRaw)
                    subjectDidKey = publicKeyToDidKey(subjectRaw);
            }
            catch {
                subjectDidKey = null;
            }
            if (!subjectDidKey) {
                return {
                    status: "failed",
                    tier1Capable: false,
                    profile: "hardened",
                    replayable: false,
                    reason: "reciprocal-control hardened: subject key not derivable to did:key — failed closed",
                };
            }
            messageBytes = buildReciprocalHardenedMessage({
                nonce: binding.nonce,
                subjectDidKey,
                boundDid: binding.boundDid,
                manifestId,
            });
        }
        else {
            messageBytes = utf8Encode(manifestId);
        }
        let subjectOk = false;
        let boundOk = false;
        try {
            subjectOk = await verifyBytes(messageBytes, binding.subjectProof, subjectKey);
        }
        catch {
            subjectOk = false;
        }
        try {
            boundOk = await verifyBytes(messageBytes, binding.boundDidProof, boundKey);
        }
        catch {
            boundOk = false;
        }
        if (subjectOk && boundOk) {
            return hardened
                ? {
                    status: "verified",
                    tier1Capable: true,
                    profile: "hardened",
                    replayable: false,
                    reason: `subjectProof + boundDidProof verify over the hardened reciprocal message (fresh nonce + both DIDs + @id) — replay-resistant (${RECIPROCAL_HARDENED_PROFILE})`,
                }
                : {
                    status: "verified",
                    tier1Capable: true,
                    profile: "spec-t1.1.1",
                    replayable: true,
                    reason: "subjectProof + boundDidProof verify over the manifest @id (EXT-T1 §T1.1.1) — replay-vulnerable recipe; see the reciprocal-binding-replayable receipt warning",
                };
        }
        return {
            status: "failed",
            tier1Capable: false,
            profile: hardened ? "hardened" : "spec-t1.1.1",
            replayable: false,
            reason: `reciprocal-control validation verification failed (subjectProof ${subjectOk ? "ok" : "FAILED"}, boundDidProof ${boundOk ? "ok" : "FAILED"})${hardened ? ` [hardened profile ${RECIPROCAL_HARDENED_PROFILE}]` : ""} (EXT-T1 Section T1.1.1)`,
        };
    }
    return {
        status: "unsupported-mode",
        tier1Capable: false,
        reason: `holderBinding.mode "${binding.mode}" has no implemented verification profile in this evaluator — recorded unsupported-mode, capped at Tier 0 (EXT-T1 Section T1.1.1; fail closed)`,
    };
}
export async function evaluateHolderBindings(manifest, context = {}) {
    const maxSupportedTier = Number.isInteger(context.maxSupportedTrustTier) ? context.maxSupportedTrustTier : 0;
    const manifestTier = Number.isInteger(manifest?.requiredTrustTier) ? manifest.requiredTrustTier : 0;
    const claims = Array.isArray(manifest?.claims) ? manifest.claims : [];
    const claimStatuses = [];
    const warnings = [];
    let holderBindingStatus;
    let effectiveTrustTier;
    const dominance = { failed: 3, "unsupported-mode": 2, absent: 1, verified: 0 };
    const roll = (s) => {
        if (holderBindingStatus === undefined || dominance[s] > dominance[holderBindingStatus])
            holderBindingStatus = s;
    };
    for (const claim of claims) {
        if (!claim || typeof claim !== "object")
            continue;
        const claimRef = isNonEmptyString(claim["@id"]) ? claim["@id"] : claim["@type"];
        const claimTier = Math.max(manifestTier, Number.isInteger(claim.requiredTrustTier) ? claim.requiredTrustTier : 0);
        const carriesBindingMaterial = claim.holderBinding !== undefined || claim.bindingProof !== undefined || claim.ceremonyProof !== undefined;
        if (claimTier > maxSupportedTier && maxSupportedTier < 1) {
            claimStatuses.push({
                claimRef,
                status: "trustTierUnsupported",
                tier: maxSupportedTier,
                reason: `claim requiredTrustTier ${claimTier} exceeds evaluator capability ${maxSupportedTier} (Section 6.4.5)`,
            });
            continue;
        }
        if (claimTier >= 1 && !carriesBindingMaterial) {
            claimStatuses.push({
                claimRef,
                status: "trustTierUnsupported",
                tier: 0,
                reason: "claim relied upon at Tier 1+ carries no holderBinding — capped at Tier 0 (EXT-T1 Section T1.1)",
            });
            roll("absent");
            effectiveTrustTier = 0;
            warnings.push({
                code: "um:reason:trust:unbound-claims",
                message: `claim ${claimRef}: relied upon at Tier ${claimTier} without holder binding — capped at Tier 0 (EXT-T1 Section T1.1)`,
            });
            continue;
        }
        if (claim.holderBinding !== undefined) {
            const r = await verifyHolderBindingForClaim(manifest, claim);
            roll(r.status);
            if (r.status === "verified") {
                const grantedTier = Math.min(claimTier, Math.max(maxSupportedTier, 1));
                claimStatuses.push({ claimRef, status: "bound", tier: grantedTier, reason: r.reason });
                effectiveTrustTier = effectiveTrustTier === undefined ? grantedTier : Math.max(effectiveTrustTier, grantedTier);
                if (r.replayable === true) {
                    warnings.push({
                        code: RECIPROCAL_REPLAYABLE_WARNING_CODE,
                        message: `claim ${claimRef}: reciprocal holder-binding verified per EXT-T1 §T1.1.1 but this recipe is replay-vulnerable (both validation sign only the manifest @id — no nonce/counterparty/content binding); a published boundDidProof can transplant to a DID the presenter may not control. Finding filed to the UM spec; use bindingProfile "${RECIPROCAL_HARDENED_PROFILE}" for a replay-resistant binding.`,
                    });
                }
            }
            else {
                claimStatuses.push({
                    claimRef,
                    status: claimTier >= 1 ? "trustTierUnsupported" : "unverified",
                    tier: 0,
                    reason: r.reason,
                });
                effectiveTrustTier = 0;
                warnings.push({
                    code: r.status === "unsupported-mode"
                        ? "um:reason:trust:binding-mode-unsupported"
                        : "um:reason:trust:binding-failed",
                    message: `claim ${claimRef}: ${r.reason}`,
                });
            }
            continue;
        }
        claimStatuses.push({
            claimRef,
            status: "unverified",
            tier: 0,
            reason: "Tier-0 claim without holderBinding (binding not required below Tier 1)",
        });
    }
    return { holderBindingStatus, claimStatuses, effectiveTrustTier, warnings };
}
export async function recordKeyRefResolution(manifest, opts = {}) {
    const keyRef = manifest?.signature?.keyRef;
    if (!isNonEmptyString(keyRef))
        return "unresolved";
    try {
        const r = await resolveKeyRefOffline(keyRef, opts);
        return r.resolution === "resolved" ? "resolved" : "unresolved";
    }
    catch {
        return "unresolved";
    }
}
function envelopeErrors(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        return ["manifest must be an object"];
    const ctx = manifest["@context"];
    const hasV04 = ctx === "https://universalmanifest.net/ns/v0.4" ||
        (Array.isArray(ctx) && ctx.includes("https://universalmanifest.net/ns/v0.4"));
    if (!hasV04)
        errors.push("@context must include https://universalmanifest.net/ns/v0.4 (Section 1.2.1)");
    if (!isNonEmptyString(manifest["@id"]))
        errors.push("Missing @id");
    const t = manifest["@type"];
    const hasType = t === "um:Manifest" || (Array.isArray(t) && t.includes("um:Manifest"));
    if (!hasType)
        errors.push("Missing um:Manifest in @type");
    if (manifest.manifestVersion !== "0.4")
        errors.push("manifestVersion must be 0.4");
    if (!isNonEmptyString(manifest.subject))
        errors.push("Missing subject");
    if (!isIsoDateTime(manifest.issuedAt))
        errors.push("issuedAt must be an ISO 8601 date-time");
    if (!isIsoDateTime(manifest.expiresAt))
        errors.push("expiresAt must be an ISO 8601 date-time");
    if (isIsoDateTime(manifest.issuedAt) && isIsoDateTime(manifest.expiresAt) && Date.parse(manifest.issuedAt) > Date.parse(manifest.expiresAt)) {
        errors.push("issuedAt must be <= expiresAt");
    }
    return errors;
}
export async function structuralVerdictWo134(manifest) {
    const reasons = [];
    reasons.push(...envelopeErrors(manifest));
    const runtime = validateWo134Structural(manifest);
    reasons.push(...runtime.errors);
    let sigReport = null;
    if (reasons.length === 0) {
        sigReport = await verifyManifestProfileA(manifest);
        if (!sigReport.ok)
            reasons.push(`signature verification failed: ${sigReport.reason}`);
    }
    return {
        result: reasons.length === 0 ? "accept" : "reject",
        reasons,
        checks: { signature: sigReport ? sigReport.reason : "not-evaluated" },
    };
}
export async function evaluateWo134(manifest, context = {}) {
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    const manifestId = manifest && typeof manifest === "object" && isNonEmptyString(manifest["@id"]) ? manifest["@id"] : "(unknown)";
    const warnings = [];
    const receipt = {
        "@type": "um:Receipt",
        manifestId,
        outcome: "rejected",
        signatureCheck: "not-evaluated",
        freshnessCheck: "not-evaluated",
        facetStatuses: [],
        warnings,
    };
    const finish = (outcome) => {
        receipt.outcome = outcome;
        return { result: outcome === "rejected" ? "reject" : "accept", receipt };
    };
    const envErrors = envelopeErrors(manifest);
    const shapeErrors = envErrors.length === 0 ? validateWo134Structural(manifest).errors : [];
    if (envErrors.length > 0 || shapeErrors.length > 0) {
        warnings.push({ code: "um:reason:structure:malformed", message: `Verify stage: ${[...envErrors, ...shapeErrors].join("; ")}` });
        return finish("rejected");
    }
    const sig = manifest.signature;
    if (!sig || typeof sig !== "object") {
        warnings.push({ code: "um:reason:crypto:signature-missing", message: "Verify stage: missing signature" });
        return finish("rejected");
    }
    const sigReport = await verifyManifestProfileA(manifest);
    if (!sigReport.ok) {
        receipt.signatureCheck = sigReport.reason === "unsupported-profile" ? "unsupported-profile" : "invalid";
        warnings.push({
            code: sigReport.reason === "unsupported-profile" ? "um:reason:crypto:unsupported-profile" : "um:reason:crypto:signature-invalid",
            message: `Verify stage: ${sigReport.reason}`,
        });
        return finish("rejected");
    }
    receipt.signatureCheck = "valid";
    receipt.keyRefResolution = await recordKeyRefResolution(manifest);
    const SKEW_MS = 60_000;
    const issuedMs = Date.parse(manifest.issuedAt);
    const expiresMs = Date.parse(manifest.expiresAt);
    if (issuedMs - nowMs > SKEW_MS) {
        receipt.freshnessCheck = "stale";
        warnings.push({ code: "um:reason:freshness:stale", message: "Verify stage: issuedAt more than 60s in the future" });
        return finish("rejected");
    }
    if (nowMs > expiresMs) {
        receipt.freshnessCheck = "expired";
        warnings.push({ code: "um:reason:freshness:expired", message: "Verify stage: manifest expired" });
        return finish("rejected");
    }
    receipt.freshnessCheck = "fresh";
    const pp = await evaluatePresentationProof(manifest, context);
    if (pp.status !== null)
        receipt.presentationProofStatus = pp.status;
    if (pp.reject) {
        warnings.unshift(pp.warning);
        return finish("rejected");
    }
    const hb = await evaluateHolderBindings(manifest, context);
    if (hb.holderBindingStatus !== undefined)
        receipt.holderBindingStatus = hb.holderBindingStatus;
    if (hb.effectiveTrustTier !== undefined)
        receipt.effectiveTrustTier = hb.effectiveTrustTier;
    if (hb.claimStatuses.length > 0)
        receipt.claimStatuses = hb.claimStatuses;
    warnings.push(...hb.warnings);
    const anyCapped = hb.claimStatuses.some((c) => c.status === "trustTierUnsupported" || c.status === "unverified");
    if (anyCapped)
        return finish("accepted-partial");
    if (warnings.length > 0)
        return finish("accepted-with-warnings");
    return finish("accepted");
}
export async function demoPresentationExchange(signedManifest, privateKey, opts = {}) {
    const challenge = issueVerifierChallenge({ audience: opts.audience });
    const presented = await attachPresentationProofDidAuth(signedManifest, privateKey, {
        challenge: challenge.verifierChallenge,
        audience: challenge.verifierAudience,
    });
    const evalContext = {
        now: new Date().toISOString(),
        maxSupportedTrustTier: Number.isInteger(opts.maxSupportedTrustTier) ? opts.maxSupportedTrustTier : 1,
        verifierChallenge: challenge.verifierChallenge,
        verifierAudience: challenge.verifierAudience,
    };
    const receiptVerified = (await evaluateWo134(presented, evalContext)).receipt;
    const replayChallenge = issueVerifierChallenge({ audience: challenge.verifierAudience });
    const receiptReplay = (await evaluateWo134(presented, { ...evalContext, verifierChallenge: replayChallenge.verifierChallenge })).receipt;
    return { challenge, presented, receiptVerified, receiptReplay };
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/manifest-with-holder-binding.jsonld",
    "valid/manifest-with-bbs-holder-binding.jsonld",
    "valid/manifest-with-reciprocal-holder-binding.jsonld",
    "invalid/holder-binding-invalid-mode.jsonld",
    "invalid/holder-binding-missing-cnf.jsonld",
    "invalid/holder-binding-reciprocal-missing-fields.jsonld",
    "invalid/holder-binding-bbs-missing-commitment.jsonld",
    "valid/manifest-with-presentation-validation.jsonld",
    "invalid/presentation-validation-challenge-mismatch.jsonld",
    "invalid/presentation-validation-audience-mismatch.jsonld",
    "invalid/presentation-validation-missing-when-challenged.jsonld",
    "invalid/claim-validation-oversize-vp.jsonld",
]);
export async function featureFixtureHandler(fixtureJson, expectedEntry = {}) {
    if (expectedEntry.validationMode === "evaluation") {
        const { result, receipt } = await evaluateWo134(fixtureJson, expectedEntry.evaluationContext || {});
        return {
            result,
            reason: receipt.warnings?.[0]?.message || receipt.outcome,
            receipt,
        };
    }
    const verdict = await structuralVerdictWo134(fixtureJson);
    return { result: verdict.result, reason: verdict.reasons.join("; ") || "structural contract satisfied" };
}
export function registerWo134(registry) {
    if (!registry || typeof registry.register !== "function") {
        throw new Error("registerWo134: registry with a register(filename, handler) function required");
    }
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, featureFixtureHandler);
    }
    return feature_FIXTURE_FILENAMES.length;
}
