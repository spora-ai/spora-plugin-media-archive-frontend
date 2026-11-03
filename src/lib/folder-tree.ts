/**
 * Folder-tree helpers.
 *
 * The listing endpoint returns the principal's folders **flat** and
 * ordered by `path`; the tree the filter bar draws is built here, on the
 * client, from `parent_id`.
 *
 * A folder's `path` is its path from the tenant root (`/Corporate`,
 * `/Corporate/2026`), so a parent's path is always a prefix of its
 * children's — the ordering the server sends is therefore already a
 * valid tree order. The helpers sort by path themselves anyway: the list
 * the panel holds is the union of several principals' folders (the scope
 * chip row can span them), and each principal's list is ordered
 * separately.
 */
import type { MediaFolder } from '../types'

export interface FolderTreeNode<T extends MediaFolder = MediaFolder> {
    folder: T
    children: FolderTreeNode<T>[]
}

export interface FolderTreeRow<T extends MediaFolder = MediaFolder> {
    folder: T
    /**
     * 0 for a top-level folder, 1 for its children, and so on — the
     * filter bar indents by it.
     */
    depth: number
}

function byPath(a: MediaFolder, b: MediaFolder): number {
    return a.path.localeCompare(b.path)
}

/**
 * Whether the chain of `parent_id` links above a folder loops.
 *
 * The server cannot produce a cycle — a folder cannot be moved inside
 * itself — but a malformed list must not hang the panel, so a folder
 * whose ancestors loop is treated as a root.
 */
function hasCyclicAncestor(folder: MediaFolder, byId: ReadonlyMap<string, MediaFolder>): boolean {
    const seen = new Set<string>()
    let current = folder
    while (current.parent_id !== null) {
        if (seen.has(current.id)) {
            return true
        }
        seen.add(current.id)
        const parent = byId.get(current.parent_id)
        if (parent === undefined) {
            return false
        }
        current = parent
    }
    return false
}

/**
 * Build the tree from the flat listing.
 *
 * A folder whose `parent_id` names a folder that is not in the list
 * becomes a root: it stays visible instead of disappearing with a
 * parent the caller never received.
 */
export function buildFolderTree<T extends MediaFolder>(folders: readonly T[]): FolderTreeNode<T>[] {
    const byId = new Map<string, T>()
    for (const folder of folders) {
        byId.set(folder.id, folder)
    }

    const nodes = new Map<string, FolderTreeNode<T>>()
    for (const folder of folders) {
        nodes.set(folder.id, { folder, children: [] })
    }

    const roots: FolderTreeNode<T>[] = []
    for (const folder of folders) {
        const node = nodes.get(folder.id)
        if (node === undefined) {
            continue
        }
        const parent = folder.parent_id === null ? undefined : nodes.get(folder.parent_id)
        if (
            parent === undefined
            || parent.folder.id === folder.id
            || hasCyclicAncestor(folder, byId)
        ) {
            roots.push(node)
            continue
        }
        parent.children.push(node)
    }

    const sort = (node: FolderTreeNode<T>): void => {
        node.children.sort((a, b) => byPath(a.folder, b.folder))
        for (const child of node.children) {
            sort(child)
        }
    }
    roots.sort((a, b) => byPath(a.folder, b.folder))
    for (const root of roots) {
        sort(root)
    }

    return roots
}

/**
 * The tree as a flat list in render order, each row carrying its depth.
 *
 * The filter bar draws the tree with one button per row, indented by
 * the depth — a flat list keeps the markup free of recursion.
 */
export function flattenFolderTree<T extends MediaFolder>(
    tree: readonly FolderTreeNode<T>[],
): FolderTreeRow<T>[] {
    const rows: FolderTreeRow<T>[] = []
    const walk = (nodes: readonly FolderTreeNode<T>[], depth: number): void => {
        for (const node of nodes) {
            rows.push({ folder: node.folder, depth })
            walk(node.children, depth + 1)
        }
    }
    walk(tree, 0)
    return rows
}
