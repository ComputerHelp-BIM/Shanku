import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';

export interface TreeNode {
  id: string;
  label: string;
  children?: readonly TreeNode[];
  /** Small icon before the label (Revit variant). */
  icon?: IconName;
  /** Shown bold (Revit shows the open view in bold). */
  bold?: boolean;
  /** Tooltip. */
  hint?: string;
}

export interface TreeViewProps {
  nodes: readonly TreeNode[];
  label: string;
  activeId?: string;
  defaultExpanded?: readonly string[];
  onSelect?: (node: TreeNode) => void;
  /** Right-click on a row (e.g. Revit's view menu in the Project Browser). */
  onContextMenu?: (node: TreeNode, clientX: number, clientY: number) => void;
  /** 'revit': boxed +/− expanders, dotted guide lines and node icons, as Revit's Project Browser. */
  variant?: 'default' | 'revit';
  /** Keeps rows whose label contains this (and their parents), with everything opened. */
  filter?: string;
}

interface Row {
  node: TreeNode;
  depth: number;
  parentId: string | null;
  /** Per ancestor level: does a dotted guide continue past this row? */
  guides: boolean[];
  last: boolean;
}

function flatten(nodes: readonly TreeNode[], expanded: Set<string>, depth = 0, parentId: string | null = null, out: Row[] = [], guides: boolean[] = []) {
  nodes.forEach((node, i) => {
    const last = i === nodes.length - 1;
    out.push({ node, depth, parentId, guides, last });
    if (node.children?.length && expanded.has(node.id)) flatten(node.children, expanded, depth + 1, node.id, out, [...guides, !last]);
  });
  return out;
}

/** Nodes whose label contains the query, with their ancestors; null keeps everything. */
function prune(nodes: readonly TreeNode[], q: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    const kids = n.children ? prune(n.children, q) : [];
    if (n.label.toLowerCase().includes(q) || kids.length) out.push({ ...n, children: n.label.toLowerCase().includes(q) && !kids.length ? n.children : kids });
  }
  return out;
}

function allParents(nodes: readonly TreeNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes)
    if (n.children?.length) {
      out.add(n.id);
      allParents(n.children, out);
    }
  return out;
}

/** The Project browser tree: WAI-ARIA tree pattern with arrow-key navigation. */
export function TreeView({ nodes, label, activeId, defaultExpanded = [], onSelect, onContextMenu, variant = 'default', filter }: TreeViewProps) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));
  const q = filter?.trim().toLowerCase() ?? '';
  const shown = useMemo(() => (q ? prune(nodes, q) : nodes), [nodes, q]);
  const open = useMemo(() => (q ? allParents(shown) : expanded), [q, shown, expanded]);
  const rows = useMemo(() => flatten(shown, open), [shown, open]);
  const revit = variant === 'revit';
  const [focusedId, setFocusedId] = useState<string | undefined>(activeId ?? rows[0]?.node.id);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const focus = (id: string) => {
    setFocusedId(id);
    refs.current.get(id)?.focus({ preventScroll: true });
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
        if (hasChildren && !open.has(row.node.id)) toggle(row.node.id, true);
        else if (hasChildren && rows[index + 1]) focus(rows[index + 1].node.id);
        break;
      case 'ArrowLeft':
        if (hasChildren && open.has(row.node.id)) toggle(row.node.id, false);
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
    <div className={['sk-tree', revit && 'sk-tree--revit'].filter(Boolean).join(' ')} role="tree" aria-label={label} onKeyDown={onKeyDown}>
      {q && !rows.length ? <div className="sk-tree__empty">Nothing matches “{filter}”.</div> : null}
      {rows.map(({ node, depth, guides, last }) => {
        const hasChildren = Boolean(node.children?.length);
        const isOpen = open.has(node.id);
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
            className={['sk-tree__row', node.id === activeId && 'is-active', node.bold && 'is-bold'].filter(Boolean).join(' ')}
            style={revit ? undefined : { paddingLeft: 14 + depth * 16 }}
            title={node.hint}
            onClick={() => {
              setFocusedId(node.id);
              if (hasChildren) toggle(node.id);
              else onSelect?.(node);
            }}
            onContextMenu={
              onContextMenu
                ? (e) => {
                    e.preventDefault();
                    setFocusedId(node.id);
                    onContextMenu(node, e.clientX, e.clientY);
                  }
                : undefined
            }
          >
            {revit ? (
              <>
                {/* dotted guides: one column per ancestor, then this row's elbow */}
                {guides.map((g, i) => (
                  <span key={i} className={['sk-tree__guide', g && 'is-through'].filter(Boolean).join(' ')} aria-hidden="true" />
                ))}
                {depth > 0 ? <span className={['sk-tree__elbow', last && 'is-last'].filter(Boolean).join(' ')} aria-hidden="true" /> : null}
                <span className="sk-tree__box" aria-hidden="true">
                  {hasChildren ? <span className="sk-tree__boxmark">{isOpen ? '−' : '+'}</span> : null}
                </span>
                {node.icon ? <Icon name={node.icon} size={14} className="sk-tree__icon" /> : null}
                <span className="sk-tree__label">{node.label}</span>
              </>
            ) : (
              <>
                <span className="sk-tree__chevron" aria-hidden="true">
                  {hasChildren ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d={isOpen ? 'M3 4.5l3 3 3-3' : 'M4.5 3l3 3-3 3'} />
                    </svg>
                  ) : null}
                </span>
                <span>{node.label}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
