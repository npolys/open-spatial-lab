Given the architecture page, WoWAPI appears to expose at least four top-level services:

* Open Spatial World API
* Open User Manifest API
* Open Spatial Asset API
* An aggregated/open entry point ("WoWAPI") tying them together [\[Proposed a...e \| WoWAPI\]](https://webofworlds.github.io/WoWAPI/)

For **full-coverage smoke testing**, I would not aim for exhaustive functional validation. Instead, I would verify that every public capability is reachable, authenticated correctly, returns structurally valid data, and can participate in the basic end-to-end workflow.

## 1. Service Availability

For each API:

* Health endpoint returns `200 OK`
* OpenAPI/Swagger definition is available
* Version endpoint returns expected version
* Base URL responds within performance threshold
* TLS certificate valid

Example:

```text
GET /health        -> 200
GET /version       -> 200 + semantic version
GET /openapi.json  -> 200 + valid schema
```

## 2. Authentication & Authorization

Test every supported auth mode:

* Anonymous request where permitted
* Authenticated request with valid token
* Expired token
* Malformed token
* User lacking required scope

Expected:

```text
Valid token       -> 200
Missing token     -> 401
Bad token         -> 401
Insufficient role -> 403
```

## 3. Contract Validation

For at least one representative endpoint per resource type:

* Required fields present
* Data types correct
* IDs non-empty
* Enumerations valid
* Pagination metadata present when applicable

These tests catch breaking API changes quickly.

## 4. CRUD Smoke Coverage

For every major resource:

### Create

```text
POST resource
→ 201 Created
→ returned ID exists
```

### Read

```text
GET resource/{id}
→ 200
→ matches created data
```

### Update

```text
PUT/PATCH resource/{id}
→ 200
→ change visible afterward
```

### Delete

```text
DELETE resource/{id}
→ 204 or expected status
```

### Verify Deletion

```text
GET resource/{id}
→ 404
```

## 5. Cross-Service Integration Tests

These are the highest-value smoke tests for the architecture shown. [\[Proposed a...e \| WoWAPI\]](https://webofworlds.github.io/WoWAPI/)

### World → Asset

1. Query a world.
2. Retrieve assets referenced by that world.
3. Verify every referenced asset can be fetched.

### User Manifest → World

1. Load user manifest.
2. Enumerate worlds/spaces available to user.
3. Open one of those worlds successfully.

### User Manifest → Asset

1. Find asset references in manifest.
2. Resolve each reference through Spatial Asset API.
3. Confirm metadata consistency.

## 6. Search & Discovery

If supported:

```text
Search worlds
Search assets
List user resources
```

Verify:

* Non-empty results
* Empty searches handled correctly
* Pagination functions

## 7. Error Handling

For each service:

```text
Unknown ID      -> 404
Bad request     -> 400
Unsupported verb-> 405
Server fault    -> structured error payload
```

Ensure errors follow the documented schema.

## 8. Data Consistency

Critical smoke checks:

* Referenced IDs exist.
* Foreign-key relationships resolve.
* Asset metadata matches world references.
* User manifests do not reference inaccessible resources.

## 9. Performance Smoke Tests

Not load testing, just sanity checks:

| Check                 | Target  |
| --------------------- | ------- |
| Health endpoint       | <200 ms |
| Simple GET            | <500 ms |
| Search request        | <2 sec  |
| Asset metadata lookup | <1 sec  |

Adjust thresholds to deployment expectations.

## 10. End-to-End "Golden Path"

If I were building a release gate, I'd have exactly one comprehensive workflow:

```text
Authenticate
→ Load user manifest
→ Enumerate accessible worlds
→ Open a world
→ Retrieve world metadata
→ Resolve referenced assets
→ Download/view one asset
→ Update user state (if supported)
→ Verify persistence
```

If that workflow succeeds and all service-level smoke checks pass, I'd consider the entire WoWAPI stack operational. [\[Proposed a...e \| WoWAPI\]](https://webofworlds.github.io/WoWAPI/)

### CI/CD Release Gate

A practical rule is:

* Every public endpoint: at least one successful smoke test.
* Every auth mode: at least one validation test.
* Every service-to-service dependency: at least one integration path.
* One complete end-to-end user journey.

That gives near-100% smoke-test coverage while keeping execution time under a few minutes.
