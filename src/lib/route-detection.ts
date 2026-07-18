/**
 * Detect whether the current host route points to a media-archive asset
 * detail page, and extract the asset id if so.
 *
 * The plugin is mounted as a leaf under `/apps/media-archive`; the host
 * router does not register a child route for `asset/:id`. We let the URL
 * drive the render and parse the path ourselves — browser back/forward,
 * hard refresh, and URL sharing all just work because the path is the
 * source of truth.
 */
const ASSET_DETAIL_PATTERN = /^\/apps\/media-archive\/asset\/([^/]+)$/

export function extractAssetId(path: string): string | null {
    const match = path.match(ASSET_DETAIL_PATTERN)
    return match !== null && match[1] !== undefined && match[1] !== '' ? match[1] : null
}

export function isAssetDetailPath(path: string): boolean {
    return extractAssetId(path) !== null
}