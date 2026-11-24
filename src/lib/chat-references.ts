/**
 * The most ids one chat-reference request may carry.
 *
 * The endpoint answers a 422 for a larger batch, and a selection can be
 * larger than that: the grid paginates, and "select all" spans the pages
 * that are loaded.
 */
export const CHAT_REFERENCE_BATCH_SIZE = 64

/**
 * Split the ids into batches the endpoint accepts.
 *
 * The batches keep the order of the ids, so a caller can tell which
 * batch an answer belongs to.
 */
export function chunkChatReferenceIds(
    ids: string[],
    size: number = CHAT_REFERENCE_BATCH_SIZE,
): string[][] {
    const chunks: string[][] = []
    for (let offset = 0; offset < ids.length; offset += size) {
        chunks.push(ids.slice(offset, offset + size))
    }
    return chunks
}

/**
 * How many chats use one asset.
 *
 * The counts are per asset, and the detail page's warning is about the
 * one asset it shows — there the number of chats is what matters, not
 * the number of assets.
 */
export function countChatsUsingAsset(counts: Record<string, number> | null, id: string): number {
    if (counts === null) {
        return 0
    }

    return counts[id] ?? 0
}

/**
 * How many of a set of assets are used in chats.
 *
 * The counts arrive per asset id, and the warning the delete
 * confirmation shows is about the selection as a whole — "2 of the
 * selected assets are used in chats" — so the number of referenced
 * assets is what is counted here, not the number of chats.
 *
 * A `null` count map means the request is still in flight: the caller
 * has no answer yet, and a count from a previous selection must not be
 * shown against a new one.
 */
export function countAssetsUsedInChats(
    ids: string[],
    counts: Record<string, number> | null,
): number {
    if (counts === null) {
        return 0
    }

    let used = 0
    for (const id of ids) {
        if ((counts[id] ?? 0) > 0) {
            used++
        }
    }

    return used
}
