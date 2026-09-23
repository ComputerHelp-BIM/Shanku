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
export function Browser({ model, onSelectLevel, onSelectCategory, activeId }: BrowserProps & { activeId?: string }) {
  const nodes = useMemo<TreeNode[]>(() => {
    if (!model) return [];
    return [
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
  }, [model]);

  return (
    <DockPanel title="Project browser" grow>
      {model ? (
        <TreeView
          key={model.info.fileName}
          nodes={nodes}
          label="Project browser"
          defaultExpanded={['levels', 'categories']}
          activeId={activeId}
          onSelect={(node) => {
            if (node.id.startsWith('level:')) onSelectLevel(node.id.slice(6));
            else if (node.id.startsWith('category:')) onSelectCategory(node.id.slice(9) as Category);
          }}
        />
      ) : (
        <p className="app-empty-note">No model open.</p>
      )}
    </DockPanel>
  );
}
