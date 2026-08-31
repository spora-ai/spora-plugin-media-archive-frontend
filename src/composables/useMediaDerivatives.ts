/**
 * useMediaDerivatives — thin wrapper over the two core derivative
 * endpoints that the Media Archive plugin's `VersionsStrip.vue` (and
 * any future derivative-aware UI) consumes. Keeping the wrapper
 * centralised avoids forking the URL format between callers and makes
 * the producer-discovery protocol easy to swap should the backend
 * shape evolve (e.g. `?format=` filters or streaming responses).
 *
 * Endpoints (owned by `MediaDerivativeController` /
 * `MediaDerivativeOptionsController` in spora-core, generic —
 * `spora-plugin-typst` and any future derivative producer can emit
 * responses the same shape):
 *  - `GET /media/{id}/derivatives/options` →
 *    `{ format: string, label: string, available: boolean }[]`
 *  - `POST /media/{id}/derivatives` body `{ format, options }` →
 *    `{ data: { derivative: MediaAsset } }` (host envelope, unwrapped
 *    to `MediaAsset` by the host client).
 *
 * Plugin code never imports a host composable; it goes through
 * `hostContext.api` so the dependency surface stays auditable.
 */
import type { ComputedRef } from 'vue'
import type { MediaAsset } from '../types'
import type { PluginHostContext } from '../shims'

export interface DerivativeOption {
    /** Format the producer emits (`pdf`, `png`, `jpeg`, `svg`, …). */
    format: string
    /** Human-friendly label rendered in the dropdown. */
    label: string
    /**
     * `true` iff at least one registered producer accepts the
     * parent's source MIME/extension and supports this format. The
     * strip renders unavailable options as disabled chips so the
     * operator can see what *would* be possible with a different
     * source asset.
     */
    available: boolean
}

export function useMediaDerivatives(
    host: PluginHostContext,
    mediaId: ComputedRef<string>,
) {
    /**
     * @returns The union of every registered producer's
     * `supportedDerivativeFormats()`, each flagged with whether the
     * parent's current source format can drive it.
     */
    async function options(): Promise<DerivativeOption[]> {
        const data = await host.api.get<DerivativeOption[]>(
            `/media/${mediaId.value}/derivatives/options`,
        )
        return Array.isArray(data) ? data : []
    }

    /**
     * Request a fresh derivative render. Re-rendering the same
     * `(parent, format, producer_plugin, producer_operation)` tuple
     * is idempotent at the controller — the response carries the
     * existing derivative id, not a fresh row.
     */
    async function produce(
        format: string,
        opts: Record<string, unknown> = {},
    ): Promise<MediaAsset> {
        const res = await host.api.post<{ derivative: MediaAsset }>(
            `/media/${mediaId.value}/derivatives`,
            { format, options: opts },
        )
        return res.derivative
    }

    return { options, produce }
}
