/**
 * Wire shape for a single Media Archive row.
 *
 * Fields documented here are the ones the UI actually renders. The PHP
 * model carries a few additional columns (`tags`, `metadata`, etc.) that
 * the v1 panel exposes only in the detail drawer — see
 * `MediaDetailDrawer.vue`.
 */
export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'unknown'

export type StorageMode = 'local' | 'data_url' | 'external'

export interface MediaAsset {
    id: string
    media_type: MediaType
    mime_type: string | null
    byte_size: number | null
    width: number | null
    height: number | null
    duration_seconds: number | null
    prompt: string | null
    asset_url: string
    source_url: string | null
    storage_mode: StorageMode
    plugin_slug: string | null
    tool_name: string | null
    agent_id: string | null
    task_id: string | null
    tool_call_id: string | null
    created_at: string
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

export interface MediaListQuery {
    page?: number
    perPage?: number
    mediaType?: MediaType | ''
    pluginSlug?: string
    search?: string
}

export interface MediaDetailResponse {
    // The host's client unwraps `{ data: T }`, so a single-asset
    // detail fetch returns the asset directly, not the envelope.
    id: string
    media_type: MediaType
    mime_type: string | null
    byte_size: number | null
    width: number | null
    height: number | null
    duration_seconds: number | null
    prompt: string | null
    asset_url: string
    source_url: string | null
    storage_mode: StorageMode
    plugin_slug: string | null
    tool_name: string | null
    agent_id: string | null
    task_id: string | null
    tool_call_id: string | null
    created_at: string
}