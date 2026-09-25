export interface PickedFile {
  name: string;
  bytes: ArrayBuffer;
}

export type FileKind = 'ifc' | 'dxf';

export function kindOf(name: string): FileKind | 'dwg' | null {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'ifc' || ext === 'dxf' || ext === 'dwg' ? ext : null;
}

type Picker = (options: {
  types: Array<{ description: string; accept: Record<string, string[]> }>;
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}) => Promise<Array<{ getFile: () => Promise<File> }>>;

/**
 * Asks the user for an .ifc file. Uses the File System Access API where available
 * (Chrome, Edge) and a hidden file input elsewhere. Resolves null if cancelled.
 * The file is read locally; nothing is uploaded.
 */
export async function pickIfcFile(): Promise<PickedFile | null> {
  return pickFile('ifc');
}

/** Opens the system file picker for one IFC or DXF file. */
export async function pickFile(kind: FileKind): Promise<PickedFile | null> {
  const accept: Record<string, string[]> = kind === 'ifc' ? { 'application/x-step': ['.ifc'] } : { 'image/vnd.dxf': ['.dxf'] };
  const description = kind === 'ifc' ? 'IFC model' : 'DXF drawing';
  const picker = (window as unknown as { showOpenFilePicker?: Picker }).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        types: [{ description, accept }],
        multiple: false,
      });
      const file = await handle.getFile();
      return { name: file.name, bytes: await file.arrayBuffer() };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.${kind}`;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, bytes: await file.arrayBuffer() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function fileFromDrop(e: { dataTransfer: DataTransfer | null }): Promise<(PickedFile & { kind: FileKind | 'other' }) | null> {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return null;
  const kind = kindOf(file.name);
  // Anything that is not IFC or DXF comes back as 'other', so the app can say what it is and how to export it.
  return { name: file.name, bytes: await file.arrayBuffer(), kind: kind === 'ifc' || kind === 'dxf' ? kind : 'other' };
}
