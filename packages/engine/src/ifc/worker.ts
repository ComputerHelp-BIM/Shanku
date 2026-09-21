/// <reference lib="webworker" />
// IFC worker: owns web-ifc so parsing never blocks the UI thread.
import * as WebIFC from 'web-ifc';
import type { ModelUnits } from '../model/types';
import { parseIfc, readProperties } from './parse';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const api = new WebIFC.IfcAPI();
let ready: Promise<void> | null = null;
let modelID: number | null = null;
let units: ModelUnits = { length: 'm', area: 'm²', volume: 'm³' };

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      api.SetWasmPath(msg.wasmPath, true);
      ready = api.Init(undefined, true).then(() => {
        api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF);
      });
      await ready;
      post({ type: 'ready' });
      return;
    }
    if (!ready) throw new Error('IFC engine is not initialised.');
    await ready;

    if (msg.type === 'open') {
      if (modelID !== null) api.CloseModel(modelID);
      const { modelID: id, model } = parseIfc(api, new Uint8Array(msg.bytes), {
        fileName: msg.fileName,
        onProgress: (done, total) => post({ type: 'progress', requestId: msg.requestId, done, total }),
      });
      modelID = id;
      units = model.info.units;
      post({ type: 'opened', requestId: msg.requestId, model }, [
        model.mesh.positions.buffer,
        model.mesh.normals.buffer,
        model.mesh.elementIds.buffer,
        model.mesh.indices.buffer,
        model.edges.positions.buffer,
        model.edges.elementIds.buffer,
      ]);
      return;
    }
    if (msg.type === 'properties') {
      if (modelID === null) throw new Error('No model is open.');
      const groups = await readProperties(api, modelID, msg.expressId, units);
      post({ type: 'properties', requestId: msg.requestId, groups });
      return;
    }
    if (msg.type === 'close' && modelID !== null) {
      api.CloseModel(modelID);
      modelID = null;
    }
  } catch (err) {
    const requestId = 'requestId' in msg ? msg.requestId : null;
    post({ type: 'error', requestId, message: err instanceof Error ? err.message : String(err) });
  }
};
