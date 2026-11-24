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
