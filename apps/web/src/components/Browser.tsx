import { useMemo } from 'react';
import { DockPanel, TreeView, type TreeNode } from '@shanku/ui';
import { CATEGORY_PLURAL, type Category, type ParsedModel } from '@shanku/engine';
import { fmtCount } from '../lib/format';

export interface BrowserProps {
  model: ParsedModel | null;
  onSelectLevel: (level: string) => void;
  onSelectCategory: (category: Category) => void;
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
}: BrowserProps & {
  activeId?: string;
  /** Revit's Views (all): opening a view shows it in its own tab. */
  views?: BrowserView[];
  onOpenView?: (id: string) => void;
  onViewMenu?: (id: string, clientX: number, clientY: number) => void;
}) {
  const nodes = useMemo<TreeNode[]>(() => {
    if (!model) return [];
    const viewNodes: TreeNode[] = views.length
      ? [
          {
            id: 'views',
            label: 'Views (all)',
            children: VIEW_GROUPS.filter(([k]) => views.some((v) => v.kind === k)).map(([k, label]) => ({
              id: `views:${k}`,
              label,
              children: views.filter((v) => v.kind === k).map((v) => ({ id: `view:${v.id}`, label: v.name })),
            })),
          },
        ]
      : [];
    return [
      ...viewNodes,
      {
        id: 'levels',
        label: 'Levels',
        children: model.info.levels.map((l) => ({ id: `level:${l.name}`, label: `${l.name} (${fmtCount(l.elementCount)})` })),
      },
      {
        id: 'categories',
        label: 'Categories',
        children: Object.entries(model.info.categories).map(([c, n]) => ({
          id: `category:${c}`,
          label: `${CATEGORY_PLURAL[c as Category]} (${fmtCount(n ?? 0)})`,
        })),
      },
    ];
  }, [model, views]);

  return (
    <DockPanel title="Project browser" grow>
      {model ? (
        <TreeView
          key={model.info.fileName}
          nodes={nodes}
          label="Project browser"
          defaultExpanded={['views', 'views:plan', 'views:3d', 'views:elevation', 'views:section', 'levels', 'categories']}
          activeId={activeId}
          onContextMenu={(node, x, y) => node.id.startsWith('view:') && onViewMenu?.(node.id.slice(5), x, y)}
          onSelect={(node) => {
            if (node.id.startsWith('view:')) onOpenView?.(node.id.slice(5));
            else if (node.id.startsWith('level:')) onSelectLevel(node.id.slice(6));
            else if (node.id.startsWith('category:')) onSelectCategory(node.id.slice(9) as Category);
          }}
        />
      ) : (
        <p className="app-empty-note">No model open.</p>
      )}
    </DockPanel>
  );
}
