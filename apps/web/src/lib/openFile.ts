export interface PickedFile {
  name: string;
  bytes: ArrayBuffer;
}

export type FileKind = 'ifc' | 'dxf';

export function kindOf(name: string): FileKind | 'dwg' | null {
  const ext = name.toLowerCase().replace(/\.gz$/, '').split('.').pop();
  return ext === 'ifc' || ext === 'dxf' || ext === 'dwg' ? ext : null;
}

/** Is this gzip data (the 1F 8B magic number)? */
export const isGzip = (bytes: ArrayBuffer) => {
  const b = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  return b.length === 2 && b[0] === 0x1f && b[1] === 0x8b;
};

/**
 * A gzipped model (.ifc.gz, as the sample buildings are served) unpacked in the browser; anything
 * else is returned as it is. The name loses its .gz so the file reads as what it contains.
 */
export async function unpack(file: PickedFile): Promise<PickedFile> {
  if (!isGzip(file.bytes)) return file;
  const stream = new Blob([file.bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return { name: file.name.replace(/\.gz$/i, ''), bytes: await new Response(stream).arrayBuffer() };
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
  const accept: Record<string, string[]> = kind === 'ifc' ? { 'application/x-step': ['.ifc'], 'application/gzip': ['.gz'] } : { 'image/vnd.dxf': ['.dxf'] };
  const description = kind === 'ifc' ? 'IFC model' : 'DXF drawing';
  const picker = (window as unknown as { showOpenFilePicker?: Picker }).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        types: [{ description, accept }],
        multiple: false,
      });
      const file = await handle.getFile();
      return unpack({ name: file.name, bytes: await file.arrayBuffer() });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'ifc' ? '.ifc,.gz' : `.${kind}`;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await unpack({ name: file.name, bytes: await file.arrayBuffer() }) : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function fileFromDrop(e: { dataTransfer: DataTransfer | null }): Promise<(PickedFile & { kind: FileKind | 'other' }) | null> {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return null;
  const kind = kindOf(file.name);
  const picked = await unpack({ name: file.name, bytes: await file.arrayBuffer() });
  // Anything that is not IFC or DXF comes back as 'other', so the app can say what it is and how to export it.
  return { ...picked, kind: kind === 'ifc' || kind === 'dxf' ? kind : 'other' };
}
