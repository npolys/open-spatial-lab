import { makeLoadingPointer, validateLoadingPointer } from "./manifest/interfaces.mjs";
export const METAVERSE_PORTAL_POINTER_NAMES = Object.freeze([
    "metaverse.portal.loadingScreen",
    "metaverse.portal.loadingBranding",
    "metaverse.portal.loadingInstructions",
    "metaverse.portal.estimatedLoadTime",
]);
export const METAVERSE_PORTAL_CONSENT_KEY = "metaverse.portal.preloadContent";
export const PORTAL_LOADING_DEMO = Object.freeze({
    version_id: "runtime",
    capability: "loading-content-through-the-portal (portaling bar P11)",
    demonstration_only: true,
    presentation: "toast + notification-detail record; the original center-screen " +
        "loading card is REMOVED per interface requirement — no mid-screen surface during traversal",
    source_of_content: "metaverse.portal.* pointers served by the DESTINATION world server (runtime GET /demo/portal-view demo extension); not hardcoded client-side",
    manifest_binding: "bound into the emitted v0.4 UM manifest as runtime LoadingPointers (structural v0.4 pointer shape only)",
    standards_conformance: false,
    um_conformance_claim: false,
    scope_note: "interface requirement (MANDATE-portal-loading-content) + explainer Scene 3b; pointer names are " +
        "SUGGESTIONS from the TeleportVR/UM integration packet, not a published spec surface. " +
        "No conformance flag is flipped by this capability.",
});
export function extractPortalLoadingContent(payload) {
    try {
        const block = payload && typeof payload === "object" ? payload.metaverse_portal : null;
        if (!block || typeof block !== "object" || !block.pointers || typeof block.pointers !== "object") {
            return null;
        }
        return block;
    }
    catch (e) {
        return null;
    }
}
export function buildLoadingPointersForManifest(content, opts) {
    const out = [];
    try {
        const block = extractPortalLoadingContent({ metaverse_portal: content }) || extractPortalLoadingContent(content);
        if (!block)
            return out;
        const o = opts && typeof opts === "object" ? opts : {};
        const handoffId = o.handoffId != null ? String(o.handoffId) : "crossing";
        const base = o.destinationBase != null ? String(o.destinationBase).replace(/\/+$/, "") : "";
        for (const name of METAVERSE_PORTAL_POINTER_NAMES) {
            const entry = block.pointers[name];
            if (!entry || typeof entry !== "object")
                continue;
            const href = typeof entry.href === "string" && entry.href.length > 0 ? entry.href : null;
            const ptr = makeLoadingPointer({
                target: href ? (base && href.startsWith("/") ? `${base}${href}` : href) : null,
                pointerId: `${name}.${handoffId}`,
                label: `${name} (destination loading content; demonstration-only)`,
            });
            if (validateLoadingPointer(ptr).valid)
                out.push(ptr);
        }
    }
    catch (e) {
    }
    return out;
}
const STEPS = Object.freeze([
    {
        id: "exit-intent",
        label: "exit-intent accepted by source server",
        done: (dbg) => !!(dbg &&
            dbg.crossing &&
            dbg.crossing.server_notifications &&
            dbg.crossing.server_notifications.exit_intent &&
            dbg.crossing.server_notifications.exit_intent.accepted),
    },
    {
        id: "manifest-signed",
        label: "v0.4 UM manifest signed on exit (Profile A)",
        done: (dbg) => !!(dbg && dbg.um_signing && dbg.um_signing.signed_on_exit && dbg.um_signing.signed_on_exit.signed),
    },
    {
        id: "preload-consent",
        label: `preload consent — ${METAVERSE_PORTAL_CONSENT_KEY} (demo)`,
        done: (dbg, capture) => !!(capture && capture.content && capture.content.consent && capture.content.consent.granted),
    },
    {
        id: "arrival-accepted",
        label: "arrival accepted by destination server",
        done: (dbg) => !!(dbg &&
            dbg.crossing &&
            dbg.crossing.server_notifications &&
            dbg.crossing.server_notifications.arrival &&
            dbg.crossing.server_notifications.arrival.accepted),
    },
    {
        id: "manifest-verified",
        label: "manifest signature verified on arrival",
        done: (dbg) => !!((dbg && dbg.um_signing && dbg.um_signing.verified_on_arrival && dbg.um_signing.verified_on_arrival.verified === true) ||
            (dbg && dbg.crossing && dbg.crossing.um_manifest_verification && dbg.crossing.um_manifest_verification.verified === true)),
    },
    {
        id: "fabric-promoted",
        label: "destination fabric promoted to root (same context)",
        done: (dbg) => {
            const hist = dbg && dbg.crossing && Array.isArray(dbg.crossing.phase_history) ? dbg.crossing.phase_history : [];
            return hist.includes("fabric_promoted_to_root") || hist.includes("destination_arrived");
        },
    },
    {
        id: "avatar-loaded",
        label: "avatar + equipment loaded in destination",
        done: (dbg) => {
            const hist = dbg && dbg.crossing && Array.isArray(dbg.crossing.phase_history) ? dbg.crossing.phase_history : [];
            return hist.includes("destination_arrived") && !!(dbg && dbg.avatar) && !!(dbg && dbg.equipment_status);
        },
    },
]);
const MAX_TRACK_MS = 12000;
const UNWOUND_END_MS = 1200;
const REFRESH_MS = 200;
const tracker = {
    configured: false,
    isPlayer: false,
    adapter: null,
    readCachedLoadingContent: null,
    fetchLoadingContent: null,
    logLine: null,
    showToast: null,
    publishNotification: null,
    active: false,
    startedAt: 0,
    refreshTimer: null,
    crossingKey: null,
    lastCompletedKey: null,
    capture: null,
    record: null,
    lastStatusLine: "—",
    sessionsCount: 0,
    toastsShown: 0,
};
function $id(id) {
    return typeof document !== "undefined" ? document.getElementById(id) : null;
}
function resolveDestinationKey(dbg, adapter) {
    const fromLocation = (loc) => {
        const m = /^location-([ab])$/.exec(String(loc || ""));
        return m ? m[1] : null;
    };
    const targetLoc = dbg && dbg.controls ? dbg.controls.portal_target_location_id : null;
    const fromControls = fromLocation(targetLoc);
    if (fromControls)
        return fromControls;
    const liveCrossing = dbg && dbg.crossing && !dbg.crossing.completed_at ? dbg.crossing : null;
    const fromCrossing = liveCrossing && liveCrossing.to ? fromLocation(liveCrossing.to.location_id) : null;
    if (fromCrossing)
        return fromCrossing;
    if (adapter && adapter.previewEndpointKey)
        return adapter.previewEndpointKey;
    return adapter && adapter.activeEndpointKey === "a" ? "b" : "a";
}
export function initPortalLoadingOverlay(opts) {
    try {
        const o = opts && typeof opts === "object" ? opts : {};
        tracker.configured = true;
        tracker.isPlayer = !!o.isPlayer;
        tracker.adapter = o.adapter || null;
        tracker.readCachedLoadingContent =
            typeof o.readCachedLoadingContent === "function" ? o.readCachedLoadingContent : null;
        tracker.fetchLoadingContent = typeof o.fetchLoadingContent === "function" ? o.fetchLoadingContent : null;
        tracker.logLine = typeof o.logLine === "function" ? o.logLine : null;
        tracker.showToast = typeof o.showToast === "function" ? o.showToast : null;
        tracker.publishNotification = typeof o.publishNotification === "function" ? o.publishNotification : null;
        setPanelLine(tracker.isPlayer
            ? "armed — next crossing tracks as toast + notification record (destination metaverse.portal.* pointers; no center-screen card; demonstration-only)"
            : "player-window capability (observers mirror the crossing untouched)");
        setBodyLoadingAttr(tracker.isPlayer ? "armed" : "observer");
    }
    catch (e) {
    }
}
const RECENT_CROSSING_MS = 4000;
function crossingStartedAfter(rec, sinceEpochMs) {
    const t = rec && rec.started_at ? Date.parse(rec.started_at) : NaN;
    return Number.isFinite(t) && t >= sinceEpochMs;
}
export function notePortalLoadingState(dbg) {
    try {
        if (!tracker.configured || !tracker.isPlayer || !dbg)
            return;
        const transitionActive = dbg.controls && dbg.controls.portal_transition_phase && dbg.controls.portal_transition_phase !== "none";
        const rawCrossing = dbg.crossing || null;
        const liveCrossing = rawCrossing && !rawCrossing.completed_at ? rawCrossing : null;
        const recentCrossing = liveCrossing ||
            (rawCrossing && crossingStartedAfter(rawCrossing, Date.now() - RECENT_CROSSING_MS) ? rawCrossing : null);
        const key = transitionActive
            ? (liveCrossing && liveCrossing.handoff_id) || "pending"
            : (recentCrossing && recentCrossing.handoff_id) || null;
        if (!tracker.active) {
            if ((transitionActive || recentCrossing) && key !== null && key !== tracker.lastCompletedKey) {
                beginTracking(dbg, key, { inFlight: !!(transitionActive || liveCrossing) });
            }
            return;
        }
        if (tracker.crossingKey === "pending" &&
            rawCrossing &&
            rawCrossing.handoff_id &&
            crossingStartedAfter(rawCrossing, tracker.startedAt - 2000)) {
            tracker.crossingKey = rawCrossing.handoff_id;
            if (tracker.record)
                tracker.record.crossing.handoff_id = rawCrossing.handoff_id;
        }
        refreshTracking(dbg);
    }
    catch (e) {
    }
}
function beginTracking(dbg, key, opts) {
    tracker.active = true;
    tracker.startedAt = Date.now();
    tracker.crossingKey = key;
    tracker.sessionsCount += 1;
    const adapter = tracker.adapter;
    const destKey = resolveDestinationKey(dbg, adapter);
    const base = adapter && typeof adapter.demoProxyBase === "function" ? adapter.demoProxyBase(destKey) : "";
    const cached = tracker.readCachedLoadingContent ? tracker.readCachedLoadingContent(destKey) : null;
    tracker.capture = { key: destKey, base, content: cached || null };
    tracker.record = buildNotificationRecord(dbg, destKey, base, key);
    if (tracker.publishNotification)
        tracker.publishNotification(tracker.record);
    setBodyLoadingAttr("tracking");
    if (opts && opts.inFlight && tracker.showToast) {
        const screen = contentValue("metaverse.portal.loadingScreen") || {};
        const brand = contentValue("metaverse.portal.loadingBranding") || {};
        const title = escapeToastText(screen.headline || (brand.world_title ? `Entering ${brand.world_title}` : "Entering destination…"));
        const sub = escapeToastText([brand.tagline || null, `${STEPS.length} background steps tracking`, "demonstration-only"]
            .filter(Boolean)
            .join(" · "));
        tracker.showToast(title, sub, "toast-departed", { notificationId: tracker.record.id });
        tracker.toastsShown += 1;
        tracker.record.toast.shown = true;
        tracker.record.toast.shown_at = new Date().toISOString();
    }
    if (!tracker.capture.content && tracker.fetchLoadingContent) {
        Promise.resolve(tracker.fetchLoadingContent(destKey))
            .then((content) => {
            if (tracker.capture && tracker.capture.key === destKey && content) {
                tracker.capture.content = content;
                if (tracker.record)
                    applyContentToRecord(tracker.record);
            }
        })
            .catch(() => { });
    }
    if (tracker.logLine) {
        tracker.logLine(`runtime: through-portal loading record OPEN (toast+notification; no center-screen card — runtime) — ` +
            `content from ${destKey.toUpperCase()} metaverse.portal.* pointers${tracker.capture.content ? "" : " (fetching…)"}; demonstration-only`);
    }
    if (tracker.refreshTimer)
        clearInterval(tracker.refreshTimer);
    tracker.refreshTimer = setInterval(() => {
        try {
            const live = tracker.adapter && typeof tracker.adapter.debugState === "function" ? tracker.adapter.debugState() : null;
            if (live)
                refreshTracking(live);
        }
        catch (e) {
        }
    }, REFRESH_MS);
    refreshTracking(dbg);
}
function refreshTracking(dbg) {
    if (!tracker.active || !tracker.record)
        return;
    const rec = tracker.record;
    const now = Date.now();
    const elapsedMs = now - tracker.startedAt;
    const crossing = dbg.crossing || null;
    const relevant = crossing && tracker.crossingKey && crossing.handoff_id === tracker.crossingKey ? crossing : null;
    const transitionActive = dbg.controls && dbg.controls.portal_transition_phase && dbg.controls.portal_transition_phase !== "none";
    const stepCrossing = relevant || (crossing && !crossing.completed_at ? crossing : null);
    const stepDbg = stepCrossing === crossing ? dbg : { ...dbg, crossing: stepCrossing };
    let doneCount = 0;
    for (let i = 0; i < STEPS.length; i += 1) {
        const step = STEPS[i];
        const entry = rec.steps[i];
        if (!entry.done && step.done(stepDbg, tracker.capture)) {
            entry.done = true;
            entry.done_at = new Date().toISOString();
        }
        if (entry.done)
            doneCount += 1;
    }
    const declared = declaredEtaMs();
    rec.eta.destination_declared_ms = declared;
    rec.summary =
        `${doneCount}/${STEPS.length} background steps · elapsed ${(elapsedMs / 1000).toFixed(1)}s` +
            (declared != null ? ` · destination-declared estimate ${(declared / 1000).toFixed(1)}s` : "");
    rec.updated_at = new Date().toISOString();
    const completed = !!(relevant && relevant.completed_at);
    if (completed) {
        rec.crossing.completed_at = relevant.completed_at;
        const resumeMs = Number(relevant.controls_resume_ms);
        if (Number.isFinite(resumeMs))
            rec.transfer.controls_resume_ms = resumeMs;
    }
    const unwound = !transitionActive && !stepCrossing && tracker.crossingKey === "pending";
    setPanelLine(panelLineFor(doneCount, completed));
    if (completed && doneCount >= STEPS.length) {
        endTracking("complete", doneCount);
    }
    else if (unwound && elapsedMs >= UNWOUND_END_MS) {
        endTracking("unwound", doneCount);
    }
    else if (elapsedMs >= MAX_TRACK_MS) {
        endTracking(completed ? "complete" : "timeout", doneCount);
    }
}
function endTracking(status, doneCount) {
    const rec = tracker.record;
    tracker.active = false;
    if (tracker.crossingKey && tracker.crossingKey !== "pending") {
        tracker.lastCompletedKey = tracker.crossingKey;
    }
    tracker.crossingKey = null;
    if (tracker.refreshTimer) {
        clearInterval(tracker.refreshTimer);
        tracker.refreshTimer = null;
    }
    if (rec) {
        rec.status = status;
        rec.completed_at = new Date().toISOString();
        rec.updated_at = rec.completed_at;
    }
    setBodyLoadingAttr(status);
    if (tracker.logLine) {
        tracker.logLine(`runtime: through-portal loading record ${String(status).toUpperCase()} ` +
            `(${doneCount}/${STEPS.length} steps) — detail in the notification record; no center-screen card`);
    }
}
function buildNotificationRecord(dbg, destKey, base, key) {
    const nowIso = new Date().toISOString();
    const rec = {
        id: `runtime-loading-${tracker.sessionsCount}`,
        kind: "portal_through_loading",
        version_id: "runtime",
        presentation: "toast+notification (center-screen card removed by runtime)",
        severity: "info",
        created_at: nowIso,
        updated_at: nowIso,
        completed_at: null,
        status: "in_progress",
        title: "Entering destination…",
        summary: `0/${STEPS.length} background steps`,
        source: {
            endpoint_key: tracker.adapter ? tracker.adapter.activeEndpointKey || null : null,
            location_id: dbg && dbg.location_id ? dbg.location_id : null,
        },
        destination: {
            endpoint_key: destKey,
            location_id: `location-${destKey}`,
            world_title: null,
            tagline: null,
            instructions: null,
            base: base || null,
        },
        crossing: {
            handoff_id: key && key !== "pending" ? key : null,
            started_at: dbg && dbg.crossing && dbg.crossing.started_at ? dbg.crossing.started_at : null,
            completed_at: null,
        },
        transfer: { controls_resume_ms: null },
        steps: STEPS.map((s) => ({ id: s.id, label: s.label, done: false, done_at: null })),
        eta: { destination_declared_ms: null },
        pointers: {
            names_present: [],
            consent_key: METAVERSE_PORTAL_CONSENT_KEY,
            consent_granted: false,
        },
        toast: { shown: false, shown_at: null },
        honesty: {
            demonstration_only: true,
            standards_conformance: false,
            um_conformance_claim: false,
            center_screen_card: "removed",
        },
    };
    applyContentToRecord(rec);
    return rec;
}
function applyContentToRecord(rec) {
    const c = tracker.capture ? tracker.capture.content : null;
    const screen = contentValue("metaverse.portal.loadingScreen") || {};
    const brand = contentValue("metaverse.portal.loadingBranding") || {};
    const instr = contentValue("metaverse.portal.loadingInstructions") || {};
    rec.title = c
        ? String(screen.headline || (brand.world_title ? `Entering ${brand.world_title}` : "Entering destination…"))
        : "Entering destination…";
    rec.destination.world_title = brand.world_title ? String(brand.world_title) : rec.destination.world_title;
    rec.destination.tagline = brand.tagline ? String(brand.tagline) : rec.destination.tagline;
    rec.destination.location_id = brand.location_id ? String(brand.location_id) : rec.destination.location_id;
    rec.destination.instructions = Array.isArray(instr.instructions) ? instr.instructions.slice() : rec.destination.instructions;
    rec.eta.destination_declared_ms = declaredEtaMs();
    rec.pointers.names_present = c && c.pointers ? METAVERSE_PORTAL_POINTER_NAMES.filter((n) => c.pointers[n]) : [];
    rec.pointers.consent_granted = !!(c && c.consent && c.consent.granted);
    rec.updated_at = new Date().toISOString();
}
function contentValue(name) {
    const c = tracker.capture && tracker.capture.content;
    const entry = c && c.pointers ? c.pointers[name] : null;
    return entry && typeof entry === "object" ? entry.value || null : null;
}
function declaredEtaMs() {
    const v = contentValue("metaverse.portal.estimatedLoadTime");
    const ms = v && Number(v.estimated_load_ms);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}
function panelLineFor(doneCount, completed) {
    const c = tracker.capture && tracker.capture.content;
    const names = c && c.pointers ? METAVERSE_PORTAL_POINTER_NAMES.filter((n) => c.pointers[n]) : [];
    const consent = c && c.consent && c.consent.granted;
    const line = (tracker.active
        ? `tracking (${doneCount}/${STEPS.length} steps)`
        : completed
            ? "last crossing complete"
            : "armed") +
        ` · ${names.length} metaverse.portal.* pointers from ${tracker.capture ? tracker.capture.key.toUpperCase() : "?"}` +
        (consent ? ` · ${METAVERSE_PORTAL_CONSENT_KEY} granted (demo)` : "") +
        " · toast+notification (no center-screen card) · demonstration-only";
    tracker.lastStatusLine = line;
    return line;
}
function setPanelLine(text) {
    tracker.lastStatusLine = text;
    const el = $id("std-um-loading");
    if (el)
        el.textContent = text;
}
function setBodyLoadingAttr(value) {
    if (typeof document !== "undefined" && document.body) {
        document.body.setAttribute("data-runtime-loading", String(value));
    }
}
function escapeToastText(v) {
    return String(v).replace(/[<>&"]/g, "");
}
export function portalLoadingDriverApi() {
    return {
        descriptor: () => ({ ...PORTAL_LOADING_DEMO }),
        status: () => ({
            configured: tracker.configured,
            is_player: tracker.isPlayer,
            card_removed: true,
            presentation: "toast+notification-record",
            tracking_active: tracker.active,
            sessions_count: tracker.sessionsCount,
            toasts_shown: tracker.toastsShown,
            crossing_key: tracker.crossingKey,
            destination_key: tracker.capture ? tracker.capture.key : null,
            destination_content_present: !!(tracker.capture && tracker.capture.content),
            pointer_names_present: tracker.capture && tracker.capture.content && tracker.capture.content.pointers
                ? METAVERSE_PORTAL_POINTER_NAMES.filter((n) => tracker.capture.content.pointers[n])
                : [],
            consent_key: METAVERSE_PORTAL_CONSENT_KEY,
            consent_granted: !!(tracker.capture &&
                tracker.capture.content &&
                tracker.capture.content.consent &&
                tracker.capture.content.consent.granted),
            record: tracker.record ? JSON.parse(JSON.stringify(tracker.record)) : null,
            last_status_line: tracker.lastStatusLine,
            demonstration_only: true,
        }),
        steps: () => STEPS.map((s) => ({ id: s.id, label: s.label })),
    };
}
