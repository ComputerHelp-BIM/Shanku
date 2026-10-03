import { pickIfcFile, unpack } from '../../lib/openFile';
import { type SampleBuilding, SAMPLES, sampleUrl } from '../../lib/samples';
import { type useShankuModel } from '../../lib/useShankuModel';
import { useCallback, useRef, useEffect, useState } from 'react';

export interface FileOpeningDeps {
  diagnosedFor: React.MutableRefObject<string>;
  m: ReturnType<typeof useShankuModel>;
  openDrawing: (file: { name: string; bytes: ArrayBuffer; }) => Promise<void>;
  openModelFile: (file: { name: string; bytes: ArrayBuffer; }) => Promise<void>;
  start: import('../../App').AppStart | undefined;
}

export function useFileOpening(deps: FileOpeningDeps) {
  const { diagnosedFor, m, openDrawing, openModelFile, start } = deps;

  const openFromDisk = useCallback(async () => {
    try {
      const file = await pickIfcFile();
      if (file) {
        diagnosedFor.current = '';
        await openModelFile(file);
      }
    } catch (e) {
      m.log(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [m]);

  // Ctrl + O opens (Revit's; the browser's own Open File is replaced while cad2bim is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openFromDisk();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openFromDisk]);

  // Homepage hand-off: open what the visitor dropped or chose, once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !start) return;
    started.current = true;
    const f = start.file;
    if (f && /\.dxf$/i.test(f.name)) void openDrawing(f);
    else if (f) void unpack(f).then(openModelFile); // an .ifc.gz dropped on the homepage opens too
    else if (start.sample) void openSampleRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  /** Opens a sample building (the small frame by default); large ones are served gzipped and unpacked here. */
  const [sampleBusy, setSampleBusy] = useState<string | null>(null);
  const openSample = useCallback(async (sample: SampleBuilding = SAMPLES[0]) => {
    setSampleBusy(sample.id);
    try {
      const res = await fetch(sampleUrl(sample));
      if (!res.ok) return m.log(`The sample ${sample.title} could not be loaded.`, 'error');
      const file = await unpack({ name: sample.file, bytes: await res.arrayBuffer() });
      diagnosedFor.current = '';
      await m.open(file);
    } catch (e) {
      m.log(`The sample ${sample.title} could not be opened: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSampleBusy(null);
    }
  }, [m]);
  const openSampleRef = useRef(openSample);
  openSampleRef.current = openSample;

  return { openFromDisk, openSample, sampleBusy };
}
