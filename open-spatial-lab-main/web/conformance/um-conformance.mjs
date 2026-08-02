export const UM_CONFORMANCE_LEVEL_LABEL = "v0.1-baseline (UM conformance runner)";
export const UM_CONFORMANCE = Object.freeze({
    standard: "Universal Manifest",
    conformance_level: UM_CONFORMANCE_LEVEL_LABEL,
    passes_runner_matrix: true,
    badge: "v0.1-baseline",
    matrix: "conformance/v0.1/expected.json (21 valid accepted, 11 invalid rejected)",
    runner: "universalmanifest/conformance/runner (determineConformanceLevel === v0.1-baseline)",
    evaluator_conformance: false,
    v04_baseline: false,
    full_conformance: false,
    claim: "Universal Manifest v0.1-baseline: passes the UM conformance runner's v0.1 accept/reject " +
        "matrix (the demo's own manifest + all v0.1 fixtures). NOT v0.4, NOT evaluator conformance, " +
        "NOT full conformance.",
});
export const UM_CONFORMANCE_LABEL = "um_conformance: v0.1-baseline ✓ (UM conformance runner; v0.1 accept/reject matrix) · " +
    "evaluator/v0.4:false · full UM conformance:false";
