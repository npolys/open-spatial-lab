// Deliberately a CLASSIC (non-module) script, loaded via a plain <script src> — NOT importable
// as an ES module. It must run synchronously during the browser's initial HTML parse and use
// document.write() so its output becomes part of the same parse stream as genuinely-static
// markup. This is not a style choice: confirmed empirically (see the x3dom-spikes/ investigation
// this session) that X3DOM's <Inline> node only reliably completes its first load when it exists
// in that initial parse stream — a node built via document.createElement()/appendChild() at any
// point after page load, in any ordering, never loads. A node that DID complete that first load
// can then have its `url` attribute reassigned freely and will reliably reload with new content.
//
// So every pool slot is seeded with a placeholder glTF (giving it that one required real load),
// and x3dom-render-adapter.mjs's createInlineAsset() claims a free slot and swaps its url to the
// real target instead of creating a node from scratch.
//
// Fixed at 32 for now — WoWAPI-side content packing (bundling multiple hosted items into fewer
// served files) is expected to keep concurrent-Inline-node demand well under this, so a
// host-capability-scaled pool isn't needed yet.
(function () {
    var X3DOM_INLINE_POOL_SIZE = window.__X3DOM_INLINE_POOL_SIZE_OVERRIDE || 32;
    var X3DOM_INLINE_POOL_PLACEHOLDER_URL = "/assets/equip-crown.glb";
    for (var i = 0; i < X3DOM_INLINE_POOL_SIZE; i += 1) {
        document.write("<transform>" +
            "<inline id=\"x3dom-inline-slot-" + i + "\" " +
            "nameSpaceName=\"x3dom-inline-slot-" + i + "-ns\" " +
            "url=\"" + X3DOM_INLINE_POOL_PLACEHOLDER_URL + "\" " +
            "data-x3dom-inline-pool-slot=\"free\" " +
            "data-x3dom-inline-pool-placeholder-url=\"" + X3DOM_INLINE_POOL_PLACEHOLDER_URL + "\"></inline>" +
            "</transform>");
    }
})();
