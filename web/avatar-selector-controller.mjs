export const AVATAR_STARTING_VARIANT_STORAGE_KEY = "wow-avatar-starting-variant-v1";
export function createAvatarSelectorController({ isPlayer, role, variants, inventorySlots, equipmentCatalog, validateEquippedItems, resolveEquipmentItems, noEquipmentChoice, applyNoEquipmentChoice, createPreviewLayer, getRuntime, lookup, documentTarget, requestFrame, cancelFrame, logger, escapeHtml, writeDebugText, fixed3, yawQuaternion, isTypingTarget, getSessionStorage = () => (typeof sessionStorage !== "undefined" ? sessionStorage : null), randomFn = Math.random, getLocationSearch = () => (typeof window !== "undefined" && window.location ? window.location.search : ""), }) {
    const variantKeys = Object.keys(variants);
    const body = documentTarget.body;
    const listeners = [];
    const state = {
        mounted: false,
        open: false,
        baselineVariant: null,
        baselineItems: [],
        pendingVariant: null,
        pendingItems: [],
        previewLayer: null,
        previewReady: false,
        previewShownVariant: null,
        previewDesiredVariant: null,
        previewLoading: false,
        previewLoadToken: 0,
        previewLoadError: null,
        previewRaf: 0,
        previewLastAt: 0,
        previewRotationY: 0,
        previewMotion: "walk",
        previewDragging: false,
        previewPointerId: null,
        previewLastX: 0,
        previousFocus: null,
        lastApplyResult: null,
        lastCancelResult: null,
    };
    const cloneItems = (items) => JSON.parse(JSON.stringify(Array.isArray(items) ? items : []));
    const selectedItemIds = (items = state.pendingItems) => cloneItems(items).map((item) => item.itemId).sort();
    const runtime = () => (typeof getRuntime === "function" ? getRuntime() : null);
    const liveAvatar = () => runtime()?.avatar || null;
    const queryAll = (selector) => typeof documentTarget.querySelectorAll === "function" ? [...documentTarget.querySelectorAll(selector)] : [];
    function listen(target, type, handler) {
        if (!target || typeof target.addEventListener !== "function")
            return;
        target.addEventListener(type, handler);
        listeners.push([target, type, handler]);
    }
    function currentVariantKey() {
        const key = liveAvatar()?.avatar_variant;
        return key && variants[key] ? key : variantKeys[0];
    }
    function enumerableVariantKeys() {
        const glb = variantKeys.filter((key) => variants[key] && variants[key].type === "glb");
        return glb.length ? glb : variantKeys.slice();
    }
    function currentSessionStorage() {
        try {
            return (typeof getSessionStorage === "function" ? getSessionStorage() : null) || null;
        }
        catch {
            return null;
        }
    }
    function readSavedStartingVariant(storage) {
        if (!storage)
            return null;
        try {
            const saved = storage.getItem(AVATAR_STARTING_VARIANT_STORAGE_KEY);
            return saved && variants[saved] ? saved : null;
        }
        catch {
            return null;
        }
    }
    function writeSavedStartingVariant(storage, variantKey) {
        if (!storage || !variantKey)
            return;
        try {
            storage.setItem(AVATAR_STARTING_VARIANT_STORAGE_KEY, variantKey);
        }
        catch {
        }
    }
    function pinnedStartingVariant() {
        try {
            const search = typeof getLocationSearch === "function" ? getLocationSearch() : "";
            const pinned = search ? new URLSearchParams(search).get("avatar_variant") : null;
            return pinned && variants[pinned] ? pinned : null;
        }
        catch {
            return null;
        }
    }
    function resolveStartingAvatarVariant() {
        const storage = currentSessionStorage();
        const pinned = pinnedStartingVariant();
        if (pinned) {
            writeSavedStartingVariant(storage, pinned);
            return { variant: pinned, source: "pinned" };
        }
        if (!storage)
            return null;
        const saved = readSavedStartingVariant(storage);
        if (saved)
            return { variant: saved, source: "saved" };
        const keys = enumerableVariantKeys();
        if (!keys.length)
            return null;
        const index = Math.min(keys.length - 1, Math.max(0, Math.floor(randomFn() * keys.length)));
        const variant = keys[index];
        writeSavedStartingVariant(storage, variant);
        return { variant, source: "random" };
    }
    function defaultPendingVariant(baseline) {
        const keys = enumerableVariantKeys();
        if (variants[baseline] && keys.includes(baseline))
            return baseline;
        return keys[0] || baseline;
    }
    function pendingVariantKey() {
        return variants[state.pendingVariant] ? state.pendingVariant : currentVariantKey();
    }
    function selectedVariant() {
        return variants[state.pendingVariant] || variants[currentVariantKey()];
    }
    function previewLayerLiveVariant() {
        const layer = state.previewLayer;
        if (!layer)
            return null;
        const fromStatus = layer.status && layer.status.avatar_variant;
        if (fromStatus && variants[fromStatus])
            return fromStatus;
        if (typeof layer.debugState === "function") {
            const fromDebug = layer.debugState().avatar_variant;
            if (fromDebug && variants[fromDebug])
                return fromDebug;
        }
        return null;
    }
    function previewVariantForRender() {
        const live = previewLayerLiveVariant();
        if (live)
            return variants[live];
        const shown = state.previewShownVariant;
        if (shown && variants[shown])
            return variants[shown];
        return variants[state.pendingVariant] || variants[currentVariantKey()];
    }
    function selectedVariantIndex() {
        return Math.max(0, enumerableVariantKeys().indexOf(state.pendingVariant));
    }
    function hasItem(itemId, attachmentPoint = null) {
        return state.pendingItems.some((item) => item.itemId === itemId && (!attachmentPoint || item.attachmentPoint === attachmentPoint));
    }
    function setSelectorStatus(message, ok = null) {
        const element = lookup("avatar-selector-status");
        if (!element)
            return;
        element.textContent = message || "—";
        element.style.color = ok === true ? "var(--ok)" : ok === false ? "var(--bad)" : "var(--ink-dim)";
    }
    function setRuntimeStatus(message) {
        const element = lookup("avatar-runtime-status");
        if (element)
            element.textContent = message;
    }
    function supportHtml(variant) {
        const unsupported = Array.isArray(variant.structured_unsupported) ? variant.structured_unsupported : [];
        const lines = [
            `load: ${variant.load_mode || "unknown"}`,
            `motion: ${variant.mocap_retarget || "unknown"}`,
            `equipment: ${variant.equipment_attachment || "unknown"}`,
        ];
        if (!unsupported.length)
            return escapeHtml(lines.join(" · "));
        return `${escapeHtml(lines.join(" · "))}<br><span class="warn">${unsupported.map(escapeHtml).join("<br>")}</span>`;
    }
    function applyPreviewCamera(layer) {
        if (!layer?.camera)
            return;
        layer.camera.position.set(0, 1.25, 3.35);
        layer.camera.lookAt(0, 0.88, 0);
        layer.camera.updateProjectionMatrix();
    }
    function previewAvatar() {
        const variant = previewVariantForRender();
        return {
            avatar_id: `selector-${variant.key}`,
            continuity_id: "avatar-selector-preview",
            display_name: variant.label,
            source_location: runtime()?.world?.location_id || "selector",
            position: [0, 0, 0],
            rotation_y: state.previewRotationY,
            orientation: yawQuaternion(state.previewRotationY),
            avatar_variant: variant.key,
            equippedItems: cloneItems(state.pendingItems),
            locomotion: {
                moving: state.previewMotion === "walk",
                movement_direction: state.previewMotion === "walk" ? "forward" : "none",
                facing_semantics: state.previewMotion === "walk" ? "preview walk" : "preview idle",
                grounded: true,
                jump_height_m: 0,
                portal_transition_phase: "none",
            },
            transition_visual: { visible: true, scale: 1, spin_y: 0 },
        };
    }
    function syncPreview() {
        if (!state.previewLayer)
            return;
        applyPreviewCamera(state.previewLayer);
        state.previewLayer.setAvatar(previewAvatar());
    }
    function updatePreviewText() {
        const variant = selectedVariant();
        const debug = typeof state.previewLayer?.debugState === "function" ? state.previewLayer.debugState() : null;
        writeDebugText("avatar-selector-preview-status", debug
            ? `${debug.current_animation_state || "loading"} · items ${debug.attached_item_count || 0}/${debug.expected_item_count || 0}`
            : "loading");
        writeDebugText("avatar-selector-preview-rotation", `${fixed3(state.previewRotationY)} rad`);
        const type = lookup("avatar-selector-avatar-type");
        if (type)
            type.textContent = `${variant.type || "avatar"} · ${variant.key}`;
    }
    function previewFrame(now) {
        if (!state.open) {
            state.previewRaf = 0;
            return;
        }
        const last = state.previewLastAt || now;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        state.previewLastAt = now;
        if (!state.previewDragging)
            state.previewRotationY += dt * 0.42;
        syncPreview();
        updatePreviewText();
        state.previewRaf = requestFrame(previewFrame);
    }
    function stopPreviewLoop() {
        if (state.previewRaf)
            cancelFrame(state.previewRaf);
        state.previewRaf = 0;
        state.previewLastAt = 0;
    }
    function startPreviewLoop() {
        stopPreviewLoop();
        state.previewRaf = requestFrame(previewFrame);
    }
    async function ensurePreviewLayer() {
        const mount = lookup("avatar-selector-preview-mount");
        if (!mount)
            return null;
        if (!state.previewLayer) {
            state.previewReady = false;
            state.previewLayer = createPreviewLayer(mount, role, runtime()?.world || null);
            await state.previewLayer.ready;
            state.previewReady = true;
            const layerVariant = typeof state.previewLayer.debugState === "function" ? state.previewLayer.debugState().avatar_variant : null;
            if (layerVariant && variants[layerVariant])
                state.previewShownVariant = layerVariant;
        }
        if (typeof state.previewLayer.resize === "function")
            state.previewLayer.resize();
        return state.previewLayer;
    }
    function previewSupportsLazyLoad() {
        return !!state.previewLayer && typeof state.previewLayer.switchAvatarVariant === "function";
    }
    function previewLoadErrorMessage(error) {
        if (!error)
            return "avatar load failed";
        return typeof error === "string" ? error : error.message || String(error);
    }
    function setPreviewBusy(busy, variantKey) {
        const preview = lookup("avatar-selector-preview");
        if (preview && typeof preview.setAttribute === "function") {
            preview.setAttribute("aria-busy", busy ? "true" : "false");
        }
        if (busy)
            writeDebugText("avatar-selector-preview-status", `loading ${variantKey || ""}`.trim());
    }
    async function requestPreviewVariant() {
        if (!state.previewLayer)
            return;
        const desired = pendingVariantKey();
        state.previewDesiredVariant = desired;
        if (!previewSupportsLazyLoad()) {
            state.previewShownVariant = desired;
            syncPreview();
            return;
        }
        if (desired === state.previewShownVariant && !state.previewLoading) {
            syncPreview();
            return;
        }
        state.previewLoadToken += 1;
        if (state.previewLoading)
            return;
        await drivePreviewLoad();
    }
    async function drivePreviewLoad() {
        const layer = state.previewLayer;
        if (!layer || typeof layer.switchAvatarVariant !== "function")
            return;
        state.previewLoading = true;
        try {
            while (state.open && state.previewDesiredVariant && state.previewDesiredVariant !== state.previewShownVariant) {
                const desired = state.previewDesiredVariant;
                const token = state.previewLoadToken;
                setPreviewBusy(true, desired);
                let result;
                try {
                    result = await layer.switchAvatarVariant(desired);
                }
                catch (error) {
                    result = { ok: false, error: previewLoadErrorMessage(error) };
                }
                if (!state.open)
                    break;
                if (token !== state.previewLoadToken)
                    continue;
                if (result && result.ok === false) {
                    state.previewLoadError = { variant: desired, message: previewLoadErrorMessage(result.error) };
                    setSelectorStatus(`avatar ${desired} failed to load: ${state.previewLoadError.message}`, false);
                    break;
                }
                state.previewShownVariant = desired;
                state.previewLoadError = null;
                syncPreview();
            }
        }
        finally {
            state.previewLoading = false;
            setPreviewBusy(false, state.previewShownVariant);
        }
    }
    function render() {
        const modal = lookup("avatar-selector-modal");
        if (!modal)
            return;
        const variant = selectedVariant();
        const index = selectedVariantIndex();
        body.setAttribute("data-avatar-selector-open", state.open ? "true" : "false");
        body.setAttribute("data-avatar-selector-pending-variant", variant.key);
        const enumerableKeys = enumerableVariantKeys();
        writeDebugText("avatar-selector-count", `${index + 1}/${enumerableKeys.length}`);
        writeDebugText("avatar-selector-avatar-name", variant.label || variant.key);
        const support = lookup("avatar-selector-support");
        if (support)
            support.innerHTML = supportHtml(variant);
        const avatarList = lookup("avatar-selector-avatar-list");
        if (avatarList) {
            avatarList.innerHTML = "";
            for (const key of enumerableKeys) {
                const entry = variants[key];
                const button = documentTarget.createElement("button");
                button.type = "button";
                button.className = `avatar-selector-chip${key === variant.key ? " active" : ""}`;
                button.dataset.avatarVariant = key;
                button.setAttribute("data-testid", `avatar-selector-avatar-${key}`);
                button.textContent = key;
                button.title = entry.label || key;
                button.addEventListener("click", () => pickAvatar(key));
                avatarList.appendChild(button);
            }
        }
        const groups = lookup("avatar-selector-equipment-groups");
        if (groups) {
            groups.innerHTML = "";
            const none = documentTarget.createElement("button");
            none.type = "button";
            none.className = `avatar-selector-none-choice${state.pendingItems.length === 0 ? " active" : ""}`;
            none.dataset.equipmentChoice = noEquipmentChoice.value;
            none.setAttribute("data-testid", "avatar-selector-equipment-none");
            none.setAttribute("aria-label", noEquipmentChoice.ariaLabel);
            none.setAttribute("aria-pressed", String(state.pendingItems.length === 0));
            none.innerHTML =
                `<strong>${escapeHtml(noEquipmentChoice.label)}</strong>` +
                    `<span>${escapeHtml(noEquipmentChoice.description)}</span>`;
            none.addEventListener("click", removeAllEquipment);
            groups.appendChild(none);
            for (const group of inventorySlots()) {
                const label = documentTarget.createElement("div");
                label.className = "avatar-selector-slot-label";
                label.textContent = group.label;
                groups.appendChild(label);
                const options = documentTarget.createElement("div");
                options.className = "avatar-selector-options";
                options.dataset.slot = group.slot;
                for (const option of group.options) {
                    const button = documentTarget.createElement("button");
                    button.type = "button";
                    button.className = `avatar-selector-chip${hasItem(option.itemId, group.slot) ? " active" : ""}`;
                    button.dataset.slotPoint = group.slot;
                    button.dataset.slotItem = option.itemId;
                    button.setAttribute("data-testid", `avatar-selector-item-${group.slot}-${option.itemId}`);
                    button.textContent = option.itemId.replace(/^equip-/, "");
                    button.title = `${option.label} (${option.mode} @ ${group.slot})`;
                    button.addEventListener("click", () => pickSlotItem(group.slot, option.itemId));
                    options.appendChild(button);
                }
                groups.appendChild(options);
            }
        }
        const extras = lookup("avatar-selector-extra-items");
        if (extras) {
            extras.innerHTML = "";
            for (const item of equipmentCatalog()) {
                const button = documentTarget.createElement("button");
                button.type = "button";
                button.className = `avatar-selector-chip${hasItem(item.itemId) ? " active" : ""}`;
                button.dataset.extraItem = item.itemId;
                button.setAttribute("data-testid", `avatar-selector-extra-${item.itemId}`);
                button.textContent = item.itemId.replace(/^hero-/, "").replace(/-/g, " ");
                button.title = `${item.label} (${item.mode} @ ${item.attachmentPoint})`;
                button.addEventListener("click", () => toggleExtraItem(item.itemId));
                extras.appendChild(button);
            }
        }
        for (const button of queryAll("[data-preview-motion]")) {
            button.setAttribute("aria-pressed", String(button.dataset.previewMotion === state.previewMotion));
        }
        updatePreviewText();
    }
    function pickAvatar(variantKey) {
        if (!variants[variantKey])
            return debug();
        state.pendingVariant = variantKey;
        setSelectorStatus(`staged avatar ${variantKey}`, null);
        render();
        void requestPreviewVariant();
        return debug();
    }
    function step(delta) {
        const keys = enumerableVariantKeys();
        if (!keys.length)
            return debug();
        const currentIndex = keys.indexOf(state.pendingVariant);
        const base = currentIndex < 0 ? 0 : currentIndex;
        const next = (base + delta + keys.length) % keys.length;
        return pickAvatar(keys[next]);
    }
    function pickSlotItem(slot, itemId) {
        const group = inventorySlots().find((entry) => entry.slot === slot);
        const option = group?.options.find((entry) => entry.itemId === itemId);
        if (!option) {
            setSelectorStatus(`unknown equipment ${slot}/${itemId}`, false);
            return debug();
        }
        state.pendingItems = state.pendingItems
            .filter((item) => item.attachmentPoint !== slot)
            .concat([cloneItems([option])[0]]);
        setSelectorStatus(`staged ${slot} ${itemId}`, null);
        render();
        syncPreview();
        return debug();
    }
    function removeAllEquipment() {
        state.pendingItems = applyNoEquipmentChoice(state.pendingItems);
        setSelectorStatus("staged clean avatar · no equipment", true);
        render();
        syncPreview();
        return debug();
    }
    function toggleExtraItem(itemId) {
        const item = equipmentCatalog().find((entry) => entry.itemId === itemId);
        if (!item) {
            setSelectorStatus(`unknown gear ${itemId}`, false);
            return debug();
        }
        if (hasItem(itemId)) {
            state.pendingItems = state.pendingItems.filter((entry) => entry.itemId !== itemId);
            setSelectorStatus(`removed staged ${itemId}`, null);
        }
        else {
            state.pendingItems = state.pendingItems.concat(cloneItems([item]));
            setSelectorStatus(`staged ${itemId}`, null);
        }
        render();
        syncPreview();
        return debug();
    }
    function setMotion(mode) {
        state.previewMotion = mode === "idle" ? "idle" : "walk";
        render();
        syncPreview();
        return debug();
    }
    function close(reason = "cancel") {
        const modal = lookup("avatar-selector-modal");
        if (modal)
            modal.hidden = true;
        state.open = false;
        state.previewDragging = false;
        state.previewPointerId = null;
        state.previewLoading = false;
        state.previewDesiredVariant = null;
        setPreviewBusy(false, state.previewShownVariant);
        body.setAttribute("data-avatar-selector-open", "false");
        stopPreviewLoop();
        if (state.previewLayer)
            state.previewLayer.setAvatar(null);
        const switchButton = lookup("btn-switch-avatar");
        if (switchButton)
            switchButton.setAttribute("aria-expanded", "false");
        if (reason !== "apply" && reason !== "dispose")
            setRuntimeStatus("selector canceled");
        if (state.previousFocus && typeof state.previousFocus.focus === "function")
            state.previousFocus.focus();
        return debug();
    }
    function cancel() {
        state.lastCancelResult = {
            ok: true,
            baseline_variant: state.baselineVariant,
            baseline_item_ids: selectedItemIds(state.baselineItems),
            discarded_variant: state.pendingVariant,
            discarded_item_ids: selectedItemIds(),
        };
        close("cancel");
        return state.lastCancelResult;
    }
    async function apply() {
        const host = runtime();
        const avatar = host?.avatar;
        if (!isPlayer || !avatar) {
            setSelectorStatus("no embodied avatar to update", false);
            return { ok: false, error: "no embodied avatar" };
        }
        const validation = validateEquippedItems(state.pendingItems);
        if (!validation.ok) {
            const error = `equipment rejected: ${validation.errors.join("; ")}`;
            setSelectorStatus(error, false);
            return { ok: false, error };
        }
        const variant = state.pendingVariant;
        let avatarResult = { ok: true, variant };
        if (variant && variant !== avatar.avatar_variant) {
            avatarResult = host.setAvatarVariant(variant);
            if (!avatarResult.ok) {
                setSelectorStatus(`avatar failed: ${avatarResult.error}`, false);
                return avatarResult;
            }
        }
        const nextItems = cloneItems(state.pendingItems);
        await host.applyEquipment(nextItems, resolveEquipmentItems);
        const result = {
            ok: true,
            variant,
            avatar_result: avatarResult,
            equipped_count: nextItems.length,
            item_ids: selectedItemIds(nextItems),
        };
        state.lastApplyResult = result;
        writeSavedStartingVariant(currentSessionStorage(), variant);
        setRuntimeStatus(`applied ${variant} · ${nextItems.length} items`);
        logger(`selector: applied avatar ${variant}; items=${nextItems.length}`);
        close("apply");
        return result;
    }
    async function open() {
        const modal = lookup("avatar-selector-modal");
        if (!modal || !isPlayer)
            return debug();
        const avatar = liveAvatar();
        if (!avatar) {
            setRuntimeStatus("selector unavailable during crossing");
            return debug();
        }
        if (!state.open)
            state.previousFocus = documentTarget.activeElement;
        state.open = true;
        state.baselineVariant = currentVariantKey();
        state.baselineItems = cloneItems(avatar.equippedItems);
        state.pendingVariant = defaultPendingVariant(state.baselineVariant);
        state.pendingItems = cloneItems(avatar.equippedItems);
        state.previewRotationY = Number(avatar.rotation_y) || 0;
        state.previewMotion = "walk";
        state.lastApplyResult = null;
        state.lastCancelResult = null;
        state.previewLoadError = null;
        state.previewDesiredVariant = state.pendingVariant;
        modal.hidden = false;
        const switchButton = lookup("btn-switch-avatar");
        if (switchButton)
            switchButton.setAttribute("aria-expanded", "true");
        setSelectorStatus("selection staged", null);
        render();
        await ensurePreviewLayer();
        await requestPreviewVariant();
        startPreviewLoop();
        lookup("avatar-selector-preview")?.focus();
        return debug();
    }
    async function setSlotItem(slot, itemId) {
        const host = runtime();
        const avatar = host?.avatar;
        if (!avatar)
            return { ok: false, error: "no embodied avatar (crossing in flight?)" };
        const slots = inventorySlots();
        const group = slots.find((entry) => entry.slot === slot);
        const option = group?.options.find((entry) => entry.itemId === itemId);
        if (!option) {
            return {
                ok: false,
                error: `unknown inventory pick '${slot}/${itemId}' (slots: ${slots.map((entry) => entry.slot).join(", ")})`,
            };
        }
        const current = Array.isArray(avatar.equippedItems) ? avatar.equippedItems : [];
        if (current.some((item) => item.itemId === option.itemId && item.attachmentPoint === slot)) {
            return { ok: true, unchanged: true, slot, itemId };
        }
        const next = current.filter((item) => item.attachmentPoint !== slot).concat(cloneItems([option]));
        const validation = validateEquippedItems(next);
        if (!validation.ok) {
            return { ok: false, error: `inventory swap rejected by schema: ${validation.errors.join("; ")}` };
        }
        await host.applyEquipment(next, resolveEquipmentItems);
        return { ok: true, slot, itemId, mode: option.mode, equipped_count: next.length };
    }
    function updateInventorySelection(debugState) {
        if (!isPlayer)
            return;
        const card = lookup("inventory-card");
        if (!card || card.hidden)
            return;
        const avatar = debugState?.avatar || null;
        const variant = avatar?.avatar_variant || null;
        for (const button of card.querySelectorAll("[data-avatar-variant]")) {
            button.classList.toggle("active", !!variant && button.dataset.avatarVariant === variant);
        }
        const items = Array.isArray(avatar?.equippedItems) ? avatar.equippedItems : [];
        for (const button of card.querySelectorAll("[data-slot-item]")) {
            button.classList.toggle("active", items.some((item) => item.itemId === button.dataset.slotItem && item.attachmentPoint === button.dataset.slotPoint));
        }
    }
    function debug() {
        const modal = lookup("avatar-selector-modal");
        const preview = typeof state.previewLayer?.debugState === "function" ? state.previewLayer.debugState() : null;
        const avatar = liveAvatar();
        const variant = selectedVariant();
        return {
            open: !!(modal && !modal.hidden && state.open),
            baseline_variant: state.baselineVariant,
            pending_variant: state.pendingVariant,
            live_variant: avatar?.avatar_variant || null,
            baseline_item_ids: selectedItemIds(state.baselineItems),
            pending_item_ids: selectedItemIds(),
            live_item_ids: Array.isArray(avatar?.equippedItems) ? selectedItemIds(avatar.equippedItems) : [],
            preview_ready: state.previewReady,
            preview_rotation_y: Number(state.previewRotationY.toFixed(4)),
            preview_motion: state.previewMotion,
            preview_animation_state: preview?.current_animation_state || null,
            preview_attached_item_count: preview?.attached_item_count ?? null,
            preview_expected_item_count: preview?.expected_item_count ?? null,
            support_status: variant
                ? {
                    type: variant.type,
                    load_mode: variant.load_mode,
                    mocap_retarget: variant.mocap_retarget,
                    equipment_attachment: variant.equipment_attachment,
                    structured_unsupported: variant.structured_unsupported || [],
                }
                : null,
            last_apply_result: state.lastApplyResult,
            last_cancel_result: state.lastCancelResult,
            mounted: state.mounted,
            listener_count: listeners.length,
            preview_raf_active: state.previewRaf !== 0,
            selectable_variant_keys: enumerableVariantKeys(),
            hidden_variant_count: variantKeys.length - enumerableVariantKeys().length,
            preview_shown_variant: state.previewShownVariant,
            preview_loading: state.previewLoading === true,
            preview_load_error: state.previewLoadError,
        };
    }
    function mount() {
        if (state.mounted)
            return controller;
        state.mounted = true;
        const modal = lookup("avatar-selector-modal");
        if (modal)
            modal.dataset.selectorWired = "1";
        body.setAttribute("data-avatar-selector-open", "false");
        listen(lookup("btn-avatar-selector-prev"), "click", () => step(-1));
        listen(lookup("btn-avatar-selector-next"), "click", () => step(1));
        listen(lookup("btn-avatar-selector-close"), "click", cancel);
        listen(lookup("btn-avatar-selector-cancel"), "click", cancel);
        listen(lookup("btn-avatar-selector-apply"), "click", () => void apply());
        for (const button of queryAll("[data-preview-motion]")) {
            listen(button, "click", () => setMotion(button.dataset.previewMotion));
        }
        const preview = lookup("avatar-selector-preview");
        listen(preview, "pointerdown", (event) => {
            if (event.target?.closest?.("button"))
                return;
            state.previewDragging = true;
            state.previewPointerId = event.pointerId;
            state.previewLastX = event.clientX;
            preview.setPointerCapture(event.pointerId);
        });
        listen(preview, "pointermove", (event) => {
            if (!state.previewDragging || event.pointerId !== state.previewPointerId)
                return;
            const dx = event.clientX - state.previewLastX;
            state.previewLastX = event.clientX;
            state.previewRotationY += dx * 0.012;
            syncPreview();
            updatePreviewText();
        });
        const finishDrag = (event) => {
            if (event.pointerId !== state.previewPointerId)
                return;
            state.previewDragging = false;
            state.previewPointerId = null;
        };
        listen(preview, "pointerup", finishDrag);
        listen(preview, "pointercancel", finishDrag);
        listen(documentTarget, "keydown", (event) => {
            if (!state.open || isTypingTarget(event.target))
                return;
            if (event.key === "Escape") {
                event.preventDefault();
                cancel();
            }
            else if (event.key === "ArrowLeft") {
                event.preventDefault();
                step(-1);
            }
            else if (event.key === "ArrowRight") {
                event.preventDefault();
                step(1);
            }
        });
        const switchButton = lookup("btn-switch-avatar");
        const equipButton = lookup("btn-equip-item");
        if (switchButton && equipButton && isPlayer) {
            switchButton.hidden = false;
            switchButton.setAttribute("aria-haspopup", "dialog");
            switchButton.setAttribute("aria-expanded", "false");
            equipButton.hidden = true;
            listen(switchButton, "click", async () => {
                setRuntimeStatus("selector open");
                await open();
                logger("selector: opened avatar/equipment modal");
            });
        }
        const inventoryCard = lookup("inventory-card");
        if (inventoryCard)
            inventoryCard.hidden = true;
        if (isPlayer) {
            const resolved = resolveStartingAvatarVariant();
            const host = runtime();
            const avatar = host && host.avatar;
            if (resolved &&
                host &&
                avatar &&
                typeof host.setAvatarVariant === "function" &&
                avatar.avatar_variant !== resolved.variant) {
                host.setAvatarVariant(resolved.variant);
                logger(`selector: session start -> avatar '${resolved.variant}' (${resolved.source})`);
            }
        }
        return controller;
    }
    function dispose() {
        if (state.open)
            close("dispose");
        else
            stopPreviewLoop();
        for (const [target, type, handler] of listeners.splice(0))
            target.removeEventListener(type, handler);
        if (state.previewLayer) {
            state.previewLayer.setAvatar(null);
            if (typeof state.previewLayer.dispose === "function")
                state.previewLayer.dispose();
            state.previewLayer = null;
        }
        state.previewReady = false;
        state.previewShownVariant = null;
        state.previewDesiredVariant = null;
        state.previewLoading = false;
        state.previewLoadError = null;
        state.previewDragging = false;
        state.previewPointerId = null;
        state.previousFocus = null;
        state.mounted = false;
        const modal = lookup("avatar-selector-modal");
        if (modal)
            delete modal.dataset.selectorWired;
        for (const id of ["avatar-selector-avatar-list", "avatar-selector-equipment-groups", "avatar-selector-extra-items"]) {
            const element = lookup(id);
            if (element)
                element.innerHTML = "";
        }
        body.removeAttribute("data-avatar-selector-open");
        body.removeAttribute("data-avatar-selector-pending-variant");
        return controller;
    }
    const selectorDriver = () => ({
        open,
        cancel,
        apply,
        next: () => step(1),
        previous: () => step(-1),
        pickAvatar,
        pickSlotItem,
        toggleExtraItem,
        removeAllEquipment,
        setMotion,
        state: debug,
    });
    const inventoryDriver = () => ({
        slots: () => inventorySlots(),
        setSlotItem,
        pickAvatar: (variant) => runtime()?.setAvatarVariant(variant),
        avatarVariants: () => variantKeys.slice(),
        setPreferredHeight: (height) => runtime()?.setPreferredHeight(height),
    });
    const controller = {
        mount,
        open,
        close,
        apply,
        cancel,
        debug,
        dispose,
        next: () => step(1),
        previous: () => step(-1),
        pickAvatar,
        pickSlotItem,
        toggleExtraItem,
        removeAllEquipment,
        setMotion,
        setSlotItem,
        updateInventorySelection,
        selectorDriver,
        inventoryDriver,
    };
    return controller;
}
