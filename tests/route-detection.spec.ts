import { describe, expect, it } from 'vitest'
import { extractAssetId, isAssetDetailPath } from '../src/lib/route-detection'

describe('route-detection', () => {
    it('extracts the asset id from a detail path', () => {
        expect(extractAssetId('/apps/media-archive/asset/abc-123')).toBe('abc-123')
    })

    it('returns null when the path is the grid', () => {
        expect(extractAssetId('/apps/media-archive')).toBeNull()
    })

    it('returns null when the path is on a different app', () => {
        expect(extractAssetId('/apps/memories')).toBeNull()
    })

    it('returns null when the path has trailing segments', () => {
        expect(extractAssetId('/apps/media-archive/asset/abc-123/extra')).toBeNull()
    })

    it('isAssetDetailPath mirrors extractAssetId', () => {
        expect(isAssetDetailPath('/apps/media-archive/asset/abc')).toBe(true)
        expect(isAssetDetailPath('/apps/media-archive')).toBe(false)
    })
})