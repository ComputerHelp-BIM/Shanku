export { ThemeProvider, useTheme, type ThemePreference, type ResolvedTheme, type ThemeProviderProps } from './hooks/theme';
export {
  useShortcut,
  matchesShortcut,
  formatShortcut,
  isEditableTarget,
  isMacPlatform,
  TOGGLE_BOTTOM_PANEL,
  OPEN_COMMAND_PALETTE,
  type Shortcut,
  type UseShortcutOptions,
} from './hooks/useShortcut';
export { Icon, iconNames, type IconName, type IconProps } from './components/Icon';
export { ShankuMark, type ShankuMarkProps } from './components/ShankuMark';
export { Button, IconButton, Kbd, type ButtonProps, type IconButtonProps } from './components/Button';
export { TitleBar, CommandSearch, type TitleBarProps, type CommandSearchProps } from './components/TitleBar';
export { Ribbon, RibbonTabs, RibbonGroup, RibbonButton, type RibbonTab, type RibbonTabsProps, type RibbonButtonProps } from './components/Ribbon';
export { DockPanel, TypeSelector, PropertySection, PropertyRow, type PropertyRowProps, type TypeSelectorProps } from './components/Properties';
export { TreeView, type TreeNode, type TreeViewProps } from './components/TreeView';
export {
  ViewTabs,
  BottomPanel,
  StatusBar,
  StatusChip,
  LocalIndicator,
  AppShell,
  type ViewTab,
  type ViewTabsProps,
  type BottomPanelTab,
  type BottomPanelProps,
  type AppShellProps,
} from './components/Workspace';
export { FloatingWindow, type FloatingWindowProps } from './components/FloatingWindow';
export { ThemeIcon } from './components/ThemeIcon';
export const version = '0.7.1';
