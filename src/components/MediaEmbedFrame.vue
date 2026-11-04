<script setup lang="ts">
/**
 * MediaEmbedFrame — renders a script-capable media asset as live content.
 *
 * The preview an operator sees for an HTML or SVG asset. It is a real
 * `<iframe>` element rather than markup injected into the page: an HTML
 * document rendered into the page's own DOM would run in the page's
 * origin, and no amount of escaping changes that.
 *
 * The isolation is the browser's, not this component's:
 *
 *  - The response the iframe loads carries `Content-Security-Policy:
 *    sandbox` (plus `allow-scripts` when the operator permitted scripts).
 *    The header is the ceiling: the browser takes the *union* of the
 *    response's forced sandboxing flags and the frame's own `sandbox`
 *    attribute, so the attribute can only narrow what the header allows,
 *    never widen it. The attribute here mirrors the header, so the two
 *    agree.
 *  - Without `allow-same-origin` the framed document gets an opaque origin:
 *    it cannot read `document.cookie`, cannot reach `localStorage`, and
 *    cannot touch the parent document.
 *  - Spora sends no CORS headers, so the framed document's own requests
 *    have unreadable responses, and every write needs an `X-CSRF-Token`
 *    the framed document cannot obtain.
 *
 * The height is fixed rather than measured: measuring would need
 * cross-origin access to the framed document's DOM, which the sandbox
 * denies — that denial is the feature working, not a limitation to route
 * around.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
    /** The embed route for the asset. */
    url: string
    /** The asset's MIME type, used for the frame's title when there is no label. */
    mime: string
    /** Whether the operator permitted the embedded scripts to run. */
    scripts: boolean
    /** A human-readable name for the content, used for the frame's title. */
    label?: string
}>()

const { t } = useI18n()

/**
 * The `sandbox` attribute value.
 *
 * `allow-scripts` only when the server said scripts may run.
 * `allow-same-origin` is never present — with it, a same-origin framed
 * document could remove its own sandbox attribute.
 */
const sandbox = computed<string>(() => (props.scripts ? 'allow-scripts' : ''))

const frameTitle = computed<string>(() =>
    props.label ? t('Embedded {label}', { label: props.label }) : t('Embedded {mime}', { mime: props.mime })
)
</script>

<template>
    <div
        class="w-full overflow-hidden rounded border border-border bg-background"
        data-testid="media-embed-frame"
    >
        <iframe
            :src="url"
            :sandbox="sandbox"
            :title="frameTitle"
            referrerpolicy="no-referrer"
            class="h-[40vh] min-h-[220px] w-full border-0 bg-white lg:h-[70vh]"
            loading="lazy"
            data-testid="media-embed-iframe"
        />
        <p
            v-if="scripts"
            class="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground"
            data-testid="media-embed-script-note"
        >
            {{ t('This embedded content runs its own scripts, sandboxed away from your session.') }}
        </p>
    </div>
</template>
