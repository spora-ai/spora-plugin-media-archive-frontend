import { describe, expect, it } from 'vitest'
import { buildFolderTree, flattenFolderTree } from '../src/lib/folder-tree'
import type { MediaFolder } from '../src/types'

function folder(overrides: Partial<MediaFolder> & { id: string }): MediaFolder {
    return {
        name: overrides.id,
        path: `/${overrides.id}`,
        parent_id: null,
        asset_count: 0,
        ...overrides,
    }
}

describe('buildFolderTree', () => {
    it('nests a child under its parent', () => {
        const tree = buildFolderTree([
            folder({ id: 'a', path: '/a' }),
            folder({ id: 'b', path: '/a/b', parent_id: 'a' }),
        ])
        expect(tree).toHaveLength(1)
        expect(tree[0]?.folder.id).toBe('a')
        expect(tree[0]?.children[0]?.folder.id).toBe('b')
    })

    it('keeps a folder whose parent is missing from the list as a root', () => {
        // A folder of another principal's tree can be in the list while
        // its parent is not. Dropping it would hide a folder the
        // operator can filter by.
        const tree = buildFolderTree([
            folder({ id: 'b', path: '/a/b', parent_id: 'a' }),
        ])
        expect(tree.map((node) => node.folder.id)).toEqual(['b'])
    })

    it('treats a folder that is its own parent as a root', () => {
        const tree = buildFolderTree([
            folder({ id: 'a', parent_id: 'a' }),
        ])
        expect(tree.map((node) => node.folder.id)).toEqual(['a'])
    })

    it('treats a folder in a parent cycle as a root', () => {
        const tree = buildFolderTree([
            folder({ id: 'a', parent_id: 'b' }),
            folder({ id: 'b', parent_id: 'a' }),
        ])
        // Without the cycle guard the tree walk would never terminate.
        expect(tree.length).toBeGreaterThan(0)
        const ids = tree.flatMap((node) => [node.folder.id, ...node.children.map((c) => c.folder.id)])
        expect(ids).toContain('a')
        expect(ids).toContain('b')
    })

    it('orders the roots and the children by path', () => {
        const tree = buildFolderTree([
            folder({ id: 'b', path: '/b' }),
            folder({ id: 'a', path: '/a' }),
            folder({ id: 'a2', path: '/a/2', parent_id: 'a' }),
            folder({ id: 'a1', path: '/a/1', parent_id: 'a' }),
        ])
        expect(tree.map((node) => node.folder.id)).toEqual(['a', 'b'])
        expect(tree[0]?.children.map((node) => node.folder.id)).toEqual(['a1', 'a2'])
    })
})

describe('flattenFolderTree', () => {
    it('lists the folders in render order with their depth', () => {
        const rows = flattenFolderTree(buildFolderTree([
            folder({ id: 'a', path: '/a' }),
            folder({ id: 'b', path: '/a/b', parent_id: 'a' }),
            folder({ id: 'c', path: '/a/b/c', parent_id: 'b' }),
            folder({ id: 'd', path: '/d' }),
        ]))
        expect(rows.map((row) => [row.folder.id, row.depth])).toEqual([
            ['a', 0],
            ['b', 1],
            ['c', 2],
            ['d', 0],
        ])
    })

    it('returns nothing for an empty list', () => {
        expect(flattenFolderTree(buildFolderTree([]))).toEqual([])
    })
})
