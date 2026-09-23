import { useState, type DragEvent } from 'react';
import { ThemeIcon, useTheme } from '@shanku/ui';
import { ShankuMark } from '@shanku/ui';
import type { AppStart } from '../App';
import './home.css';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/Shanku-BIM/Shanku';

const STEPS = [
  ['Drop in a file', 'An IFC model exported from Revit, or a DXF drawing. It opens on your machine; nothing is uploaded.'],
  ['Explore in 3D', 'Revit navigation and shortcuts: ViewCube, section box, isolate, hide, visual styles.'],
  ['Check quantities', 'Concrete volumes by level, category and grade, with rates, overrides and amounts.'],
  ['Export', 'An Excel BOQ with live formulas, or an IFC4 model built from your DXF.'],
] as const;

const TOOLS = [
  ['IFC viewer', 'IFC2x3 and IFC4 from Revit and other tools; 50,000 elements stay smooth.'],
  ['Revit navigation', 'ViewCube, orbit, pan, zoom, HI / HH / IC / BX and the rest of the two-letter shortcuts.'],
  ['Section box', 'Arrow grips on every face, plan rotation, capped cuts, undo.'],
  ['DXF 2D viewer', 'AutoCAD-like linework with layers; click any object for its properties.'],
  ['DXF → 3D', 'Turns drawings in the Computer Help format into an IFC4 model, with checks you can zoom to.'],
  ['BOQ and rates', 'Element-wise quantities and dimensions, item rates with per-element overrides.'],
  ['Excel export', 'Summary, Levels, Elements and Rates as Excel Tables with live formulas.'],
  ['Python console', 'Query the model with Python in the browser: elements, levels, BOQ, select and isolate.'],
  ['Marks and grades', 'Detected from Mark, ID, Comments or any parameter you choose.'],
  ['Undo, done right', 'Every change is a named transaction, like Revit: undo and redo from the history list.'],
] as const;

const SHOTS = [
  ['shot-3d', 'A structural frame in the 3D view', 'Revit-style workspace: ribbon, Project browser, Properties, ViewCube.'],
  ['shot-boq', 'Bill of quantities window', 'Quantities, dimensions, rates and amounts for every element.'],
  ['shot-section', 'Section box with grips', 'Drag an arrow to move a face; the cut updates live.'],
  ['shot-console', 'Python console', 'Ask the model questions in Python; answers come back as tables.'],
] as const;

const THEME_LABEL = { system: 'Theme: Auto (follows your system). Click to change', paper: 'Theme: Light. Click to change', ink: 'Theme: Dark. Click to change' } as const;

const SPECS = [
  ['Opens', 'IFC2x3, IFC4 (IFC4x3 experimental), DXF from AutoCAD R12 to 2018+'],
  ['Exports', 'Excel BOQ (.xlsx), IFC4 from DXF'],
  ['Largest tested', '51,280 elements open in 3.9 s; a 23.6 MB DXF with 505,000 lines in 26 s'],
  ['Where it runs', 'Entirely in your browser. Files are read on your device and never uploaded.'],
  ['Browsers', 'Chrome and Edge (full), Firefox and Safari (open and save by upload and download)'],
  ['Not yet', 'DWG (save as DXF first), editing elements, reinforcement and BBS'],
] as const;

const FAQ = [
  ['Is it free?', 'Yes. Open the app and start; there is no account and no paywall for anything shown here.'],
  ['Do I need to install anything?', 'No. It runs in the browser. The first DXF or Python console session downloads about 15 MB of Python once; the browser keeps it.'],
  ['Are my files uploaded?', 'No. Models and drawings are read on your device. Nothing leaves it unless you download a file yourself.'],
  ['Which IFC export should I use from Revit?', 'IFC4 Reference View [Structural] with base quantities and Revit property sets on. The app rates every file it opens and tells you what to change.'],
  ['Can it open DWG?', 'Not directly. Save as DXF in AutoCAD, or use the free ODA File Converter, then open the DXF.'],
  ['Does it work offline?', 'After the first visit mostly yes; Python for DXF files is fetched once from a public CDN.'],
] as const;

export function Home({ onOpen }: { onOpen: (start?: AppStart) => void }) {
  const { preference, resolved, cycle } = useTheme();
  // Screenshots come in both themes, so the page never shows a light app on a dark page.
  const shot = (name: string) => `${BASE}home/${name}-${resolved === 'ink' ? 'ink' : 'paper'}.webp`;
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!/\.(ifc|dxf)$/i.test(f.name)) return setNote(`${f.name} is not an .ifc or .dxf file.`);
    onOpen({ file: { name: f.name, bytes: await f.arrayBuffer() } });
  };

  return (
    <div className="home">
      <header className="home-nav">
        <a className="home-brand" href="#top" aria-label="Shanku home">
          <ShankuMark size={28} />
          <span>shanku</span>
        </a>
        <nav aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#specs">Specs</a>
          <a href="#faq">FAQ</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <button type="button" className="home-btn home-btn--icon" onClick={cycle} title={THEME_LABEL[preference]} aria-label={THEME_LABEL[preference]}>
          <ThemeIcon preference={preference} size={16} />
        </button>
        <button type="button" className="home-btn home-btn--primary" onClick={() => onOpen()}>
          Open Shanku
        </button>
      </header>

      <main id="top">
        <section className="home-hero">
          <p className="home-badge">Free · No install · Your files never leave your device</p>
          <h1>
            Structural BIM, <em>right in your browser</em>
          </h1>
          <p className="home-lede">Open Revit IFC models and CAD drawings, navigate like Revit, check quantities and export a BOQ to Excel. Nothing to install.</p>
          <div className="home-cta">
            <button type="button" className="home-btn home-btn--primary home-btn--lg" onClick={() => onOpen()}>
              Try Shanku free
            </button>
            <button type="button" className="home-btn home-btn--lg" onClick={() => onOpen({ sample: true })}>
              Open the sample model
            </button>
          </div>
          <div
            className={`home-drop${over ? ' is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => void onDrop(e)}
          >
            <strong>Drop an .ifc or .dxf file here</strong>
            <span>It opens straight in the app, full screen.</span>
            {note ? <span className="home-drop__note">{note}</span> : null}
          </div>
          <img className="home-hero__shot" src={shot('shot-3d')} alt="Shanku showing a structural frame in 3D with the Project browser, Properties and ViewCube" width={1440} height={900} />
        </section>

        <section id="how" className="home-section">
          <p className="home-kicker">How it works</p>
          <ol className="home-steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <span className="home-steps__n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
          <ul className="home-good">
            <li>Every file stays on your machine. No uploads, no servers.</li>
            <li>Revit users feel at home: same shortcuts, same ViewCube, same section box.</li>
            <li>Each IFC file is rated for Shanku, with the Revit export settings that make it better.</li>
          </ul>
        </section>

        <section id="features" className="home-section">
          <p className="home-kicker">The toolkit</p>
          <h2>Everything you need to check a structure. Nothing you don’t.</h2>
          <div className="home-grid">
            {TOOLS.map(([t, d]) => (
              <article key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section">
          <p className="home-kicker">Screenshots</p>
          <h2>This is the whole app.</h2>
          <div className="home-shots">
            {SHOTS.map(([f, alt, cap]) => (
              <figure key={f}>
                <img src={shot(f)} alt={alt} loading="lazy" width={1440} height={900} />
                <figcaption>
                  <strong>{alt}</strong> {cap}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="home-section">
          <p className="home-kicker">Who it’s for</p>
          <div className="home-grid home-grid--4">
            <article><h3>Structural engineers</h3><p>Check a model’s members, levels and concrete quantities without a Revit licence at hand.</p></article>
            <article><h3>BIM modellers</h3><p>Review exports, find marks, section and isolate, and see what Revit wrote into the IFC.</p></article>
            <article><h3>Quantity surveyors</h3><p>Element-wise BOQ with rates and overrides, straight to Excel with live formulas.</p></article>
            <article><h3>CAD teams</h3><p>Open DXF drawings, inspect any object’s properties, and build a 3D model from them.</p></article>
          </div>
        </section>

        <section id="specs" className="home-section">
          <p className="home-kicker">Specs</p>
          <h2>What it handles.</h2>
          <p className="home-sub">Measured numbers, not marketing.</p>
          <dl className="home-specs">
            {SPECS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="faq" className="home-section">
          <p className="home-kicker">Questions</p>
          <h2>Frequently asked</h2>
          <div className="home-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="home-final">
          <h2>Ready to look inside your model?</h2>
          <p>It opens in about three seconds.</p>
          <button type="button" className="home-btn home-btn--primary home-btn--lg" onClick={() => onOpen()}>
            Try Shanku free
          </button>
        </section>
      </main>

      <footer className="home-footer">
        <div>
          <a className="home-brand" href="#top"><ShankuMark size={22} /><span>shanku</span></a>
          <p>Open, IFC-native structural BIM in the browser.</p>
        </div>
        <div>
          <p>
            Built by <a href="https://buildingsoftware.in" target="_blank" rel="noreferrer">Computer Help · Building Software</a>, Mumbai.
          </p>
          <p>
            <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a> · <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">Changelog</a> · <a href="#app" onClick={(e) => { e.preventDefault(); onOpen(); }}>Open the app</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
