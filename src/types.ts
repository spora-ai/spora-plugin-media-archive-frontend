/**
 * Wire shape for a single Media Archive row.
 *
 * Mirrors `spora-core/app/Services/MediaArchive/MediaArchiveService`'s
 * `MediaAsset` resource envelope (`data` wrapping the row). The host's
 * API client returns `{ data: T }`, so consumers unwrap once at the call
 * site (see `useMediaList`).
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

export interface MediaListEnvelope {
    data: MediaAsset[]
    meta: {
        current_page: number
        per_page: number
        total: number
        last_page: number
    }
}

export interface MediaListQuery {
    page?: number
    perPage?: number
    mediaType?: MediaType | ''
    pluginSlug?: string
    search?: string
}

export interface MediaDetailEnvelope {
    data: MediaAsset
}