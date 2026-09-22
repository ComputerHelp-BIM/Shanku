import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AppShell,
  Button,
  CommandSearch,
  FloatingWindow,
  IconButton,
  LocalIndicator,
  Ribbon,
  RibbonButton,
  RibbonGroup,
  RibbonTabs,
  StatusBar,
  StatusChip,
  TitleBar,
  ViewTabs,
  isEditableTarget,
  TOGGLE_BOTTOM_PANEL,
  useShortcut,
  useTheme,
} from '@shanku/ui';
import { CATEGORY_PLURAL, DEFAULT_GRADE_RULES, DEFAULT_MARK_RULES, ENGINE_VERSION, type Category, type DisplayStyle, type PipelineQa } from '@shanku/engine';
import { Browser } from './components/Browser';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport, type ViewportHandle } from './components/Viewport';
import { fmtCount } from './lib/format';
import { fileFromDrop, pickFile, pickIfcFile } from './lib/openFile';
import { useDrawings } from './lib/useDrawings';
import { nextDocColor } from './lib/documents';
import { DrawingView, type DrawingViewHandle } from './components/DrawingView';
import { DrawingProperties, LayersPanel } from './components/DrawingPanels';
import { MarkRulesDialog } from './components/MarkRulesDialog';
import { BoqWindow } from './components/BoqWindow';
import { ConsolePanel } from './components/ConsolePanel';
import { PipelinePanel } from './components/PipelinePanel';
import { qaFocus, usePipeline } from './lib/usePipeline';
import { DockWorkspace, type DockWorkspaceHandle, type PanelId } from './components/DockWorkspace';
import { emptyRates, loadRates, saveRates, type RateBook } from './lib/rates';
import { useShankuModel } from './lib/useShankuModel';
import { SHORTCUT_HELP, createSequenceReader, type CommandId } from './lib/shortcuts';

const APP_VERSION = '0.12.0';
const STYLES: Array<{ id: DisplayStyle; label: string; keys: string }> = [
  { id: 'shaded', label: 'Shaded', keys: 'SD' },
  { id: 'consistent', label: 'Consistent', keys: 'CO' },
  { id: 'hiddenLine', label: 'Hidden line', keys: 'HL' },
  { id: 'wireframe', label: 'Wireframe', keys: 'WF' },
];
const RIBBON_TABS = ['Model', 'View', 'Manage'].map((label) => ({ id: label.toLowerCase(), label }));

function ThemeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
    </svg>
  );
}

export function App() {
  const { preference, cycle } = useTheme();
  const m = useShankuModel();
  const viewport = useRef<ViewportHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const [ribbonTab, setRibbonTab] = useState('model');
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('shaded');
  const [sectionBox, setSectionBox] = useState(false);
  const [zoomRegion, setZoomRegion] = useState(false);
  const [activeView, setActiveView] = useState<string>('3d');
  const [markDialog, setMarkDialog] = useState(false);
  const [gradeDialog, setGradeDialog] = useState(false);
  const dock = useRef<DockWorkspaceHandle>(null);
  const [openPanels, setOpenPanels] = useState<PanelId[]>([]);
  // Revit-style windows (float above everything, ribbon included)
  const [wins, setWins] = useState({ boq: false, pipeline: false, keys: false });
  const toggleWin = (k: keyof typeof wins, v?: boolean) => setWins((w) => ({ ...w, [k]: v ?? !w[k] }));
  useShortcut(TOGGLE_BOTTOM_PANEL, () => dock.current?.toggleBottom(), { allowInEditable: true });
  const [rates, setRates] = useState<RateBook>(emptyRates);
  useEffect(() => {
    if (m.model) setRates(loadRates(m.model.info.fileName));
  }, [m.model?.info.fileName]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeRates = useCallback(
    (book: RateBook) => {
      setRates(book);
      if (m.model) saveRates(m.model.info.fileName, book);
    },
    [m.model],
  );
  const boqSelect = useCallback(
    (ids: number[], mode: 'replace' | 'add' | 'remove') => {
      setActiveView('3d');
      if (mode === 'replace') m.setSelection(ids);
      else if (mode === 'add') m.setSelection([...new Set([...m.selection, ...ids])]);
      else {
        const drop = new Set(ids);
        m.setSelection(m.selection.filter((i) => !drop.has(i)));
      }
    },
    [m],
  );
  const [ifcColor, setIfcColor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drawingView = useRef<DrawingViewHandle>(null);
  const ifcColorRef = useRef<string | null>(null);
  ifcColorRef.current = ifcColor;
  const dx = useDrawings(
    useCallback(() => (ifcColorRef.current ? [ifcColorRef.current] : []), []),
    m.log,
  );
  const activeDoc = dx.docs.find((d) => d.id === activeView) ?? null;

  // A new model starts with nothing hidden and no section box.
  useEffect(() => {
    setHidden([]);
    setSectionBox(false);
    if (m.model) {
      setIfcColor((c) => c ?? nextDocColor(dx.docs.map((d) => d.color)));
      setActiveView('3d');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.model]);

  const openDrawing = useCallback(
    async (file: { name: string; bytes: ArrayBuffer }) => {
      try {
        const id = await dx.open(file);
        if (id) setActiveView(id);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      }
    },
    [dx],
  );

  const openDxfFromDisk = useCallback(async () => {
    try {
      const file = await pickFile('dxf');
      if (file) await openDrawing(file);
    } catch (e) {
      m.log(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [m, openDrawing]);

  // ---- DXF -> 3D pipeline
  const pipeline = usePipeline({
    getClient: dx.getClient,
    openDrawing: dx.open,
    openModel: async (f) => {
      await m.open(f);
      setActiveView('3d');
    },
    log: m.log,
    showWindow: () => toggleWin('pipeline', true),
  });
  const pipe = pipeline.state;

  const showQa = useCallback(
    (q: PipelineQa) => {
      const doc = dx.docs.find((d) => d.name === pipe?.fileName);
      if (!doc) return setNotice('The drawing is still opening in 2D; try again in a moment.');
      setActiveView(doc.id);
      const b = qaFocus(q);
      if (b) setTimeout(() => drawingView.current?.zoomTo(b[0], b[1], b[2], b[3]), 80);
    },
    [dx.docs, pipe?.fileName],
  );

  const closeView = (id: string) => {
    if (id === '3d') {
      m.close();
      setIfcColor(null);
      setHidden([]);
      setSectionBox(false);
      setWins((w) => ({ ...w, boq: false }));
      m.log('Model closed.');
      if (dx.docs.length) setActiveView(dx.docs[0].id);
      return;
    }
    dx.close(id);
    if (id === activeView) setActiveView(m.model || dx.docs.length <= 1 ? '3d' : dx.docs.find((d) => d.id !== id)!.id);
  };

  const openFromDisk = useCallback(async () => {
    try {
      const file = await pickIfcFile();
      if (file) await m.open(file);
    } catch (e) {
      m.log(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [m]);

  const openSample = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-frame.ifc`);
    if (!res.ok) return m.log('The sample model could not be loaded.', 'error');
    await m.open({ name: 'sample-frame.ifc', bytes: await res.arrayBuffer() });
  }, [m]);

  // Revit commands (two-letter sequences, Home, Esc).
  const runCommand = useCallback(
    (cmd: CommandId) => {
      if (activeDoc) {
        if (cmd === 'fit') drawingView.current?.fit();
        else setNotice('That command works in 3D views.');
        return;
      }
      const v = viewport.current;
      const model = m.model;
      if (!v || !model) return;
      const sel = m.selection;
      const needSelection = () => {
        setNotice('Select one or more elements first.');
        return false;
      };
      switch (cmd) {
        case 'fit':
          return v.fit();
        case 'previous':
          if (!v.previousView()) setNotice('No previous view.');
          return;
        case 'zoomRegion':
          setZoomRegion(true);
          return v.startZoomRegion();
        case 'hideElement': {
          if (!sel.length) return void needSelection();
          setHidden((h) => [...new Set([...h, ...sel])]);
          return m.setSelection([]);
        }
        case 'isolateElement': {
          if (!sel.length) return void needSelection();
          const keep = new Set(sel);
          return setHidden(model.elements.filter((e) => !keep.has(e.index)).map((e) => e.index));
        }
        case 'isolateCategory': {
          if (!sel.length) return void needSelection();
          const cats = new Set(sel.map((i) => model.elements[i].category));
          return setHidden(model.elements.filter((e) => !cats.has(e.category)).map((e) => e.index));
        }
        case 'resetHidden':
          return setHidden([]);
        case 'sectionBox':
          if (sectionBox) {
            v.setSectionBox(null);
            return setSectionBox(false);
          }
          if (!sel.length) return void needSelection();
          v.setSectionBox(sel);
          setSectionBox(true);
          return v.fit(sel);
        case 'wireframe':
          return setDisplayStyle('wireframe');
        case 'hiddenLine':
          return setDisplayStyle('hiddenLine');
        case 'shaded':
          return setDisplayStyle('shaded');
        case 'consistent':
          return setDisplayStyle('consistent');
      }
    },
    [m, sectionBox, activeDoc],
  );

  useShortcut({ code: 'Escape' }, () => {
    if (activeDoc) dx.select(activeDoc.id, null);
    else if (zoomRegion) viewport.current?.cancelZoomRegion();
    else m.setSelection([]);
  });
  // Ctrl + Z: undo the last section-box edit (the only undoable action so far).
  useShortcut({ code: 'KeyZ', ctrl: true }, () => {
    if (sectionBox && !viewport.current?.undoSectionBox()) setNotice('Nothing to undo.');
  });
  useShortcut({ code: 'Home' }, () => (activeDoc ? drawingView.current?.fit() : viewport.current?.home()));
  const commandRef = useRef(runCommand);
  commandRef.current = runCommand;
  useEffect(() => {
    const read = createSequenceReader();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isEditableTarget(e.target)) return;
      if (!/^Key[A-Z]$/.test(e.code)) return;
      const cmd = read(e.code.slice(3), performance.now());
      if (cmd) {
        e.preventDefault();
        commandRef.current(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = e.currentTarget.value;
    const hit = m.find(q);
    if (hit === null) {
      setNotice(m.model ? `No element matches "${q}".` : 'Open a model first.');
      return;
    }
    m.setSelection([hit]);
    viewport.current?.fit([hit]);
    e.currentTarget.select();
  };

  const selectCategory = (c: Category) => m.selectWhere((cat) => cat === c);
  const selectLevel = (l: string) => m.selectWhere((_, level) => level === l);

  const info = m.model?.info;
  const sel = m.selection;
  const selLabel =
    !m.model || sel.length === 0
      ? 'Nothing selected'
      : sel.length === 1
        ? (() => {
            const e = m.model.elements[sel[0]];
            return `${e.category === 'Other' ? e.ifcClass : e.category} ${e.mark || e.name || e.expressId}`;
          })()
        : `${fmtCount(sel.length)} elements`;

  const load = m.load;
  return (
    <AppShell
      titleBar={
        <TitleBar
          fileName={info?.fileName ?? 'No model open'}
          saveState={info ? 'Opened from this device' : undefined}
          search={<CommandSearch ref={search} onKeyDown={onSearchKey} placeholder="Find by mark, Element ID, GlobalId or name…   Ctrl + K" />}
          actions={
            <>
              <IconButton label={`Theme: ${preference}. Switch theme`} onClick={cycle}>
                <ThemeIcon />
              </IconButton>
              <Button size="sm" disabled title="Accounts arrive with cloud features. Everything here works without one.">
                Sign in
              </Button>
            </>
          }
        />
      }
      ribbonTabs={<RibbonTabs tabs={RIBBON_TABS} activeId={ribbonTab} onChange={setRibbonTab} />}
      ribbon={
        <Ribbon label="Model">
          <RibbonGroup label="Open">
            <RibbonButton icon="ifc" label="IFC" onClick={openFromDisk} shortcutHint="opens from this device" />
            <RibbonButton icon="dxf" label="DXF" onClick={openDxfFromDisk} shortcutHint="2D view, opens from this device" />
            <RibbonButton icon="column" label="DXF → 3D" active={wins.pipeline} onClick={() => (pipe ? toggleWin('pipeline') : void pipeline.start())} shortcutHint="build an IFC model from a CH-format drawing" />
          </RibbonGroup>
          <RibbonGroup label="Structure">
            {(['column', 'beam', 'wall', 'slab', 'footing'] as const).map((k) => (
              <RibbonButton key={k} icon={k} label={k[0].toUpperCase() + k.slice(1)} twoTone disabled shortcutHint="modelling arrives in 0.2" />
            ))}
          </RibbonGroup>
          <RibbonGroup label="View">
            <RibbonButton icon="view3d" label="3D" onClick={() => viewport.current?.home()} shortcutHint="Home" />
            <RibbonButton icon="plan" label="Top" onClick={() => viewport.current?.setView('top')} />
            <RibbonButton icon="elevation" label="Front" onClick={() => viewport.current?.setView('front')} />
          </RibbonGroup>
          <RibbonGroup label="Select">
            <RibbonButton icon="byid" label="By ID" onClick={() => search.current?.focus({ preventScroll: true })} shortcutHint="Ctrl + K" />
          </RibbonGroup>
          <RibbonGroup label="Quantities">
            <RibbonButton
              icon="boq"
              label="BOQ"
              disabled={!m.model}
              active={wins.boq}
              onClick={() => toggleWin('boq')}
              shortcutHint="bill of quantities with rates and Excel export"
            />
          </RibbonGroup>
          <RibbonGroup label="Windows">
            {(
              [
                ['properties', 'properties', 'Properties'],
                ['browser', 'browser', 'Browser'],
                ['activity', 'activity', 'Activity'],
                ['console', 'console', 'Console'],
              ] as const
            ).map(([id, icon, label]) => (
              <RibbonButton key={id} icon={icon} label={label} active={openPanels.includes(id)} onClick={() => dock.current?.toggle(id)} shortcutHint="show or hide" />
            ))}
            <RibbonButton icon="keyboard" label="Keys" active={wins.keys} onClick={() => toggleWin('keys')} shortcutHint="keyboard shortcuts" />
            <RibbonButton icon="layout" label="Reset" onClick={() => dock.current?.reset()} shortcutHint="default layout: browser left, properties right" />
          </RibbonGroup>
          <RibbonGroup label="Settings">
            <RibbonButton icon="byid" label="Marks" disabled={!m.model} onClick={() => setMarkDialog(true)} shortcutHint="which property is the mark" />
          </RibbonGroup>
          <RibbonGroup label="Section">
            <RibbonButton icon="section" label="Box" active={sectionBox} disabled={!m.model} onClick={() => runCommand('sectionBox')} shortcutHint="BX" />
          </RibbonGroup>
        </Ribbon>
      }
      workspace={
        <DockWorkspace
          ref={dock}
          onChange={setOpenPanels}
          render={(id) => {
            switch (id) {
              case 'views':
                return (
                  <div className="app-views">
                    {<ViewTabs
          tabs={[
            // {3D} is the IFC model's view: closable when a model is open, hidden when only drawings are open.
            ...(m.model || !dx.docs.length ? [{ id: '3d', label: '{3D}', closable: !!m.model, color: m.model ? ifcColor ?? undefined : undefined, title: m.model ? `${info?.fileName} (close to unload the model)` : undefined }] : []),
            ...dx.docs.map((d) => ({ id: d.id, label: d.name.replace(/\.dxf$/i, ''), closable: true, color: d.color, title: `${d.name} (2D)` })),
          ]}
          activeId={activeView}
          onSelect={(id) => {
            setActiveView(id);
            setCursor(null);
          }}
          onClose={closeView}
        />}
                    <div className="sk-shell__viewport">{<div
          className={['app-drop', dragging && 'is-dragging', hidden.length > 0 && 'is-isolated'].filter(Boolean).join(' ')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            try {
              const file = await fileFromDrop(e);
              if (file?.kind === 'dxf') await openDrawing(file);
              else if (file) await m.open(file);
            } catch (err) {
              setNotice(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          {dx.docs.map((d) =>
            d.id === activeView ? <DrawingView key={d.id} ref={drawingView} doc={d} onCursor={(x, y) => setCursor({ x, y })} onSelect={(e) => dx.select(d.id, e)} /> : null,
          )}
          <div className="app-view3d" hidden={activeDoc !== null}>
          <Viewport
            ref={viewport}
            model={m.model}
            selection={sel}
            hidden={hidden}
            displayStyle={displayStyle}
            onPick={m.pick}
            onBoxSelect={m.boxSelect}
            onZoomRegionEnd={() => setZoomRegion(false)}
          />
          </div>
          {!activeDoc && m.model && (hidden.length || sectionBox || zoomRegion) ? (
            <div className="app-viewstate" role="status">
              {hidden.length ? <span>Temporary hide/isolate · HR resets</span> : null}
              {sectionBox ? <span>Section box · BX removes</span> : null}
              {zoomRegion ? <span>Drag a region to zoom · Esc cancels</span> : null}
            </div>
          ) : null}
          {load.status === 'idle' && !m.model && !activeDoc && !dx.loading ? (
            <div className="app-overlay">
              <p className="app-overlay__title">Open an IFC model or a DXF drawing</p>
              <p className="app-overlay__text">Drop an .ifc or .dxf file here, or choose one. Files are read on this device and never uploaded.</p>
              <div className="app-overlay__actions">
                <Button variant="primary" onClick={openFromDisk}>
                  Open IFC file
                </Button>
                <Button onClick={openDxfFromDisk}>Open DXF drawing</Button>
                <Button onClick={openSample}>Try the sample frame</Button>
              </div>
            </div>
          ) : null}
          {load.status === 'loading' ? (
            <div className="app-overlay" role="status" aria-live="polite">
              <p className="app-overlay__title">Opening {load.fileName}</p>
              <p className="app-overlay__text">
                {load.total ? `${fmtCount(load.done)} of ${fmtCount(load.total)} elements` : 'Reading the file…'}
              </p>
              <div className="app-progress" aria-hidden="true">
                <div className="app-progress__bar" style={{ width: `${load.total ? (100 * load.done) / load.total : 5}%` }} />
              </div>
            </div>
          ) : null}
          {dx.loading ? (
            <div className="app-overlay" role="status" aria-live="polite">
              <p className="app-overlay__title">Opening {dx.loading.name}</p>
              <p className="app-overlay__text">{dx.loading.phase}</p>
              <div className="app-progress app-progress--busy" aria-hidden="true">
                <div className="app-progress__bar" />
              </div>
            </div>
          ) : null}
          {load.status === 'error' && !activeDoc ? (
            <div className="app-overlay" role="alert">
              <p className="app-overlay__title">That file didn’t open</p>
              <p className="app-overlay__text">{load.message}</p>
              <div className="app-overlay__actions">
                <Button variant="primary" onClick={openFromDisk}>
                  Choose another file
                </Button>
              </div>
            </div>
          ) : null}
          <FloatingWindow id="boq" title="Bill of quantities" subtitle={m.model?.info.fileName} accent={ifcColor ?? undefined} open={wins.boq} onClose={() => toggleWin('boq', false)} initial={{ w: 1080, h: 540 }} minWidth={560} minHeight={280}>
            {m.model ? (
                  <BoqWindow
                    model={m.model}
                    rates={rates}
                    onRates={changeRates}
                    selection={sel}
                    onSelect={boqSelect}
                    markRules={m.markRules}
                    gradeRules={m.gradeRules}
                    appVersion={APP_VERSION}
                    onEditGradeRules={() => setGradeDialog(true)}
                    onLog={m.log}
                  />
                ) : (
                  <p className="app-empty-note">Open an IFC model to see its bill of quantities.</p>
                )}
          </FloatingWindow>
          <FloatingWindow id="pipeline" title="DXF → 3D" subtitle={pipe?.fileName} open={wins.pipeline} onClose={() => toggleWin('pipeline', false)} initial={{ w: 1000, h: 560 }} minWidth={560} minHeight={300}>
            {(
                  <PipelinePanel
                    state={pipe}
                    onPick={() => void pipeline.start()}
                    onName={pipeline.setName}
                    onHeight={pipeline.setHeight}
                    onBuild={() => void pipeline.build()}
                    onDownload={pipeline.download}
                    onShow={showQa}
                  />
                )}
          </FloatingWindow>
          <FloatingWindow id="keys" title="Keyboard shortcuts" open={wins.keys} onClose={() => toggleWin('keys', false)} initial={{ w: 520, h: 560 }} minWidth={360}>
            {(
                  <table className="app-keys">
                    <tbody>
                      {SHORTCUT_HELP.map((k) => (
                        <tr key={k.keys}>
                          <th scope="row">{k.keys}</th>
                          <td>{k.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
          </FloatingWindow>
          <MarkRulesDialog open={markDialog} rules={m.markRules} defaults={DEFAULT_MARK_RULES} elements={m.model?.elements ?? []} onSave={(r) => void m.setMarkRules(r)} onClose={() => setMarkDialog(false)} />
          <MarkRulesDialog
            open={gradeDialog}
            title="Grade rules"
            intro="Property names read as the concrete grade, first match wins; elements with no match use their IFC material name."
            rules={m.gradeRules}
            defaults={DEFAULT_GRADE_RULES}
            sourceField="gradeSource"
            elements={m.model?.elements ?? []}
            onSave={(r) => void m.setGradeRules(r)}
            onClose={() => setGradeDialog(false)}
          />
          {notice ? (
            <p className="app-notice" role="status">
              {notice}
            </p>
          ) : null}
        </div>}</div>
                    <div className="sk-shell__viewbar">{activeDoc ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => drawingView.current?.fit()} title="Zoom extents (ZF, Home, double middle-click)">
              Fit
            </Button>
            <span className="app-spacer" />
            <span className="app-hint">2D · Middle-drag pan · Wheel zoom · Double middle-click fit · Alt + drag on a trackpad</span>
          </>
        ) : (
        <>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.fit()} title="Zoom to fit (ZF)">
            Fit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.home()} title="Default 3D view (Home)">
            Home
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.setView('top')}>
            Top
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.setView('front')}>
            Front
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.setView('right')}>
            Right
          </Button>
          <span className="app-divider" aria-hidden="true" />
          <div className="app-segmented" role="radiogroup" aria-label="Visual style">
            {STYLES.map((st) => (
              <button
                key={st.id}
                type="button"
                role="radio"
                aria-checked={displayStyle === st.id}
                className={displayStyle === st.id ? 'is-active' : undefined}
                title={`${st.label} (${st.keys})`}
                onClick={() => setDisplayStyle(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>
          <span className="app-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" onClick={() => runCommand('sectionBox')} disabled={!m.model || (!sectionBox && !sel.length)} title="Section box around the selection (BX)">
            Section box: {sectionBox ? 'On' : 'Off'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => runCommand('resetHidden')} disabled={!hidden.length} title="Reset temporary hide/isolate (HR)">
            Reset hidden
          </Button>
        </>
        )}</div>
                  </div>
                );
              case 'properties':
                return activeDoc ? (
                  <DrawingProperties doc={activeDoc} onUnits={(u) => dx.update(activeDoc.id, { units: u })} />
                ) : (
                  <PropertiesPanel model={m.model} selection={sel} properties={m.properties} onEditMarkRules={() => setMarkDialog(true)} />
                );
              case 'browser':
                return activeDoc ? (
                  <LayersPanel doc={activeDoc} onChange={(on) => dx.update(activeDoc.id, { layerOn: on })} />
                ) : (
                  <Browser model={m.model} onSelectLevel={selectLevel} onSelectCategory={selectCategory} />
                );
              case 'activity':
                return m.activity.length ? (
                  <ol className="app-activity">
                    {m.activity.map((a) => (
                      <li key={a.id} className={a.tone === 'error' ? 'is-error' : undefined}>
                        <time>{a.time.toLocaleTimeString()}</time> {a.text}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="app-empty-note">Nothing yet. Open a model and its load times appear here.</p>
                );
              case 'console':
                return (
                  <ConsolePanel
                    model={m.model}
                    selection={sel}
                    onAction={(a) => {
                      const ids = a.indices ?? [];
                      if (a.type === 'select') m.setSelection(ids);
                      else if (a.type === 'isolate' && m.model) {
                        const keep = new Set(ids);
                        setHidden(m.model.elements.filter((e) => !keep.has(e.index)).map((e) => e.index));
                      } else if (a.type === 'hide') setHidden((h) => [...new Set([...h, ...ids])]);
                      else if (a.type === 'reset') setHidden([]);
                      else if (a.type === 'fit') viewport.current?.fit(a.indices ?? undefined);
                    }}
                  />
                );
              default:
                return null;
            }
          }}
        />
      }
      statusBar={
        <StatusBar>
          {activeDoc ? (
            <>
              <span className="app-coords" aria-label="Cursor position">
                {cursor ? `X ${cursor.x.toFixed(1)}   Y ${cursor.y.toFixed(1)}` : 'X —   Y —'} {activeDoc.units}
              </span>
              <span className="app-divider" aria-hidden="true" />
              <StatusChip>Layers {fmtCount(activeDoc.layerOn.filter(Boolean).length)} / {fmtCount(activeDoc.layerOn.length)} on</StatusChip>
            </>
          ) : (
          <>
          <span className="app-sel">
            {sel.length ? <span className="app-sel__dot" aria-hidden="true" /> : null}
            {selLabel}
          </span>
          {info ? <span className="app-divider" aria-hidden="true" /> : null}
          {info
            ? Object.entries(info.categories).map(([c, n]) => (
                <StatusChip key={c}>
                  {CATEGORY_PLURAL[c as Category]} {fmtCount(n ?? 0)}
                </StatusChip>
              ))
            : null}
          </>
          )}
          <span className="app-spacer" />
          <LocalIndicator />
          <span className="app-divider" aria-hidden="true" />
          <button
            type="button"
            className="app-panel-toggle"
            aria-pressed={openPanels.includes('console')}
            title="Show or hide the bottom panels (Ctrl + `)"
            onClick={() => dock.current?.toggleBottom()}
          >
            Panel
          </button>
          <span className="app-divider" aria-hidden="true" />
          <span className="app-faint">
            {activeDoc ? `DXF ${activeDoc.drawing.info.release} · ` : info ? `${info.schema} · ${info.units.length} · ` : ''}v{APP_VERSION} · engine {ENGINE_VERSION}
          </span>
        </StatusBar>
      }
    />
  );
}
