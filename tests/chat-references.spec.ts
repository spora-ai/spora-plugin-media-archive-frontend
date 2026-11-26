import { describe, expect, it } from 'vitest'
import { countAssetsUsedInChats } from '../src/lib/chat-references'

describe('countAssetsUsedInChats', () => {
    it('counts the assets the chats use', () => {
        expect(countAssetsUsedInChats(['a', 'b', 'c'], { a: 2, b: 0, c: 1 })).toBe(2)
    })

    it('counts nothing when no asset is used', () => {
        expect(countAssetsUsedInChats(['a', 'b'], { a: 0, b: 0 })).toBe(0)
    })

    it('counts an asset the server said nothing about as unused', () => {
        expect(countAssetsUsedInChats(['a', 'b'], { a: 3 })).toBe(1)
    })

    it('counts nothing while the counts are still in flight', () => {
        // `null` means the request has not answered yet: a count from a
        // previous selection must not be shown against a new one.
        expect(countAssetsUsedInChats(['a', 'b'], null)).toBe(0)
    })

    it('counts nothing for an empty selection', () => {
        expect(countAssetsUsedInChats([], { a: 3 })).toBe(0)
    })
})
