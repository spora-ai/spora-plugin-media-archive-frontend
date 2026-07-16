import { describe, expect, it } from 'vitest'
import { createMockApi, filterFixture, FIXTURE, paginate, parseListQuery } from '../src/dev-mock'
import type { MediaAsset, MediaListResponse } from '../src/types'

describe('parseListQuery', () => {
    it('returns defaults when path has no query string', () => {
        expect(parseListQuery('/media')).toEqual({
            type: '',
            plugin: '',
            search: '',
            scope: 'all',
            page: 1,
            perPage: 24,
        })
    })

    it('extracts each supported param', () => {
        expect(parseListQuery('/media?type=audio&plugin=minimax&search=hello&page=2&per_page=5')).toEqual({
            type: 'audio',
            plugin: 'minimax',
            search: 'hello',
            scope: 'all',
            page: 2,
            perPage: 5,
        })
    })

    it('parses scope=mine and defaults to all', () => {
        expect(parseListQuery('/media?scope=mine').scope).toBe('mine')
        expect(parseListQuery('/media?scope=other').scope).toBe('all')
        expect(parseListQuery('/media').scope).toBe('all')
    })

    it('lowercases and trims the search term', () => {
        expect(parseListQuery('/media?search=  Hello  ').search).toBe('hello')
    })

    it('clamps page and per_page to a minimum of 1', () => {
        expect(parseListQuery('/media?page=0').page).toBe(1)
        expect(parseListQuery('/media?page=-3').page).toBe(1)
        expect(parseListQuery('/media?per_page=0').perPage).toBe(1)
        expect(parseListQuery('/media?per_page=abc').perPage).toBe(1)
    })

    it('ignores the path prefix and only parses the query string', () => {
        expect(parseListQuery('/v1/media?type=video').type).toBe('video')
    })
})

describe('filterFixture', () => {
    const corpus: MediaAsset[] = FIXTURE

    it('returns the full fixture when no filters are set', () => {
        expect(filterFixture({ type: '', plugin: '', search: '', scope: 'all', page: 1, perPage: 24 }, corpus)).toHaveLength(corpus.length)
    })

    it('filters by media_type', () => {
        const result = filterFixture({ type: 'image', plugin: '', search: '', scope: 'all', page: 1, perPage: 24 }, corpus)
        expect(result.length).toBeGreaterThan(0)
        expect(result.every((a) => a.media_type === 'image')).toBe(true)
    })

    it('filters by plugin_slug', () => {
        const result = filterFixture({ type: '', plugin: 'tavily', search: '', scope: 'all', page: 1, perPage: 24 }, corpus)
        expect(result.every((a) => a.plugin_slug === 'tavily')).toBe(true)
    })

    it('filters by case-insensitive prompt substring', () => {
        const result = filterFixture({ type: '', plugin: '', search: 'alpine', scope: 'all', page: 1, perPage: 24 }, corpus)
        expect(result.some((a) => (a.prompt ?? '').toLowerCase().includes('alpine'))).toBe(true)
        expect(result.every((a) => (a.prompt ?? '').toLowerCase().includes('alpine'))).toBe(true)
    })

    it('combines multiple filters with AND semantics', () => {
        const result = filterFixture({ type: 'image', plugin: 'minimax', search: '', scope: 'all', page: 1, perPage: 24 }, corpus)
        expect(result.every((a) => a.media_type === 'image' && a.plugin_slug === 'minimax')).toBe(true)
    })

    it('returns an empty array when nothing matches', () => {
        expect(filterFixture({ type: 'image', plugin: 'tavily', search: '', scope: 'all', page: 1, perPage: 24 }, corpus)).toEqual([])
    })

    it('filters by scope=mine to the current user only', () => {
        const mine = filterFixture({ type: '', plugin: '', search: '', scope: 'mine', page: 1, perPage: 24 }, corpus)
        expect(mine.length).toBeGreaterThan(0)
        expect(mine.every((a) => (a as unknown as { user_id: number }).user_id === 42)).toBe(true)
        const all = filterFixture({ type: '', plugin: '', search: '', scope: 'all', page: 1, perPage: 24 }, corpus)
        expect(all.length).toBeGreaterThan(mine.length)
    })
})

describe('paginate', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]

    it('returns the requested slice', () => {
        expect(paginate(items, 1, 3)).toEqual([1, 2, 3])
        expect(paginate(items, 2, 3)).toEqual([4, 5, 6])
        expect(paginate(items, 3, 3)).toEqual([7])
    })

    it('returns an empty array when the page is past the end', () => {
        expect(paginate(items, 4, 3)).toEqual([])
    })
})

describe('createMockApi', () => {
    const api = createMockApi()

    it('returns a single asset by id', async () => {
        const result = await api.get<MediaAsset>('/media/demo-1')
        expect(result.id).toBe('demo-1')
    })

    it('throws when the id is unknown', async () => {
        await expect(api.get('/media/nope')).rejects.toThrow('Not found: nope')
    })

    it('returns the full list envelope when /media is called without filters', async () => {
        const result = await api.get<MediaListResponse>('/media')
        expect(result.assets).toHaveLength(FIXTURE.length)
        expect(result.total).toBe(FIXTURE.length)
    })

    it('narrows results by ?type= and reports the filtered total', async () => {
        const result = await api.get<MediaListResponse>('/media?type=audio')
        expect(result.assets.every((a) => a.media_type === 'audio')).toBe(true)
        expect(result.total).toBe(result.assets.length)
    })

    it('paginates with ?page= and ?per_page=', async () => {
        const page1 = await api.get<MediaListResponse>('/media?page=1&per_page=2')
        const page2 = await api.get<MediaListResponse>('/media?page=2&per_page=2')
        expect(page1.assets).toHaveLength(2)
        expect(page1.page).toBe(1)
        expect(page1.lastPage).toBeGreaterThan(1)
        expect(page2.page).toBe(2)
        expect(page2.assets[0]?.id).not.toBe(page1.assets[0]?.id)
    })

    it('rejects write verbs', async () => {
        await expect(api.post('/media', {})).rejects.toThrow()
        await expect(api.patch('/media/demo-1', {})).rejects.toThrow()
        await expect(api.delete('/media/demo-1')).rejects.toThrow()
    })

    it('throws for unknown paths', async () => {
        await expect(api.get('/nope')).rejects.toThrow('Mock API has no handler for /nope')
    })
})