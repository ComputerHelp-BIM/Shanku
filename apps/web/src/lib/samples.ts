/**
 * The sample buildings on the start page. Files live in public/samples (the large ones gzipped;
 * the app unpacks them). Made by tools/fixtures/make_sample_ifc.py and make_showcase_ifc.py.
 */
export interface SampleBuilding {
  id: string;
  file: string;
  title: string;
  /** One line on the card. */
  detail: string;
  /** What it is good for showing. */
  shows: string;
  elements: number;
}

export const SAMPLES: readonly SampleBuilding[] = [
  {
    id: 'frame',
    file: 'sample-frame.ifc',
    title: 'G+1 RCC Frame',
    detail: '3 × 2 bays · 6.0 × 5.0 m · M30 & M40 · isolated footings',
    shows: 'Opens instantly: selection, views, BOQ',
    elements: 72,
  },
  {
    id: 'tower',
    file: 'g14-tower.ifc.gz',
    title: 'G+14 Residential Tower',
    detail: 'Stepped 750 / 600 / 450 columns · shear-wall core and stairs · raft on piles · round canopy columns · 1:12 ramp',
    shows: 'Measure, dimensions, colour by grade, BOQ by level',
    elements: 1235,
  },
  {
    id: 'twin',
    file: 'g24-twin-towers.ifc.gz',
    title: 'G+24 Twin Towers on a G+3 Podium',
    detail: '8 m parking grid · 1:10 ramps · 700 mm round atrium columns · transfer beams · two cores',
    shows: 'The large model: podium, ramps, transfer level',
    elements: 4780,
  },
];

export const sampleUrl = (s: SampleBuilding) => `${import.meta.env.BASE_URL}samples/${s.file}`;
