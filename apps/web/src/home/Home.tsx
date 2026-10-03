import { MouseFigure, SelectionFigure } from '../components/figures';
import { useState, type DragEvent } from 'react';
import { ThemeIcon, useTheme } from '@cad2bim/ui';
import { ShankuMark } from '@cad2bim/ui';
import type { AppStart } from '../App';
import { disclaimer } from '../lib/legal';
import { APP_VERSION } from '../app/constants';
import { BuildUp } from './BuildUp';
import { Roadmap } from './Roadmap';
import { DimLine, LevelHead, TitleBlock } from './Sheet';
import './home.css';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/ComputerHelp-BIM/Shanku';
/** The Revit add-in's page in the repository: what it does and how to install it. (A public download will be a
 * GitHub release once cad2bim is distributed beyond the team.) */
const ADDIN = `${REPO}/tree/main/bridge/revit`;

const TOOLS = [
  ['IFC models', 'IFC2x3 and IFC4 from Revit and other tools; 50,000 elements stay smooth.'],
  ['Revit-style workspace', 'File menu, ribbon, Quick Access Toolbar, view cube, Project browser and Properties — where Revit keeps them.'],
  ['Native editing', 'Move, Copy, Rotate, Mirror, Array, Offset, Delete, Pin — with snaps, typed distances and one undo each.'],
  ['Align with locks', 'Align a face or centreline to a grid and lock it; an edit that would break it asks first.'],
  ['Levels, grids, reference planes', 'Move a level and everything hosted on it follows; draw grids and planes in plans.'],
  ['Project files (.c2b)', 'Model, views, edits, units and settings in one open file. Save back with Ctrl + S; works offline.'],
  ['DXF drawings and DXF → 3D', 'View any DXF; build an IFC4 model from drawings made to Computer Help’s layer standard.'],
  ['BOQ to Excel', 'Concrete by level, category and grade, with rates and overrides, as Excel Tables with live formulas.'],
  ['Section box and explode', 'Capped cuts with arrow grips; exploded views by storey, radially or by category.'],
  ['Python console', 'Query the model in Python, in the browser: elements, levels, BOQ, select and isolate.'],
  ['Project Units and grid', 'mm, cm, m or feet-inches with Indian grouping; a CAD grid under plans, a ground grid in 3D.'],
  ['Revit add-in (optional)', 'cad2bim Bridge for Revit: load the open model, sync the selection, edit parameters and types, apply in one transaction.'],
] as const;

const SHOTS = [
  ['shot-3d', 'A structural frame in 3D', 'The Revit-style workspace: File menu, ribbon, Project browser, Properties, view cube.'],
  ['shot-edit', 'Moving a column in a plan', 'Snaps, a listening dimension and a typed distance — over the plan’s grid.'],
  ['shot-boq', 'Bill of quantities', 'Quantities, dimensions, rates and amounts for every element.'],
  ['shot-section', 'Section box with grips', 'Drag an arrow to move a face; the cut updates live.'],
] as const;

const THEME_LABEL = { system: 'Theme: Auto (follows your system). Click to change', paper: 'Theme: Light. Click to change', ink: 'Theme: Dark. Click to change' } as const;

const SPECS = [
  ['Opens', 'IFC2x3 and IFC4 (IFC4x3 experimental); DXF from AutoCAD R12 to 2018+; cad2bim projects (.c2b), and Shanku’s .shkp and .shk'],
  ['Saves and exports', 'cad2bim projects (.c2b); Excel BOQ (.xlsx); IFC4 built from DXF. With the Revit add-in: native Revit elements from DXF, and parameter and type changes applied in Revit'],
  ['Edits', 'Move, Copy, Rotate, Mirror, Array, Offset, Align with locks, Delete, Pin; levels, grids and reference planes'],
  ['Largest tested', '51,280 elements open in 3.9 s; a 23.6 MB DXF with 505,000 lines in 26 s'],
  ['Where it runs', 'In your browser. Files are read on your device and never uploaded; the optional Revit add-in talks to cad2bim on your own computer only.'],
  ['Browsers', 'Chrome and Edge (full); Firefox and Safari (open and save by upload and download)'],
  ['Not yet', 'DWG (save as DXF first); IFC download with your edits (being built); creating new elements; reinforcement and BBS; sheets and printing — see the roadmap'],
] as const;

const FAQ = [
  ['Do I need to install anything?', 'No. cad2bim runs in the browser. The first DXF or Python session downloads about 15 MB of Python once, and the browser keeps it. The Revit add-in is optional.'],
  ['Are my files uploaded?', 'No. Models, drawings and projects are read on your device; nothing leaves it unless you save or download a file yourself. The optional Revit add-in connects to cad2bim on your own computer (localhost), not over the internet.'],
  ['Can I edit models in cad2bim?', 'Yes. Move, Copy, Rotate, Mirror, Array, Offset and Align with locks, move levels and draw grids — each one undo. Edits are kept on your device and saved in the .c2b project. Models linked to Revit send their changes to Revit instead, through the add-in.'],
  ['How do I get the Revit add-in?', 'cad2bim Bridge for Revit 2025 is a zip with an install script: unzip it and run install.ps1 with Revit closed. In Revit, cad2bim → Connect shows a code; enter it in cad2bim (Revit tab → Connect). Its page in the repository has the details.'],
  ['What happened to Shanku?', 'cad2bim was called Shanku until version 0.57. Your .shkp and .shk files still open, and saving writes a new .c2b beside them, never over the old file.'],
  ['Is cad2bim made by Autodesk?', 'No. cad2bim is an independent application by Computer Help, Mumbai. It is not affiliated with, sponsored by or endorsed by Autodesk, Inc. It reads IFC and DXF files that Revit, AutoCAD and other programs write.'],
  ['Do I need Revit?', 'No. cad2bim opens IFC, DXF and its own projects without it. Revit is needed only for the add-in’s features: loading the open Revit model, sending changes back and building DXF models as native Revit elements.'],
  ['Which IFC export should I use from Revit?', 'IFC4 Reference View [Structural] with base quantities and Revit property sets on. cad2bim rates every file it opens and tells you what to change.'],
  ['Can it open DWG?', 'Not directly yet. Save as DXF in AutoCAD, or use the free ODA File Converter, then open the DXF.'],
  ['Does it work offline?', 'Yes, after the first visit: the browser keeps the app. Python for DXF files is fetched once, then kept too.'],
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
    if (!/\.(ifc|dxf|c2b|shkp|shk)(\.gz)?$/i.test(f.name)) return setNote(`${f.name} is not an .ifc, .dxf or .c2b file.`);
    onOpen({ file: { name: f.name, bytes: await f.arrayBuffer() } });
  };

  return (
    <div className="home home--sheet">
      <header className="home-nav">
        <a className="home-brand" href="#top" aria-label="cad2bim home">
          <ShankuMark size={28} />
          <span>cad2bim</span>
        </a>
        <nav aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#specs">Specs</a>
          <a href="#faq">FAQ</a>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <button type="button" className="home-btn home-btn--icon" onClick={cycle} title={THEME_LABEL[preference]} aria-label={THEME_LABEL[preference]}>
          <ThemeIcon preference={preference} size={16} />
        </button>
        <button type="button" className="home-btn home-btn--primary" onClick={() => onOpen()}>
          Open cad2bim
        </button>
      </header>

      <main id="top">
        <section className="home-hero">
          <LevelHead level="Roof" elevation="+21,000">
            Structural BIM · v{APP_VERSION}
          </LevelHead>
          <h1>
            From drawing to BIM, <em>right in your browser</em>
          </h1>
          <DimLine label="0 installs · 0 uploads" />
          <p className="home-lede">Open Revit IFC models, CAD drawings and cad2bim projects. Navigate and edit like Revit — move, copy, align, levels and grids — check quantities and export a BOQ to Excel.</p>
          <div className="home-cta">
            <button type="button" className="home-btn home-btn--primary home-btn--lg" onClick={() => onOpen()}>
              Open cad2bim
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
            <strong>Drop an .ifc, .dxf or .c2b file here</strong>
            <span>It opens straight in the app, full screen.</span>
            {note ? <span className="home-drop__note">{note}</span> : null}
          </div>
          <img className="home-hero__shot" src={shot('shot-3d')} alt="cad2bim showing a structural frame in 3D with the File menu, ribbon, Project browser, Properties and view cube" width={1440} height={900} />
        </section>

        <div id="how" className="home-section home-section--wide">
          <LevelHead level="Level 6" elevation="+18,000">
            Scroll to build
          </LevelHead>
        </div>
        <BuildUp />

        <section id="navigate" className="home-section">
          <LevelHead level="Level 5" elevation="+15,000">
            Navigation
          </LevelHead>
          <h2>If you know Revit, you already know cad2bim.</h2>
          <p className="home-sub">The same mouse, the same window and crossing selection, the same two-letter shortcuts.</p>
          <MouseFigure />
          <SelectionFigure />
        </section>

        <section id="features" className="home-section">
          <LevelHead level="Level 4" elevation="+12,000">
            The toolkit
          </LevelHead>
          <h2>Open it, check it, change it.</h2>
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
          <LevelHead level="Level 3" elevation="+9,000">
            Screenshots
          </LevelHead>
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

        <section id="roadmap" className="home-section home-section--wide">
          <LevelHead level="Level 2" elevation="+6,000">
            Roadmap
          </LevelHead>
          <h2>Still under construction — on purpose.</h2>
          <p className="home-sub">What has shipped, what is being built, what comes next, and ideas we are weighing. Shipped work names the release that brought it.</p>
          <Roadmap version={APP_VERSION} />
        </section>

        <section className="home-section">
          <LevelHead level="Level 1" elevation="+3,000">
            Who it’s for
          </LevelHead>
          <div className="home-grid home-grid--4">
            <article>
              <h3>Structural engineers</h3>
              <p>Check a model’s members, levels and concrete quantities, and make quick changes, without a Revit licence at hand.</p>
            </article>
            <article>
              <h3>BIM modellers</h3>
              <p>Review exports, align to grids, move levels, and send parameter and type changes back to Revit.</p>
            </article>
            <article>
              <h3>Quantity surveyors</h3>
              <p>Element-wise BOQ with rates and overrides, straight to Excel with live formulas.</p>
            </article>
            <article>
              <h3>CAD teams</h3>
              <p>Open DXF drawings, inspect any object’s properties, and build a 3D model from them.</p>
            </article>
          </div>
        </section>

        <section id="specs" className="home-section">
          <LevelHead level="Ground" elevation="±0">
            Specs
          </LevelHead>
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
          <LevelHead level="Plinth" elevation="−450">
            Questions
          </LevelHead>
          <h2>Frequently asked</h2>
          <div className="home-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>
                  {a}
                  {q === 'How do I get the Revit add-in?' ? (
                    <>
                      {' '}
                      <a href={ADDIN} target="_blank" rel="noreferrer">
                        The add-in’s page
                      </a>
                    </>
                  ) : null}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="home-final">
          <h2>Ready to build?</h2>
          <p>It opens in about three seconds.</p>
          <button type="button" className="home-btn home-btn--primary home-btn--lg" onClick={() => onOpen()}>
            Open cad2bim
          </button>
        </section>
      </main>

      <footer className="home-footer">
        <LevelHead level="Foundation" elevation="−1,500">
          Title block
        </LevelHead>
        <TitleBlock version={APP_VERSION}>
          <div className="tb__brand">
            <a className="home-brand" href="#top">
              <ShankuMark size={22} />
              <span>cad2bim</span>
            </a>
            <p>Open, IFC-native structural BIM in the browser.</p>
            <p>
              Built by{' '}
              <a href="https://buildingsoftware.in" target="_blank" rel="noreferrer">
                Computer Help · Building Software
              </a>
              , Mumbai.
            </p>
            <p>
              <a href={REPO} target="_blank" rel="noreferrer">
                Source on GitHub
              </a>{' '}
              ·{' '}
              <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
                Changelog
              </a>{' '}
              ·{' '}
              <a href={ADDIN} target="_blank" rel="noreferrer">
                Revit add-in
              </a>{' '}
              ·{' '}
              <a href="#app" onClick={() => onOpen()}>
                Open the app
              </a>
            </p>
          </div>
        </TitleBlock>
        <p className="home-footer__legal">{disclaimer()}</p>
      </footer>
    </div>
  );
}
