/**
 * Wire shape for a single Media Archive row.
 *
 * Fields documented here are the ones the UI actually renders. The PHP
 * model carries a few additional columns (`tags`, `metadata`, etc.) that
 * the v1 panel exposes only in the detail drawer — see
 * `MediaDetailDrawer.vue`.
 */
export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'unknown'

/**
 * Wire shape for a single derivative row returned inside
 * `MediaAsset.derivatives[]` (see `MediaAssetSerializer::serialize()`
 * in spora-core). The set of formats is open — `string` because a
 * Typst render emits `pdf` and an image converter emits
 * `png|jpeg|svg` while future producers can register anything they
 * like via `MediaDerivativeProducerDiscovery`.
 *
 * `media_id` is the new `media_assets.id` UUID the controller created
 * for the derivative; `asset_url` is its served path. The two are
 * distinct on purpose: a derivative might outlive the source bytes
 * (different storage backend, different CDN) and the URL is the
 * loadable handle.
 */
export interface MediaDerivative {
    format: string
    media_id: string
    asset_url: string
    producer_plugin: string | null
    producer_operation: string | null
    created_at: string | null
}

export type StorageMode = 'local' | 'data_url' | 'external'

export interface MediaAsset {
    id: string
    user_id?: number | null
    media_type: MediaType
    mime_type: string | null
    byte_size: number | null
    width: number | null
    height: number | null
    duration_seconds: number | null
    prompt: string | null
    filename: string | null
    /**
     * Extracted markdown body (populated by the upload pipeline for documents
     * — see `PdfToMarkdownConverter`, `PlainTextPassthroughConverter`). The
     * frontend renders it via `md-editor-v3`'s `<MdPreview>` for display and
     * `<MdEditor>` for inline editing; `null` means no extraction happened.
     *
     * The older `has_markdown` boolean is kept as a derived flag so older
     * clients that don't read the body still see the extraction indicator;
     * it stays in sync on the server side (`MediaAssetSerializer`).
     */
    markdown_content: string | null
    has_markdown?: boolean
    tags: string[] | null
    asset_url: string
    source_url: string | null
    storage_mode: StorageMode
    upload_source?: string | null
    public_access_token?: string | null
    public_url?: string | null
    plugin_slug: string | null
    tool_name: string | null
    agent_id: string | null
    task_id: string | null
    tool_call_id: string | null
    created_at: string
    /**
     * Pre-baked derivatives registered against this asset by any
     * `MediaDerivativeProducerInterface` implementation. The field is
     * always present (possibly empty) — `MediaAssetSerializer`'s
     * `$includeDerivatives` flag controls whether the controller can
     * opt out of the JOIN on tight listing loops. The frontend never
     * sets this itself; it reads what the server returned.
     */
    derivatives: MediaDerivative[]
}

/**
 * Wire shape for a row returned by `GET /api/v1/principals/me`. Mirrors
 * the host's `Principal` type but is scoped to what the Media Archive
 * plugin actually reads: the principal id (used as the filter value),
 * the type (so we can hide group chips for non-group principals), and
 * the linked `group_id` so we can resolve a friendly label from the
 * group list.
 */
export interface MediaPrincipal {
    id: number
    type: 'user' | 'group'
    user_id: number | null
    group_id: number | null
}

/**
 * Wire shape for a row returned by `GET /api/v1/groups`. The plugin
 * only needs the `id` and `name` to render a chip label; other fields
 * exist so the host's `GroupDetailResource` shape doesn't surprise a
 * future consumer.
 */
export interface MediaGroup {
    id: number
    name: string
    principal_id: number | null
}

/**
 * The host's `spora-frontend/src/api/client.ts` unwraps the standard
 * `{ data: T }` envelope — the plugin receives `T` directly, not
 * `{ data: T }`. The actual list payload (see
 * `spora-core/app/Http/MediaArchiveController::index()`) is:
 *   `{ assets, page, perPage, total, lastPage }`.
 *
 * The earlier `MediaListEnvelope` was a guess at the wire shape that
 * didn't match the unwrap. The client now expects the flat shape
 * with camelCase pagination fields.
 */
export interface MediaListResponse {
    assets: MediaAsset[]
    page: number
    perPage: number
    total: number
    lastPage: number
}

/**
 * What the user has picked in the dashboard-style scope chip row.
 *
 * - `null`     — `ALL`: send every visible principal id, so the
 *                caller sees their own uploads plus every group
 *                they belong to.
 * - `[userId]` — `My Media`: send the caller's user-principal id
 *                so direct uploads + their agents' media surface.
 * - `[groupId]`— `Group X`: send a single group-principal id.
 *
 * `[]` (empty) is intentionally NOT a valid state — the chip row
 * keeps the previously-selected principal so a transient empty
 * group list never zeroes the filter.
 */
export interface MediaListQuery {
    page?: number
    perPage?: number
    mediaType?: MediaType | ''
    pluginSlug?: string
    search?: string
    /**
     * Repeated `?principal_id=` filter. The Media Archive plugin
     * never sets this directly — it derives the value from
     * `selectedPrincipalId` in `App.vue` and lets the build of
     * `URLSearchParams` translate the single-pick state into the
     * repeated-key wire shape the controller intersects.
     */
    principalIds?: number[]
}