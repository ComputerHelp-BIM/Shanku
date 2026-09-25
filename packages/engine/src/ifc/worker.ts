/// <reference lib="webworker" />
// IFC worker: owns web-ifc so parsing never blocks the UI thread.
import * as WebIFC from 'web-ifc';
import type { ModelUnits } from '../model/types';
import { parseIfc, readProperties } from './parse';
import { alignPatch } from '../model/merge';
import { detectMarks } from './marks';
import { readMaterials } from './quantities';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const api = new WebIFC.IfcAPI();
let ready: Promise<void> | null = null;
let modelID: number | null = null;
/** Open files by slot: 0 the model, 1+ updates merged into it (their elements carry the slot). */
let slots: number[] = [];
let baseCoordination: number[] | undefined;
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

    if (msg.type === 'open' && msg.patch) {
      if (modelID === null) throw new Error('No model is open to update.');
      const parsed = parseIfc(api, new Uint8Array(msg.bytes), {
        fileName: msg.fileName,
        markRules: msg.markRules,
        gradeRules: msg.gradeRules,
      });
      const slot = slots.length;
      slots.push(parsed.modelID);
      for (const e of parsed.model.elements) e.source = slot;
      const model = alignPatch(parsed.model, baseCoordination);
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
    if (msg.type === 'open') {
      for (const id of slots) api.CloseModel(id); // the model and any updates
      slots = [];
      const { modelID: id, model } = parseIfc(api, new Uint8Array(msg.bytes), {
        fileName: msg.fileName,
        markRules: msg.markRules,
        gradeRules: msg.gradeRules,
        onProgress: (done, total) => post({ type: 'progress', requestId: msg.requestId, done, total }),
      });
      modelID = id;
      slots = [id];
      baseCoordination = model.coordination;
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
      const groups = await readProperties(api, slots[msg.source ?? 0] ?? modelID, msg.expressId, units);
      post({ type: 'properties', requestId: msg.requestId, groups });
      return;
    }
    if (msg.type === 'marks') {
      if (modelID === null) throw new Error('No model is open.');
      const r = detectMarks(api, modelID, msg.rules);
      post({ type: 'marks', requestId: msg.requestId, marks: [...r.byExpressId].map(([id, [v, src]]) => [id, v, src]) });
      return;
    }
    if (msg.type === 'grades') {
      if (modelID === null) throw new Error('No model is open.');
      const r = detectMarks(api, modelID, msg.rules);
      const typeIdOf = new Map<number, number>();
      const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE);
      for (let i = 0; i < rels.size(); i++) {
        const rel = api.GetLine(modelID, rels.get(i));
        const t = rel.RelatingType?.value;
        for (const o of rel.RelatedObjects ?? []) if (t) typeIdOf.set(o.value, t);
      }
      const mats = readMaterials(api, modelID, typeIdOf);
      const out: Array<[number, string, string]> = [];
      const ids = new Set([...r.byExpressId.keys(), ...mats.keys()]);
      for (const id of ids) {
        const hit = r.byExpressId.get(id);
        out.push(hit ? [id, hit[0], hit[1]] : [id, mats.get(id)!, 'IfcMaterial']);
      }
      post({ type: 'grades', requestId: msg.requestId, grades: out });
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
