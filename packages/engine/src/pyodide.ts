/**
 * The one Pyodide build Shanku uses (DXF reader, DXF -> 3D pipeline, Python console).
 * Loaded on first use from jsDelivr and cached by the browser; the drawing never leaves the device.
 */
export const PYODIDE_VERSION = '0.27.7';
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
