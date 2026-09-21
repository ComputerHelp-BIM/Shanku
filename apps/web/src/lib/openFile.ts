export interface PickedFile {
  name: string;
  bytes: ArrayBuffer;
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
  const picker = (window as unknown as { showOpenFilePicker?: Picker }).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        types: [{ description: 'IFC model', accept: { 'application/x-step': ['.ifc'] } }],
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
    input.accept = '.ifc';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, bytes: await file.arrayBuffer() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function fileFromDrop(e: { dataTransfer: DataTransfer | null }): Promise<PickedFile | null> {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return null;
  if (!file.name.toLowerCase().endsWith('.ifc')) throw new Error(`${file.name} is not an .ifc file. DXF import arrives in the next release.`);
  return { name: file.name, bytes: await file.arrayBuffer() };
}
