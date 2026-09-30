import { STYLES } from '../../app/constants';
import { withTask, updateTask } from '../../lib/progress';
import { SAMPLES } from '../../lib/samples';
import { loadModel } from '../../lib/session';
import { myShares, shareInfo, type Retention, setTeamCode, shareModel, RETENTION_LABEL, readModelParam, openShared } from '../../lib/sharedModel';
import { type useShankuModel } from '../../lib/useShankuModel';
import { type ViewToken, hiddenForLink, viewLinkUrl, decodeViewToken } from '../../lib/viewLink';
import { isTwoD } from '../../lib/views';
import { type DisplayStyle, boxState, type CameraState, type ExplodeMode, EXPLODE_MODES } from '@shanku/engine';
import { useState, useRef, useEffect } from 'react';

export interface ViewLinksDeps {
  activeDoc: import('../../lib/useDrawings').DrawingDoc | null;
  activeModelView: import('../../lib/views').ModelView | null;
  displayStyle: import('../../../../../packages/engine/src/render/Viewer').DisplayStyle;
  explode: { modes: import('../../../../../packages/engine/src/render/explode').ExplodeMode[]; amount: number; } | null;
  hidden: number[];
  m: ReturnType<typeof useShankuModel>;
  openSample: (sample?: import('../../lib/samples').SampleBuilding) => Promise<void>;
  openView: (id: string) => void;
  setActiveView: React.Dispatch<React.SetStateAction<string>>;
  setDisplayStyle: React.Dispatch<React.SetStateAction<import('../../../../../packages/engine/src/render/Viewer').DisplayStyle>>;
  setExplode: React.Dispatch<React.SetStateAction<{ modes: import('../../../../../packages/engine/src/render/explode').ExplodeMode[]; amount: number; } | null>>;
  setHidden: React.Dispatch<React.SetStateAction<number[]>>;
  setMyShareList: React.Dispatch<React.SetStateAction<import('../../lib/sharedModel').MyShare[]>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setSectionBox: React.Dispatch<React.SetStateAction<boolean>>;
  setShareInfoState: React.Dispatch<React.SetStateAction<import('../../lib/sharedModel').ShareInfo | null>>;
  viewport: React.RefObject<import('../../components/Viewport').ViewportHandle>;
  views: import('../../lib/views').ModelView[];
}

export function useViewLinks(deps: ViewLinksDeps) {
  const { activeDoc, activeModelView, displayStyle, explode, hidden, m, openSample, openView, setActiveView, setDisplayStyle, setExplode, setHidden, setMyShareList, setNotice, setSectionBox, setShareInfoState, viewport, views } = deps;

  // ---- View links (Structura item 14) ----
  const [linkDialog, setLinkDialog] = useState<{ mode: 'copy' | 'open'; link: string } | null>(null);
  /** A link opened before its model: applied once that model loads. */
  const pendingLink = useRef<ViewToken | null>(null);
  /** A view link waiting for its model, shown on the start page (models are never in a link). */
  const [linkFor, setLinkFor] = useState<ViewToken | null>(null);

  /** The current view as a link token: view, camera, section box, style, selection, temporary hide/isolate, explode. */
  const currentViewToken = (): ViewToken | null => {
    const model = m.model;
    const vp = viewport.current;
    if (!model || !vp) return null;
    const cam = vp.getCamera();
    const box = isTwoD(activeModelView ?? undefined) ? null : vp.sectionBoxState();
    const hid = new Set(hidden);
    const r4 = (v: number) => Math.round(v * 1e4) / 1e4; // 0.1 mm and plenty for angles: keeps links short
    return {
      v: 1,
      file: model.info.fileName,
      view: activeModelView?.id,
      camera: cam ? [cam.position.x, cam.position.y, cam.position.z, cam.target.x, cam.target.y, cam.target.z, cam.zoom, cam.frameHeight, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w].map(r4) : undefined,
      box: box ? [box.center.x, box.center.y, box.center.z, box.half.x, box.half.y, box.half.z, box.angle].map(r4) : undefined,
      style: displayStyle,
      select: m.selection.length ? m.selection.map((i) => model.elements[i].globalId) : undefined,
      hide: hiddenForLink(
        hidden.map((i) => model.elements[i].globalId),
        model.elements.filter((e) => !hid.has(e.index)).map((e) => e.globalId),
      ),
      explode: explode ? { modes: explode.modes, amount: explode.amount } : undefined,
    };
  };

  const copyViewLink = async () => {
    const t = currentViewToken();
    if (!t) return setNotice('Open a model first; a view link needs a view.');
    const link = viewLinkUrl(window.location.href, t);
    try {
      await navigator.clipboard.writeText(link);
      setNotice(`View link copied. Anyone who opens it with ${t.file} sees this view.`);
    } catch {
      /* clipboard blocked: the dialog shows it to copy by hand */
    }
    // the dialog: the link, and sharing it with the model for someone without the file (opt-in)
    setLinkDialog({ mode: 'copy', link });
    setShareInfoState(null);
    setMyShareList(myShares());
    void shareInfo().then(setShareInfoState);
  };

  /** Encrypts and uploads the open model with the view link (opt-in); returns the full link. */
  const shareOpenModel = async (retention: Retention, teamCode: string): Promise<string> => {
    if (!m.model || !linkDialog) throw new Error('Open a model first.');
    if (teamCode) setTeamCode(teamCode);
    const saved = await loadModel();
    if (!saved || saved.name !== m.model.info.fileName) throw new Error('The open model’s file is not kept on this device any more; open it again, then share.');
    const share = await withTask('share', 'Sharing the model', 'Encrypting on this device…', () => shareModel(new Uint8Array(saved.bytes), saved.name, retention, linkDialog.link, (step) => updateTask('share', { phase: step })));
    setMyShareList(myShares());
    m.log(`Shared ${saved.name} with its view (${RETENTION_LABEL[retention].toLowerCase()}); the key is only in the link.`);
    return share.link;
  };

  /** Applies a link to the open model; elements are matched by GlobalId, so a re-export still works. */
  const applyViewToken = (t: ViewToken) => {
    const model = m.model;
    if (!model) {
      pendingLink.current = t;
      return setNotice(`This link shows a view of ${t.file}. Open that file to see it.`);
    }
    pendingLink.current = null;
    setLinkFor(null);
    const byId = new Map(model.elements.map((e) => [e.globalId, e.index]));
    const indices = (ids: readonly string[] = []) => ids.map((g) => byId.get(g)).filter((i): i is number => i !== undefined);
    const wanted = [...(t.select ?? []), ...(t.hide?.ids ?? [])];
    const found = indices(wanted).length;
    if (t.view && t.view !== activeModelView?.id && views.some((v) => v.id === t.view)) openView(t.view);
    else if (activeDoc) setActiveView('3d');
    setTimeout(() => {
      const vp = viewport.current;
      if (!vp) return;
      if (t.style && STYLES.some((st) => st.id === t.style)) setDisplayStyle(t.style as DisplayStyle);
      if (t.hide) {
        const ids = new Set(indices(t.hide.ids));
        setHidden(t.hide.mode === 'isolate' ? model.elements.filter((e) => !ids.has(e.index)).map((e) => e.index) : [...ids]);
      } else setHidden([]);
      m.setSelection(indices(t.select));
      if (t.box && !isTwoD(activeModelView ?? undefined)) {
        const [cx, cy, cz, hx, hy, hz, angle] = t.box;
        vp.setSectionBoxState(boxState([cx, cy, cz], [hx, hy, hz], angle));
        setSectionBox(true);
      }
      if (t.camera) {
        const c = t.camera;
        vp.setCamera({ position: { x: c[0], y: c[1], z: c[2] }, target: { x: c[3], y: c[4], z: c[5] }, zoom: c[6], frameHeight: c[7], quaternion: { x: c[8], y: c[9], z: c[10], w: c[11] } } as unknown as CameraState);
      }
      const modes = (t.explode?.modes ?? []).filter((md): md is ExplodeMode => EXPLODE_MODES.some((x) => x.id === md));
      setExplode(modes.length && t.explode ? { modes, amount: t.explode.amount } : null);
      const other = t.file !== model.info.fileName ? ` It was made on ${t.file}.` : '';
      setNotice(
        wanted.length && !found
          ? `None of the link's elements are in ${model.info.fileName}; only the camera was applied.${other}`
          : `Showing the shared view.${other}${t.partial ? ' The link held only part of the selection or hidden elements.' : ''}`,
      );
    }, 120);
  };

  // A link opened in the address bar: read it once, then apply it when (or if) its model is open.
  useEffect(() => {
    const t = decodeViewToken(window.location.hash);
    if (!t) return;
    const shared = readModelParam(window.location.hash);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#app`); // the link is used; keep the address clean
    pendingLink.current = t;
    if (shared) {
      // the link carries the model (encrypted): download, decrypt here, open; the view then applies
      void (async () => {
        try {
          const f = await withTask('share', `Opening ${t.file}`, 'Finding the shared model…', () => openShared(shared.id, shared.key, (step) => updateTask('share', { phase: step })));
          await m.open({ name: f.name, bytes: f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer });
          m.log(`Opened the shared model ${f.name} from a link (decrypted on this device).`);
        } catch (e) {
          setLinkFor(t);
          setNotice(`${(e as Error).message} Open ${t.file} to see the view.`);
        }
      })();
      return;
    }
    setLinkFor(t);
    // A sample building's link opens the sample itself (anyone can load it); any other model has to be
    // opened by the reader: models stay on each device and are never in a link.
    const bare = (n: string) => n.toLowerCase().replace(/\.gz$/, '');
    const sample = SAMPLES.find((smp) => bare(smp.file) === bare(t.file));
    if (sample && !m.model) void openSample(sample);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (m.model && pendingLink.current) {
      const t = pendingLink.current;
      setTimeout(() => applyViewToken(t), 300); // after the default view is set up
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.model]);

  return { applyViewToken, copyViewLink, linkDialog, linkFor, pendingLink, setLinkDialog, setLinkFor, shareOpenModel };
}
