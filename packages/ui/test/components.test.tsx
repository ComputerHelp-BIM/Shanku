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
    const body = screen.getByRole('tabpanel', { hidden: true });
    expect(body.hidden).toBe(false);
    fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
    expect(body.hidden).toBe(true);
    fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true, shiftKey: true });
    expect(body.hidden).toBe(false);
    fireEvent.keyDown(screen.getByLabelText('console input'), { code: 'Backquote', ctrlKey: true });
    expect(body.hidden).toBe(true);
  });

  it('opens when a tab is clicked while collapsed', () => {
    render(<Panel />);
    fireEvent.click(screen.getByLabelText('Collapse bottom panel'));
    fireEvent.click(screen.getByRole('tab', { name: /QA results/ }));
    expect(screen.getByText('3 issues')).toBeTruthy();
    expect(screen.getByRole('tabpanel').hidden).toBe(false);
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
