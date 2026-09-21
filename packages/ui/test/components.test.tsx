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
