import { useMemo, useState, type FormEvent } from 'react';
import {
  AppShell,
  BottomPanel,
  Button,
  CommandSearch,
  DockPanel,
  IconButton,
  LocalIndicator,
  PropertyRow,
  PropertySection,
  Ribbon,
  RibbonButton,
  RibbonGroup,
  RibbonTabs,
  StatusBar,
  StatusChip,
  TitleBar,
  TreeView,
  TypeSelector,
  ViewTabs,
  useTheme,
  type TreeNode,
} from '@shanku/ui';
import { FRAME_FACES } from './frameFaces';

const RIBBON_TABS = ['File', 'Model', 'Modify', 'View', 'Quantities', 'Analyze', 'Collaborate'].map((label) => ({
  id: label.toLowerCase(),
  label,
}));

const TREE: TreeNode[] = [
  {
    id: 'views',
    label: 'Views',
    children: [
      { id: '3d-views', label: '3D Views', children: [{ id: 'view-3d', label: '{3D}' }] },
      {
        id: 'plans',
        label: 'Floor Plans',
        children: [
          { id: 'plan-l1', label: 'Level 1' },
          { id: 'plan-l2', label: 'Level 2' },
          { id: 'plan-roof', label: 'Roof' },
        ],
      },
      { id: 'elevations', label: 'Elevations', children: [{ id: 'elev-n', label: 'North' }, { id: 'elev-e', label: 'East' }] },
    ],
  },
  { id: 'boq', label: 'Quantities (BOQ)' },
  { id: 'types', label: 'Families & types' },
];

// Sample model figures, consistent with the preview frame (400 x 400 columns, 300 x 500 beams, 3.2 m storeys).
const COLUMN_HEIGHT_M = 3.05;
const COLUMNS_PER_LEVEL = 12;
const BEAM_VOLUME_L2_M3 = 13.08;

const MODES = ['Neutral', 'Category', 'QA status', 'Revision diff', 'Concrete grade'] as const;

function ThemeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
    </svg>
  );
}

export function App() {
  const { preference, cycle } = useTheme();
  const [ribbonTab, setRibbonTab] = useState('model');
  const [tool, setTool] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('view-3d');
  const [viewTabs, setViewTabs] = useState([
    { id: 'view-3d', label: '{3D}', closable: true },
    { id: 'plan-l2', label: 'Level 2 — Plan', closable: true },
  ]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState('console');
  const [width, setWidth] = useState(400);
  const [depth, setDepth] = useState(400);
  const [modeIndex, setModeIndex] = useState(0);
  const [history, setHistory] = useState<Array<{ kind: 'in' | 'out'; text: string }>>([
    { kind: 'in', text: 'col = shanku.selection()[0]' },
    { kind: 'in', text: 'col.params["Width"], col.params["Depth"]' },
    { kind: 'out', text: '(400, 400)' },
  ]);
  const [command, setCommand] = useState('');

  const columnVolume = useMemo(() => (width / 1000) * (depth / 1000) * COLUMN_HEIGHT_M, [width, depth]);
  const columnsL2 = columnVolume * COLUMNS_PER_LEVEL;

  const commitMillimetres = (setter: (n: number) => void, label: string) => (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 150 || n > 3000) {
      setHistory((h) => [...h, { kind: 'out', text: `${label} must be between 150 and 3000 mm. Kept the previous value.` }]);
      return;
    }
    setter(Math.round(n));
  };

  const runCommand = (e: FormEvent) => {
    e.preventDefault();
    const text = command.trim();
    if (!text) return;
    const out =
      text === 'shanku.version'
        ? "'0.1.0'"
        : text.startsWith('shanku.boq')
          ? `Columns   M30   ${columnsL2.toFixed(2)} m³\nBeams     M30   ${BEAM_VOLUME_L2_M3.toFixed(2)} m³`
          : 'The console is a preview. Python runs here once Pyodide lands in v0.1 of the app.';
    setHistory((h) => [...h, { kind: 'in', text }, { kind: 'out', text: out }]);
    setCommand('');
  };

  const openView = (node: TreeNode) => {
    if (node.children?.length) return;
    setViewTabs((tabs) => (tabs.some((t) => t.id === node.id) ? tabs : [...tabs, { id: node.id, label: node.label, closable: true }]));
    setActiveView(node.id);
  };
  const closeView = (id: string) => {
    setViewTabs((tabs) => {
      const next = tabs.filter((t) => t.id !== id);
      if (id === activeView && next.length) setActiveView(next[next.length - 1].id);
      return next;
    });
  };

  const toolButton = (id: string, icon: Parameters<typeof RibbonButton>[0]['icon'], label: string, twoTone = false) => (
    <RibbonButton icon={icon} label={label} twoTone={twoTone} active={tool === id} onClick={() => setTool((t) => (t === id ? null : id))} />
  );

  return (
    <AppShell
      titleBar={
        <TitleBar
          fileName="Tower-A_Structure.ifc"
          saveState="Saved locally"
          search={<CommandSearch />}
          actions={
            <>
              <IconButton label={`Theme: ${preference}. Switch theme`} onClick={cycle}>
                <ThemeIcon />
              </IconButton>
              <Button size="sm">Sign in</Button>
            </>
          }
        />
      }
      ribbonTabs={<RibbonTabs tabs={RIBBON_TABS} activeId={ribbonTab} onChange={setRibbonTab} />}
      ribbon={
        <Ribbon label="Model">
          <RibbonGroup label="Import">
            {toolButton('dxf', 'dxf', 'DXF')}
            {toolButton('ifc', 'ifc', 'IFC')}
          </RibbonGroup>
          <RibbonGroup label="Structure">
            {toolButton('column', 'column', 'Column', true)}
            {toolButton('beam', 'beam', 'Beam', true)}
            {toolButton('wall', 'wall', 'Wall', true)}
            {toolButton('slab', 'slab', 'Slab', true)}
            {toolButton('footing', 'footing', 'Footing', true)}
          </RibbonGroup>
          <RibbonGroup label="Datum">
            {toolButton('grid', 'grid', 'Grid')}
            {toolButton('level', 'level', 'Level')}
          </RibbonGroup>
          <RibbonGroup label="Reinforcement">
            {toolButton('rebar', 'rebar', 'Rebar')}
            {toolButton('bbs', 'bbs', 'BBS')}
          </RibbonGroup>
          <RibbonGroup label="Check">
            {toolButton('qa', 'qa', 'QA')}
            {toolButton('diff', 'diff', 'Diff')}
          </RibbonGroup>
          <RibbonGroup label="Quantities">{toolButton('boq-tool', 'boq', 'BOQ')}</RibbonGroup>
        </Ribbon>
      }
      left={
        <>
          <DockPanel title="Properties">
            <TypeSelector icon="column" category="RCC Column" typeName={`C-${width}×${depth} · M30`} />
            <PropertySection title="Identity">
              <PropertyRow label="Element ID" value="104233" mono />
              <PropertyRow label="GlobalId" value="2O2Fr$t4X7Zf8NOew3FLOH" mono />
              <PropertyRow label="Mark" value="C12" />
            </PropertySection>
            <PropertySection title="Constraints">
              <PropertyRow label="Base level" value="Level 1" />
              <PropertyRow label="Top level" value="Level 2" />
              <PropertyRow label="Top offset" value={0} unit="mm" />
            </PropertySection>
            <PropertySection title="Dimensions">
              <PropertyRow label="Width" value={width} unit="mm" onCommit={commitMillimetres(setWidth, 'Width')} />
              <PropertyRow label="Depth" value={depth} unit="mm" onCommit={commitMillimetres(setDepth, 'Depth')} />
              <PropertyRow label="Volume" value={columnVolume.toFixed(2)} unit="m³" readOnly />
            </PropertySection>
            <PropertySection title="Material">
              <PropertyRow label="Concrete grade" value="M30" />
            </PropertySection>
          </DockPanel>
          <DockPanel title="Project browser" grow>
            <TreeView
              nodes={TREE}
              label="Project browser"
              activeId={activeView}
              defaultExpanded={['views', '3d-views', 'plans']}
              onSelect={openView}
            />
          </DockPanel>
        </>
      }
      viewTabs={<ViewTabs tabs={viewTabs} activeId={activeView} onSelect={setActiveView} onClose={closeView} />}
      viewport={
        <div className="pg-viewport">
          <svg viewBox="60 110 720 570" role="img" aria-label="3D view of a two-storey RCC frame with column C12 selected">
            {FRAME_FACES.map(([points, part], i) => (
              <polygon key={i} className={`pg-face ${part}`} points={points} />
            ))}
          </svg>
          <p className="pg-note">Preview drawing. The live three.js viewport replaces this in app v0.1.</p>
        </div>
      }
      viewBar={
        <>
          <Button size="sm" variant="ghost">1 : 100</Button>
          <Button size="sm" variant="ghost">Shaded</Button>
          <Button size="sm" variant="ghost" onClick={() => setModeIndex((i) => (i + 1) % MODES.length)}>
            Colour by: {MODES[modeIndex]}
          </Button>
          <Button size="sm" variant="ghost">Section box: Off</Button>
        </>
      }
      bottomPanel={
        <BottomPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          activeId={panelTab}
          onTabChange={setPanelTab}
          tabs={[
            {
              id: 'console',
              label: 'Python console',
              content: (
                <div className="pg-console">
                  {history.map((line, i) =>
                    line.kind === 'in' ? (
                      <p key={i}>
                        <span className="pg-prompt">&gt;&gt;&gt; </span>
                        {line.text}
                      </p>
                    ) : (
                      <p key={i} className="pg-out">
                        {line.text}
                      </p>
                    ),
                  )}
                  <form className="pg-console-input" onSubmit={runCommand}>
                    <span className="pg-prompt">&gt;&gt;&gt;</span>
                    <input aria-label="Python command" value={command} onChange={(e) => setCommand(e.target.value)} spellCheck={false} />
                  </form>
                </div>
              ),
            },
            {
              id: 'qa',
              label: 'QA results',
              badge: 3,
              content: (
                <ul className="pg-qa">
                  <li><span className="pg-dot error" aria-hidden="true" /><strong>Error</strong> Column C7 has no top level.</li>
                  <li><span className="pg-dot warning" aria-hidden="true" /><strong>Warning</strong> Beam B21 is 12 mm off grid C.</li>
                  <li><span className="pg-dot warning" aria-hidden="true" /><strong>Warning</strong> Beam B34 overlaps slab S2 by 150 mm.</li>
                </ul>
              ),
            },
            {
              id: 'boq',
              label: 'BOQ',
              content: (
                <table className="pg-table">
                  <thead>
                    <tr><th scope="col">Level</th><th scope="col">Category</th><th scope="col">Grade</th><th scope="col">Concrete</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Level 2</td><td>Columns</td><td>M30</td><td className="num">{columnsL2.toFixed(2)} m³</td></tr>
                    <tr><td>Level 2</td><td>Beams</td><td>M30</td><td className="num">{BEAM_VOLUME_L2_M3.toFixed(2)} m³</td></tr>
                  </tbody>
                </table>
              ),
            },
            { id: 'activity', label: 'Activity', content: <p className="pg-faint">Opened Tower-A_Structure.ifc from this device.</p> },
          ]}
        />
      }
      statusBar={
        <StatusBar>
          <span className="pg-sel">
            <span className="pg-sel__dot" aria-hidden="true" />
            1 selected · <span className="pg-sel__name">Column C12</span>
          </span>
          <span className="pg-divider" aria-hidden="true" />
          <StatusChip>Columns 24</StatusChip>
          <StatusChip>Beams 34</StatusChip>
          <StatusChip>Slabs 1</StatusChip>
          <span className="pg-spacer" />
          <LocalIndicator />
          <span className="pg-divider" aria-hidden="true" />
          <span className="pg-mono">Python ›</span>
          <span className="pg-faint">IFC4 · mm</span>
        </StatusBar>
      }
    />
  );
}
