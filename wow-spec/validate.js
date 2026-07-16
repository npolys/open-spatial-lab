'use strict';
const path = require('path');
const SCHEMA_JSON_PATH = path.join(__dirname, 'generated', 'schema.json');
const RESPONSE_SCHEMA_BY_KIND = {
    world: 'OSLWorldResponse', World: 'OSLWorldResponse',
    user: 'OSLUserResponse', User: 'OSLUserResponse',
    view: 'OSLViewResponse', View: 'OSLViewResponse',
    portal: 'OSLPortalResponse', Portal: 'OSLPortalResponse',
    node: 'OSLFlatNode', Node: 'OSLFlatNode',
};
const CANONICAL_SCHEMA_BY_KIND = {
    world: 'World', World: 'World',
    user: 'User', User: 'User',
    view: 'View', View: 'View',
    portal: 'Portal', Portal: 'Portal',
    node: 'Node', Node: 'Node',
};
const BUNDLE_ID = 'osl-wow-spec';
function loadDoc() {
    try {
        return require(SCHEMA_JSON_PATH);
    }
    catch (e) {
        throw new Error('wow-spec/generated/schema.json not found — run `npm run wow-schema-json` first. ('
            + e.message + ')');
    }
}
function createValidator(opts) {
    opts = opts || {};
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    const doc = opts.doc || loadDoc();
    if (!doc.components || !doc.components.schemas)
        throw new Error('wow-spec schema.json missing components.schemas');
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ $id: BUNDLE_ID, components: { schemas: doc.components.schemas } });
    const cache = new Map();
    function getValidate(schemaName) {
        if (cache.has(schemaName))
            return cache.get(schemaName);
        if (!doc.components.schemas[schemaName])
            throw new Error('unknown wow-spec schema: ' + schemaName);
        const v = ajv.compile({ $ref: BUNDLE_ID + '#/components/schemas/' + schemaName });
        cache.set(schemaName, v);
        return v;
    }
    function result(schemaName, validateFn, data) {
        const valid = validateFn(data);
        return {
            valid: !!valid,
            schema: schemaName,
            errors: valid ? null : validateFn.errors,
            errorsText: valid ? null : ajv.errorsText(validateFn.errors, { separator: '; ' }),
        };
    }
    function validate(schemaName, data) {
        return result(schemaName, getValidate(schemaName), data);
    }
    function validateResponse(kind, data) {
        return validate(RESPONSE_SCHEMA_BY_KIND[kind] || kind, data);
    }
    function validateCanonical(kind, data) {
        return validate(CANONICAL_SCHEMA_BY_KIND[kind] || kind, data);
    }
    const arrayCache = new Map();
    function validateRequest(schemaName, data) {
        const m = /^(.+?)(?:\[\]|Array)$/.exec(schemaName);
        if (m) {
            const itemSchema = m[1];
            if (!doc.components.schemas[itemSchema])
                throw new Error('unknown wow-spec schema: ' + itemSchema);
            const key = itemSchema + '[]';
            if (!arrayCache.has(key))
                arrayCache.set(key, ajv.compile({
                    type: 'array',
                    items: { $ref: BUNDLE_ID + '#/components/schemas/' + itemSchema },
                }));
            return result(key, arrayCache.get(key), data);
        }
        return validate(schemaName, data);
    }
    return {
        ajv,
        doc,
        schemaNames: Object.keys(doc.components.schemas),
        validate,
        validateResponse,
        validateCanonical,
        validateRequest,
        RESPONSE_SCHEMA_BY_KIND,
        CANONICAL_SCHEMA_BY_KIND,
    };
}
let shared = null;
function getValidator() {
    if (!shared)
        shared = createValidator();
    return shared;
}
module.exports = {
    createValidator,
    getValidator,
    RESPONSE_SCHEMA_BY_KIND,
    CANONICAL_SCHEMA_BY_KIND,
    SCHEMA_JSON_PATH,
};
