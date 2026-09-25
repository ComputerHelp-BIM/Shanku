import { useMemo, useState } from 'react';
import { DockPanel, TreeView, type IconName, type TreeNode } from '@shanku/ui';
import { CATEGORY_PLURAL, type Category, type ParsedModel } from '@shanku/engine';
import { fmtCount } from '../lib/format';

export interface BrowserProps {
  model: ParsedModel | null;
  onSelectLevel: (level: string) => void;
  onSelectCategory: (category: Category) => void;
  /** A family type in Families: select its instances. */
  onSelectElements?: (indices: number[]) => void;
}

const VIEW_ICON: Record<BrowserView['kind'], IconName> = { plan: 'plan', '3d': 'view3d', elevation: 'elevation', section: 'section' };
const CAT_ICON: Partial<Record<Category, IconName>> = { Column: 'column', Beam: 'beam', Slab: 'slab', Wall: 'wall', Footing: 'footing' };

/**
 * Revit's Families branch from the model: category → family → type, with instance counts.
 * Revit's IFC names elements "Family:Type:ElementId"; other files fall back to the type name.
 */
function familyTree(model: ParsedModel): TreeNode {
  const cats = new Map<Category, Map<string, Map<string, number[]>>>();
  model.elements.forEach((e, i) => {
    const parts = (e.name ?? '').split(':');
    const family = parts.length >= 2 ? parts[0].trim() : e.typeName || e.ifcClass;
    const type = (parts.length >= 2 ? parts[1].trim() : '') || e.typeName || e.name || e.ifcClass;
    const fams = cats.get(e.category) ?? new Map<string, Map<string, number[]>>();
    const types = fams.get(family) ?? new Map<string, number[]>();
    types.set(type, [...(types.get(type) ?? []), i]);
    fams.set(family, types);
    cats.set(e.category, fams);
  });
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return {
    id: 'families',
    label: 'Families',
    icon: 'template',
    children: [...cats.entries()]
      .sort((a, b) => byName(CATEGORY_PLURAL[a[0]], CATEGORY_PLURAL[b[0]]))
      .map(([cat, fams]) => ({
        id: `fam-cat:${cat}`,
        label: CATEGORY_PLURAL[cat],
        icon: CAT_ICON[cat] ?? 'layout',
        children: [...fams.entries()]
          .sort((a, b) => byName(a[0], b[0]))
          .map(([fam, types]) => ({
            id: `fam:${cat}|${fam}`,
            label: fam,
            children: [...types.entries()]
              .sort((a, b) => byName(a[0], b[0]))
              .map(([type, idx]) => ({ id: `famtype:${cat}|${fam}|${type}`, label: `${type} (${fmtCount(idx.length)})`, hint: `Select the ${fmtCount(idx.length)} instance${idx.length === 1 ? '' : 's'}` })),
          })),
      })),
  };
}

/** Project browser: levels and categories. Choosing one selects its elements. */
export interface BrowserView {
  id: string;
  kind: '3d' | 'plan' | 'elevation' | 'section';
  name: string;
}

const VIEW_GROUPS: Array<[BrowserView['kind'], string]> = [
  ['plan', 'Structural Plans'],
  ['3d', '3D Views'],
  ['elevation', 'Elevations (Building Elevation)'],
  ['section', 'Sections (Building Section)'],
];

export function Browser({
  model,
  onSelectLevel,
  onSelectCategory,
  activeId,
  views = [],
  onOpenView,
  onViewMenu,
  onSelectElements,
}: BrowserProps & {
  activeId?: string;
  /** Revit's Views (all): opening a view shows it in its own tab. */
  views?: BrowserView[];
  onOpenView?: (id: string) => void;
  onViewMenu?: (id: string, clientX: number, clientY: number) => void;
}) {
  const [search, setSearch] = useState('');
  const families = useMemo(() => (model ? familyTree(model) : null), [model]);
  const nodes = useMemo<TreeNode[]>(() => {
    if (!model) return [];
    const viewNodes: TreeNode[] = views.length
      ? [
          {
            id: 'views',
            label: 'Views (all)',
            icon: 'layout',
            children: VIEW_GROUPS.filter(([k]) => views.some((v) => v.kind === k)).map(([k, label]) => ({
              id: `views:${k}`,
              label,
              children: views.filter((v) => v.kind === k).map((v) => ({ id: `view:${v.id}`, label: v.name, icon: VIEW_ICON[v.kind] })),
            })),
          },
        ]
      : [];
    return [
      ...viewNodes,
      ...(families ? [families] : []),
      {
        id: 'levels',
        label: 'Levels',
        icon: 'level',
        hint: 'Click a level to select its elements',
        children: model.info.levels.map((l) => ({ id: `level:${l.name}`, label: `${l.name} (${fmtCount(l.elementCount)})`, icon: 'level' as IconName })),
      },
      {
        id: 'categories',
        label: 'Categories',
        icon: 'layout',
        hint: 'Click a category to select its elements',
        children: Object.entries(model.info.categories).map(([c, n]) => ({
          id: `category:${c}`,
          label: `${CATEGORY_PLURAL[c as Category]} (${fmtCount(n ?? 0)})`,
          icon: CAT_ICON[c as Category] ?? ('layout' as IconName),
        })),
      },
    ];
  }, [model, views, families]);
  const typeIndices = (id: string): number[] => {
    const [cat, fam, type] = id.slice('famtype:'.length).split('|');
    const node = families?.children?.find((c) => c.id === `fam-cat:${cat}`)?.children?.find((f) => f.id === `fam:${cat}|${fam}`)?.children?.find((t) => t.id === id);
    if (!node || !model) return [];
    return model.elements.flatMap((e, i) => {
      const parts = (e.name ?? '').split(':');
      const f = parts.length >= 2 ? parts[0].trim() : e.typeName || e.ifcClass;
      const t = (parts.length >= 2 ? parts[1].trim() : '') || e.typeName || e.name || e.ifcClass;
      return e.category === cat && f === fam && t === type ? [i] : [];
    });
  };

  return (
    <DockPanel
      title="Project browser"
      grow
      toolbar={
        model ? (
          <label className="app-browser-search">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input type="search" aria-label="Search the project browser" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setSearch('')} />
          </label>
        ) : undefined
      }
    >
      {model ? (
        <TreeView
          key={model.info.fileName}
          variant="revit"
          filter={search}
          nodes={nodes}
          label="Project browser"
          defaultExpanded={['views', 'views:plan', 'views:3d', 'views:elevation', 'views:section', 'levels', 'categories']}
          activeId={activeId}
          onContextMenu={(node, x, y) => node.id.startsWith('view:') && onViewMenu?.(node.id.slice(5), x, y)}
          onSelect={(node) => {
            if (node.id.startsWith('view:')) onOpenView?.(node.id.slice(5));
            else if (node.id.startsWith('level:')) onSelectLevel(node.id.slice(6));
            else if (node.id.startsWith('category:')) onSelectCategory(node.id.slice(9) as Category);
            else if (node.id.startsWith('famtype:')) onSelectElements?.(typeIndices(node.id));
          }}
        />
      ) : (
        <p className="app-empty-note">No model open.</p>
      )}
    </DockPanel>
  );
}
