export interface LocationNode {
  id: string;
  parentId: string | null;
}

/**
 * Returns each permitted root location and its descendants, restricted to the
 * supplied tenant's active location tree. The input list must already be
 * filtered by tenant and active state by the caller.
 */
export function expandLocationScope(
  nodes: readonly LocationNode[],
  rootIds: readonly string[],
): string[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const childrenByParent = new Map<string, string[]>();

  for (const node of nodes) {
    if (!node.parentId || !nodeIds.has(node.parentId)) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node.id);
    childrenByParent.set(node.parentId, children);
  }

  const visited = new Set<string>();
  const queue = rootIds.filter((id) => nodeIds.has(id));

  for (let position = 0; position < queue.length; position += 1) {
    const locationId = queue[position];
    if (!locationId || visited.has(locationId)) continue;

    visited.add(locationId);
    for (const childId of childrenByParent.get(locationId) ?? []) {
      if (!visited.has(childId)) queue.push(childId);
    }
  }

  return [...visited];
}
