import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

export interface TreeNode {
  id: string;
  label: string;
  children?: readonly TreeNode[];
}

export interface TreeViewProps {
  nodes: readonly TreeNode[];
  label: string;
  activeId?: string;
  defaultExpanded?: readonly string[];
  onSelect?: (node: TreeNode) => void;
}

interface Row {
  node: TreeNode;
  depth: number;
  parentId: string | null;
}

function flatten(nodes: readonly TreeNode[], expanded: Set<string>, depth = 0, parentId: string | null = null, out: Row[] = []) {
  for (const node of nodes) {
    out.push({ node, depth, parentId });
    if (node.children?.length && expanded.has(node.id)) flatten(node.children, expanded, depth + 1, node.id, out);
  }
  return out;
}

/** The Project browser tree: WAI-ARIA tree pattern with arrow-key navigation. */
export function TreeView({ nodes, label, activeId, defaultExpanded = [], onSelect }: TreeViewProps) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));
  const rows = useMemo(() => flatten(nodes, expanded), [nodes, expanded]);
  const [focusedId, setFocusedId] = useState<string | undefined>(activeId ?? rows[0]?.node.id);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const focus = (id: string) => {
    setFocusedId(id);
    refs.current.get(id)?.focus();
  };
  const toggle = (id: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      const shouldOpen = open ?? !next.has(id);
      if (shouldOpen) next.add(id);
      else next.delete(id);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = rows.findIndex((r) => r.node.id === focusedId);
    if (index < 0) return;
    const row = rows[index];
    const hasChildren = Boolean(row.node.children?.length);
    switch (e.key) {
      case 'ArrowDown':
        if (index < rows.length - 1) focus(rows[index + 1].node.id);
        break;
      case 'ArrowUp':
        if (index > 0) focus(rows[index - 1].node.id);
        break;
      case 'ArrowRight':
        if (hasChildren && !expanded.has(row.node.id)) toggle(row.node.id, true);
        else if (hasChildren && rows[index + 1]) focus(rows[index + 1].node.id);
        break;
      case 'ArrowLeft':
        if (hasChildren && expanded.has(row.node.id)) toggle(row.node.id, false);
        else if (row.parentId) focus(row.parentId);
        break;
      case 'Home':
        focus(rows[0].node.id);
        break;
      case 'End':
        focus(rows[rows.length - 1].node.id);
        break;
      case 'Enter':
      case ' ':
        if (hasChildren) toggle(row.node.id);
        else onSelect?.(row.node);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div className="sk-tree" role="tree" aria-label={label} onKeyDown={onKeyDown}>
      {rows.map(({ node, depth }) => {
        const hasChildren = Boolean(node.children?.length);
        const isOpen = expanded.has(node.id);
        return (
          <div
            key={node.id}
            ref={(el) => {
              if (el) refs.current.set(node.id, el);
              else refs.current.delete(node.id);
            }}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-selected={node.id === activeId}
            tabIndex={node.id === focusedId ? 0 : -1}
            className={['sk-tree__row', node.id === activeId && 'is-active'].filter(Boolean).join(' ')}
            style={{ paddingLeft: 14 + depth * 16 }}
            onClick={() => {
              setFocusedId(node.id);
              if (hasChildren) toggle(node.id);
              else onSelect?.(node);
            }}
          >
            <span className="sk-tree__chevron" aria-hidden="true">
              {hasChildren ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d={isOpen ? 'M3 4.5l3 3 3-3' : 'M4.5 3l3 3-3 3'} />
                </svg>
              ) : null}
            </span>
            <span>{node.label}</span>
          </div>
        );
      })}
    </div>
  );
}
