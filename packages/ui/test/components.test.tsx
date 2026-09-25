import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BottomPanel, PropertyRow, ThemeProvider, TreeView, useTheme } from '../src';

function Panel() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('console');
  return (
    <BottomPanel
      open={open}
      onOpenChange={setOpen}
      activeId={tab}
      onTabChange={setTab}
      tabs={[
        { id: 'console', label: 'Python console', content: <input aria-label="console input" /> },
        { id: 'qa', label: 'QA results', badge: 3, content: <p>3 issues</p> },
      ]}
    />
  );
}

describe('BottomPanel', () => {
  it('toggles with Ctrl + ` and Ctrl + Shift + `, including from the console input', () => {
    render(<Panel />);
    expect(screen.getByRole('tabpanel')).toBeTruthy();
    fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
    expect(screen.queryByRole('tabpanel')).toBeNull();
    fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('tabpanel')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('console input'), { code: 'Backquote', ctrlKey: true });
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('takes no space when hidden and opens by dragging the handle up, VS Code style', () => {
    render(<Panel />);
    fireEvent.click(screen.getByLabelText('Hide bottom panel'));
    expect(screen.queryByRole('tab')).toBeNull();
    const sash = screen.getByRole('separator');
    fireEvent.pointerDown(sash, { button: 0, clientY: 600 });
    fireEvent.pointerMove(window, { clientY: 400 });
    fireEvent.pointerUp(window);
    expect(screen.getByRole('tabpanel').hidden).toBe(false);
    expect((screen.getByLabelText('Bottom panel') as HTMLElement).style.height).toBe('200px');
  });

  it('closes when dragged below the minimum height', () => {
    render(<Panel />);
    const sash = screen.getByRole('separator');
    fireEvent.pointerDown(sash, { button: 0, clientY: 400 });
    fireEvent.pointerMove(window, { clientY: 560 });
    fireEvent.pointerUp(window);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });
});

describe('PropertyRow', () => {
  it('commits on Enter and reverts on Escape', () => {
    const commit = vi.fn();
    render(<PropertyRow label="Width" value={400} unit="mm" onCommit={commit} />);
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '450' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('400');
    fireEvent.change(input, { target: { value: '450' } });
    fireEvent.blur(input);
    expect(commit).toHaveBeenCalledWith('450');
  });

  it('shows Varies for mixed selections and never edits read-only values', () => {
    const { rerender } = render(<PropertyRow label="Depth" value={null} varies onCommit={() => {}} />);
    expect((screen.getByLabelText('Depth') as HTMLInputElement).placeholder).toBe('Varies');
    rerender(<PropertyRow label="Volume" value="0.49" unit="m³" readOnly onCommit={() => {}} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('0.49 m³')).toBeTruthy();
  });
});

describe('TreeView', () => {
  const nodes = [
    { id: 'views', label: 'Views', children: [{ id: '3d', label: '{3D}' }, { id: 'l1', label: 'Level 1' }] },
    { id: 'boq', label: 'Quantities (BOQ)' },
  ];

  it('navigates with arrow keys and expands with ArrowRight', () => {
    const select = vi.fn();
    render(<TreeView nodes={nodes} label="Project browser" onSelect={select} />);
    const tree = screen.getByRole('tree');
    expect(screen.queryByText('{3D}')).toBeNull();
    (screen.getByText('Views').closest('[role="treeitem"]') as HTMLElement).focus();
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(screen.getByText('{3D}')).toBeTruthy();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: '3d' }));
  });
});

function ThemeProbe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <>
      <span data-testid="state">{`${preference}/${resolved}`}</span>
      <button onClick={() => setPreference('ink')}>ink</button>
      <button onClick={() => setPreference('system')}>system</button>
    </>
  );
}

describe('ThemeProvider', () => {
  it('sets data-theme for an explicit choice and removes it for system', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    act(() => screen.getByText('ink').click());
    expect(document.documentElement.getAttribute('data-theme')).toBe('ink');
    expect(screen.getByTestId('state').textContent).toBe('ink/ink');
    expect(window.localStorage.getItem('shanku.theme')).toBe('ink');
    act(() => screen.getByText('system').click());
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(screen.getByTestId('state').textContent).toBe('system/paper');
  });
});

describe('ViewTabs', () => {
  it('colours each tab by its document, pyRevit style', async () => {
    const { ViewTabs } = await import('../src');
    render(
      <ViewTabs
        activeId="a"
        onSelect={() => {}}
        tabs={[
          { id: 'a', label: '{3D}', color: '#2F7FD8', title: 'model.ifc' },
          { id: 'b', label: 'Plan.dxf', color: '#1F9E89' },
          { id: 'c', label: 'Plain' },
        ]}
      />,
    );
    const tab = screen.getByRole('tab', { name: '{3D}' }).parentElement as HTMLElement;
    expect(tab.style.getPropertyValue('--tab-color')).toBe('#2F7FD8');
    expect(tab.className).toContain('has-color');
    expect(tab.title).toBe('model.ifc');
    expect((screen.getByRole('tab', { name: 'Plain' }).parentElement as HTMLElement).className).not.toContain('has-color');
  });
});

describe('FloatingWindow', () => {
  it('renders above the app in a portal, moves by its title bar and closes with Esc', async () => {
    const { FloatingWindow } = await import('../src');
    const onClose = vi.fn();
    render(
      <FloatingWindow id="t" title="Keys" open onClose={onClose} initial={{ x: 100, y: 50, w: 400, h: 300 }}>
        <p>body</p>
      </FloatingWindow>,
    );
    const win = screen.getByRole('dialog', { name: 'Keys' });
    expect(win.parentElement).toBe(document.body);
    fireEvent.pointerDown(win.querySelector('.sk-window__title')!, { button: 0, clientX: 150, clientY: 60 });
    fireEvent.pointerMove(window, { clientX: 210, clientY: 90 });
    fireEvent.pointerUp(window);
    expect(win.style.left).toBe('160px');
    fireEvent.keyDown(screen.getByText('body'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ErrorBoundary', () => {
  function Boom(): JSX.Element {
    throw new Error('guide section failed');
  }

  it('keeps an error inside its floating window; the rest of the page survives', async () => {
    const { FloatingWindow } = await import('../src');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <p>ribbon still here</p>
        <FloatingWindow id="t-guide" title="Guide & FAQ" open onClose={() => undefined}>
          <Boom />
        </FloatingWindow>
      </div>,
    );
    expect(screen.getByText('ribbon still here')).toBeTruthy();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Guide & FAQ window hit an error');
    expect(alert.textContent).toContain('guide section failed');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    spy.mockRestore();
  });

  it('page variant replaces the app with a report and a reload', async () => {
    const { ErrorBoundary } = await import('../src');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary where="Shanku" variant="page" details={() => 'Version: test'}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Shanku hit an error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByText(/Version: test/)).toBeTruthy();
    spy.mockRestore();
  });
});

describe('Properties like Revit', () => {
  it('sorts rows within each group, never the groups', async () => {
    const { PropertyGrid, PropertySection, PropertyRow } = await import('../src');
    const view = (sort: 'categorized' | 'asc' | 'desc') =>
      render(
        <PropertyGrid sort={sort}>
          <PropertySection title="Zeta" persistKey={false}>
            <PropertyRow label="Top Offset" value="0" />
            <PropertyRow label="Base Level" value="L1" />
          </PropertySection>
          <PropertySection title="Alpha" persistKey={false}>
            <PropertyRow label="Mark" value="C1" />
            <PropertyRow label="Comments" value="" />
          </PropertySection>
        </PropertyGrid>,
      );
    const labels = (c: HTMLElement) => [...c.querySelectorAll('.sk-prop-row__label')].map((l) => l.textContent);
    const groups = (c: HTMLElement) => [...c.querySelectorAll('.sk-prop-section__title')].map((t) => t.textContent);
    const a = view('categorized');
    expect(labels(a.container)).toEqual(['Top Offset', 'Base Level', 'Mark', 'Comments']);
    a.unmount();
    const b = view('asc');
    expect(labels(b.container)).toEqual(['Base Level', 'Top Offset', 'Comments', 'Mark']);
    expect(groups(b.container)).toEqual(['Zeta', 'Alpha']);
    b.unmount();
    const c = view('desc');
    expect(labels(c.container)).toEqual(['Top Offset', 'Base Level', 'Mark', 'Comments']);
  });

  it('a group collapses from its header', async () => {
    const { PropertySection, PropertyRow } = await import('../src');
    const { container } = render(
      <PropertySection title="Constraints" persistKey={false}>
        <PropertyRow label="Base Level" value="L1" />
      </PropertySection>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Constraints' }));
    expect(container.querySelector('.sk-prop-row')).toBeNull();
    expect(screen.getByRole('button', { name: 'Constraints' }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Project Browser tree (Revit variant)', () => {
  it('search keeps matches and their parents, opened', async () => {
    const { TreeView } = await import('../src');
    const nodes = [
      { id: 'views', label: 'Views (all)', children: [{ id: 'plans', label: 'Structural Plans', children: [{ id: 'l1', label: 'Level 1' }, { id: 'l2', label: 'Level 2' }] }] },
      { id: 'fam', label: 'Families', children: [{ id: 'c', label: 'Columns' }] },
    ];
    render(<TreeView nodes={nodes} label="Browser" variant="revit" filter="level 2" />);
    const rows = screen.getAllByRole('treeitem').map((r) => r.textContent?.replace(/[+−]/g, '').trim());
    expect(rows).toEqual(['Views (all)', 'Structural Plans', 'Level 2']);
  });
});
