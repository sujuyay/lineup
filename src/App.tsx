import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Check } from 'lucide-react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import type { Player, Lineup, Rotation, Phase, View, SlotRef } from './types';
import { POSITION_ABBREV } from './types';
import type { DeepPartial, LineupSettings, Theme } from './config';
import { SettingsContext, resolveSettings, COLOR_CSS_VARS, PLAYER_COUNT } from './config';
import { THEME_KEY } from './constants';
import {
  lightPalette,
  loadTheme,
  loadFromStorage,
  loadActiveIndex,
  expandLineup,
  enforceMinGirls,
  isEmptyLineup,
  createEmptyLineup,
  resolveView,
  resolveRotationView,
  validateRotation,
  writeView,
  hydrateFrom,
  swapInView,
  minimizeLineup,
  saveToStorage,
  generateId,
} from './utils';
import { Court } from './components/Court';
import { Bench } from './components/Bench';
import { buildShareUrl, readSharedLineup, clearShareParam } from './share';
import { RotationTracker } from './components/RotationTracker';
import { Controls } from './components/Controls';
import { ActionBar } from './components/ActionBar';
import { AddPlayerModal } from './components/AddPlayerModal';
import { Settings } from 'lucide-react';
import './App.css';

interface AppProps {
  /** Override any subset of the default settings (e.g. when used as a package). */
  settings?: DeepPartial<LineupSettings>;
  /**
   * Called for every analytics event (e.g. 'lineup_created'). Plug in any
   * provider here - each consuming site supplies its own, so tracking is fully
   * separate from the standalone build's analytics. Omit to disable tracking.
   */
  onTrack?: (event: string, data?: Record<string, unknown>) => void;
}

function App({ settings: settingsOverride, onTrack }: AppProps = {}) {
  // Merge + validate consumer overrides exactly once, on first mount.
  const [settings] = useState(() => resolveSettings(settingsOverride));

  // Dark/light theme: stored preference, else the configured default. Persisted.
  const [theme, setTheme] = useState<Theme>(() => loadTheme(settings.defaultTheme));

  // Settings with the colour palette resolved for the active theme. Provided via
  // context so inline (per-player) colours track the theme too.
  const themedSettings = useMemo(
    () => ({ ...settings, colors: theme === 'light' ? lightPalette(settings.colors) : settings.colors }),
    [settings, theme],
  );

  // Route analytics events to the consumer-supplied sink (no-op if none).
  const track = onTrack ?? (() => { });

  // Compute the initial state once. A lineup shared via the URL is imported into
  // the first empty slot; if every slot is in use, it's queued (pendingShare) so
  // the user can confirm clearing one.
  const [boot] = useState(() => {
    const stored = loadFromStorage(settings);
    const activeIndex = loadActiveIndex();
    const shared = readSharedLineup();
    const imported = shared ? enforceMinGirls(expandLineup(shared, settings.minGirls.autoFulfill), settings) : null;
    if (!imported) return { lineups: stored, activeIndex, pending: null as Lineup | null, autoImported: false };

    const emptyIndex = stored.findIndex(isEmptyLineup);
    if (emptyIndex >= 0) {
      return {
        lineups: stored.map((lineup, i) => (i === emptyIndex ? imported : lineup)),
        activeIndex: emptyIndex,
        pending: null as Lineup | null,
        autoImported: true,
      };
    }
    // No free slot - keep existing data and ask before overwriting one.
    return { lineups: stored, activeIndex, pending: imported, autoImported: false };
  });

  const [activeLineupIndex, setActiveLineupIndex] = useState(boot.activeIndex);
  const [lineups, setLineups] = useState<Lineup[]>(boot.lineups);
  const [pendingShare, setPendingShare] = useState<Lineup | null>(boot.pending);

  // Which rotation/phase is currently being viewed and edited.
  const [activeRotation, setActiveRotation] = useState(0);
  const [activePhase, setActivePhase] = useState<Phase>('serve');

  // Get current lineup data
  const currentLineup = lineups[activeLineupIndex];
  const { minGirls, roster, rotationMethod } = currentLineup;

  // Resolve the active rotation to player objects for the UI / drag logic.
  // Memoised: resolveView runs validation, and this otherwise recomputes on
  // every render (including the rapid drag-state updates during a drag).
  const { court, leftBench, rightBench, liberoBench, subsBench, validation } = useMemo(
    () => resolveView(currentLineup, activeRotation, activePhase, settings),
    [currentLineup, activeRotation, activePhase, settings],
  );
  const courtRotationalPositions = currentLineup.rotations[activeRotation]?.[activePhase]?.court.map((c) => c.rotationalPosition) ?? [];

  // Per-rotation validity for the tracker (red border on invalid rotations).
  // A rotation is flagged invalid if either its serve or receive formation fails.
  // Memoised since it runs validateRotation twice per rotation.
  const rotationValidity = useMemo(
    () => currentLineup.rotations.map(
      (_, i) =>
        validateRotation(currentLineup, i, 'serve', settings).valid &&
        validateRotation(currentLineup, i, 'receive', settings).valid,
    ),
    [currentLineup, settings],
  );

  // Players can only be added/edited/removed from the first rotation (both
  // methods). For the bench method, swaps are also locked on later rotations -
  // the only allowed action there is a libero replacement.
  const isModalLocked = activeRotation > 0;
  const isSwapLocked = rotationMethod === 'bench' && activeRotation > 0;

  // Transform the active rotation's resolved formation and write it back. Uses a
  // functional state update so multiple calls within one event compose.
  const updateView = (transform: (cur: View) => View) => {
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex
        ? writeView(lineup, transform(resolveView(lineup, activeRotation, activePhase)), activeRotation, activePhase, settings.minGirls.autoFulfill)
        : lineup
    ));
  };

  // One tracker step per stored rotation (which is derived from court + both
  // side benches). Hidden until the lineup has players.
  const rotationCount = Object.keys(roster).length > 0 ? currentLineup.rotations.length : 0;
  const canRotate = rotationCount >= 6;

  // Pick which phase to show when navigating to a rotation: prefer the invalid
  // phase so problems are visible. Default to serve (incl. when both are invalid
  // or both valid); only switch to receive when serve is valid but receive isn't.
  const preferredPhase = (index: number): Phase => {
    const serveValid = validateRotation(currentLineup, index, 'serve', settings).valid;
    const receiveValid = validateRotation(currentLineup, index, 'receive', settings).valid;
    return serveValid && !receiveValid ? 'receive' : 'serve';
  };

  const viewRotation = (index: number) => {
    setActiveRotation(index);
    setActivePhase(preferredPhase(index));
  };

  // Confirm overwriting the active lineup with a shared one (no slots were free).
  const handleImportConfirm = () => {
    if (!pendingShare) return;
    setLineups((prev) => prev.map((lineup, i) => (i === activeLineupIndex ? pendingShare : lineup)));
    setPendingShare(null);
    viewRotation(0);
    track('shared_lineup_imported', { target: 'replaced' });
  };

  const handleImportCancel = () => setPendingShare(null);

  // Rename the active lineup. An empty title falls back to "Lineup N" on render.
  const setTitle = (title: string) =>
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? { ...lineup, title } : lineup
    ));

  // minGirls affects how rotate-forward blocks female exits, so re-derive the
  // whole cascade from the base rotation.
  const setMinGirls = (min: number) =>
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? hydrateFrom({ ...lineup, minGirls: min }, 0, 'serve', settings.minGirls.autoFulfill) : lineup
    ));
  const setRotationMethod = (method: 'bench' | 'substitutions') => {
    track('rotation_method_changed', { method });
    setActiveRotation(0);
    setLineups(prev => prev.map((lineup, i) => {
      if (i !== activeLineupIndex || lineup.rotationMethod === method) return lineup;
      const updated = { ...lineup, rotationMethod: method };

      // Reslot the non-court players for the new method. Gather them (left bench,
      // then right bench, then subs) and redistribute:
      // - substitutions: all into the subs bench, side benches emptied.
      // - bench: fill the left bench (up to capacity), then the right; subs emptied.
      const base = resolveRotationView(updated.rotations[0].serve, updated.roster);
      const benchPlayers = [...base.leftBench, ...base.rightBench, ...base.subsBench];
      const moved: View = method === 'substitutions'
        ? { ...base, leftBench: [], rightBench: [], subsBench: benchPlayers }
        : {
          ...base,
          leftBench: benchPlayers.slice(0, settings.maxSizePerBench),
          rightBench: benchPlayers.slice(settings.maxSizePerBench),
          subsBench: [],
        };
      return writeView(updated, moved, 0, 'serve', settings.minGirls.autoFulfill);
    }));
  };
  const setCourt = (updater: (prev: (Player | null)[]) => (Player | null)[]) =>
    updateView(cur => ({ ...cur, court: updater(cur.court) }));
  const setLeftBench = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, leftBench: updater(cur.leftBench) }));
  const setRightBench = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, rightBench: updater(cur.rightBench) }));
  const setLibero = (player: Player | null) => updateView(cur => ({ ...cur, liberoBench: player }));
  const setSubsBench = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, subsBench: updater(cur.subsBench) }));

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveToStorage(activeLineupIndex, lineups);
  }, [activeLineupIndex, lineups]);

  useEffect(() => {
    // The shared lineup (read in the initializer) was imported; strip the param so
    // a refresh doesn't re-import it over later edits.
    clearShareParam();
    if (boot.autoImported) track('shared_lineup_imported', { target: 'empty_slot' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the colour scheme to the document's CSS variables for the active theme
  // (dark uses the configured palette; light swaps in light backgrounds/text),
  // tag the root for theme-specific CSS, and persist the preference.
  useEffect(() => {
    const palette = themedSettings.colors;
    const root = document.documentElement;
    (Object.keys(COLOR_CSS_VARS) as (keyof typeof COLOR_CSS_VARS)[]).forEach((key) => {
      root.style.setProperty(COLOR_CSS_VARS[key], palette[key]);
    });
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore storage failures (e.g. private mode).
    }
  }, [theme, themedSettings]);

  // Check if there are any players
  const hasPlayers = Object.keys(roster).length > 0;

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Copy a shareable URL (the whole lineup, compressed - incl. the title) to the
  // clipboard, then flash "Copied!" on the button for a second.
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(minimizeLineup(currentLineup, settings.minGirls.autoFulfill)));
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
      track('share_link_copied');
    } catch {
      // Clipboard unavailable (e.g. denied permissions) - nothing to do.
    }
  };

  // Reset all player data
  const handleResetClick = () => {
    setResetModalOpen(true);
  };

  const handleResetConfirm = () => {
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? createEmptyLineup(settings) : lineup
    ));
    setResetModalOpen(false);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{
    type: 'court' | 'bench' | 'newBench' | 'libero' | 'sub' | 'newSub';
    index: number;
    side?: 'left' | 'right';
  } | null>(null);

  // No more players can be added once the roster hits its configured maximum.
  const isRosterFull = Object.keys(roster).length >= settings.maxRosterSize;

  // Players can only be configured from rotation 1; later rotations are derived.
  const handleSlotClick = (slotIndex: number) => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'court', index: slotIndex });
    setModalOpen(true);
  };

  const handleBenchClick = (side: 'left' | 'right', slotIndex: number) => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'bench', index: slotIndex, side });
    setModalOpen(true);
  };

  const handleAddBench = (side: 'left' | 'right') => {
    if (isModalLocked) return;
    const bench = side === 'left' ? leftBench : rightBench;
    if (bench.length < settings.maxSizePerBench) {
      setEditingSlot({ type: 'newBench', index: bench.length, side });
      setModalOpen(true);
    }
  };

  const handleLiberoClick = () => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'libero', index: 0 });
    setModalOpen(true);
  };

  const handleSubClick = (index: number) => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'sub', index });
    setModalOpen(true);
  };

  const handleAddSub = () => {
    if (isModalLocked) return;
    if (subsBench.length >= settings.maxSizePerBench * 2) return;
    setEditingSlot({ type: 'newSub', index: subsBench.length });
    setModalOpen(true);
  };

  const currentPlayer = useMemo(() => {
    if (!editingSlot) return null;
    if (editingSlot.type === 'court') {
      return court[editingSlot.index] ?? null;
    } else if (editingSlot.type === 'bench') {
      const bench = editingSlot.side === 'left' ? leftBench : rightBench;
      return bench[editingSlot.index] ?? null;
    } else if (editingSlot.type === 'libero') {
      return liberoBench;
    } else if (editingSlot.type === 'sub') {
      return subsBench[editingSlot.index] ?? null;
    }
    return null; // newBench / newSub have no existing player
  }, [editingSlot, court, leftBench, rightBench, liberoBench, subsBench]);

  const handleSavePlayer = (playerData: Omit<Player, 'id'>) => {
    if (!editingSlot) return;

    const player: Player = {
      id: currentPlayer?.id || generateId(),
      ...playerData,
    };

    // Adding a brand-new player (vs. editing one). The first such add to an empty
    // lineup counts as creating a lineup.
    if (!currentPlayer) {
      if (isEmptyLineup(currentLineup)) track('lineup_created');
      track('player_added', { position: playerData.position ?? 'none' });
    }

    const appendOrReplace = (prev: Player[]) =>
      editingSlot.index >= prev.length
        ? [...prev, player]
        : prev.map((p, i) => (i === editingSlot.index ? player : p));

    if (editingSlot.type === 'court') {
      setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? player : p)));
    } else if (editingSlot.type === 'libero') {
      setLibero(player);
    } else if (editingSlot.type === 'sub' || editingSlot.type === 'newSub') {
      setSubsBench(appendOrReplace);
    } else {
      const setBench = editingSlot.side === 'left' ? setLeftBench : setRightBench;
      setBench(appendOrReplace);
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  const handleRemovePlayer = () => {
    if (!editingSlot) return;

    if (editingSlot.type === 'court') {
      // Find a replacement: left bench first (top to bottom), then right bench
      const fromLeft = leftBench.length > 0;
      const replacement = fromLeft ? leftBench[0] : rightBench[0] ?? null;

      if (replacement) {
        setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? replacement : p)));
        if (fromLeft) {
          setLeftBench((prev) => prev.slice(1));
        } else {
          setRightBench((prev) => prev.slice(1));
        }
      } else {
        setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? null : p)));
      }
    } else if (editingSlot.type === 'bench') {
      const setBench = editingSlot.side === 'left' ? setLeftBench : setRightBench;
      setBench((prev) => prev.filter((_, i) => i !== editingSlot.index));
    } else if (editingSlot.type === 'sub') {
      setSubsBench((prev) => prev.filter((_, i) => i !== editingSlot.index));
    } else if (editingSlot.type === 'libero') {
      setLibero(null);
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  // Step the viewed rotation forward/backward through the stored rotations,
  // wrapping around. Keeps the current serve/receive phase.
  // Step through serve/receive phases: forward shows a rotation's receive (when
  // it differs from serve) before advancing to the next rotation's serve.
  // Memoised so the arrow-key effect doesn't re-subscribe every render.
  const handleRotate = useCallback((direction: 'forward' | 'backward') => {
    const rotations = currentLineup.rotations;
    const total = rotations.length;
    if (total === 0) return;

    // Whether a rotation's receive court differs from its serve court.
    const phasesDiffer = (index: number) => {
      const rot = rotations[index];
      const ids = (r: Rotation) => r.court.map((c) => c.playerId).join(',');
      return !!rot && ids(rot.serve) !== ids(rot.receive);
    };

    if (direction === 'forward') {
      if (activePhase === 'serve' && phasesDiffer(activeRotation)) {
        setActivePhase('receive');
      } else {
        setActiveRotation((activeRotation + 1) % total);
        setActivePhase('serve');
      }
      return;
    }

    if (activePhase === 'receive') {
      setActivePhase('serve');
    } else {
      const prev = (activeRotation - 1 + total) % total;
      setActiveRotation(prev);
      setActivePhase(phasesDiffer(prev) ? 'receive' : 'serve');
    }
  }, [currentLineup, activeRotation, activePhase]);

  // Left/right arrow keys rotate backward/forward (when rotating is allowed and
  // focus isn't in a form field or modal).
  useEffect(() => {
    if (!canRotate) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (modalOpen || resetModalOpen || pendingShare) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      e.preventDefault();
      handleRotate(e.key === 'ArrowLeft' ? 'backward' : 'forward');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canRotate, modalOpen, resetModalOpen, pendingShare, handleRotate]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  // Track the actively dragged player for overlay
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragPlayer, setActiveDragPlayer] = useState<Player | null>(null);
  // Message explaining why the current hover target can't be dropped on.
  const [dragToast, setDragToast] = useState<string | null>(null);

  // Parse slot ID helper
  const parseSlotId = (id: string): SlotRef | null => {
    if (id === 'libero') {
      return { type: 'libero' };
    } else if (id.startsWith('court-')) {
      return { type: 'court', index: parseInt(id.replace('court-', '')) };
    } else if (id.startsWith('bench-')) {
      const parts = id.replace('bench-', '').split('-');
      return { type: 'bench', side: parts[0] as 'left' | 'right', index: parseInt(parts[1]) };
    } else if (id.startsWith('sub-')) {
      return { type: 'sub', index: parseInt(id.replace('sub-', '')) };
    }
    return null;
  };

  // Get player from slot
  const getPlayerFromSlot = (slot: SlotRef): Player | null => {
    if (slot.type === 'court') {
      return court[slot.index] ?? null;
    } else if (slot.type === 'bench') {
      const bench = slot.side === 'left' ? leftBench : rightBench;
      return bench[slot.index] ?? null;
    } else if (slot.type === 'sub') {
      return subsBench[slot.index] ?? null;
    }
    return liberoBench;
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);

    const slot = parseSlotId(id);
    if (slot) {
      setActiveDragPlayer(getPlayerFromSlot(slot) || null);
    }
  };

  // Court slots are laid out row-major in a 2x3 grid, so the back row is 3-5.
  const isBackRowCourtIndex = (index: number) => index >= PLAYER_COUNT / 2;

  // Why swapping `source` and `target` is not allowed, or null when it's fine.
  // Single source of truth for the drop handler, the drop-target highlight, and
  // the toast shown while dragging over an invalid target.
  const swapDenial = (source: SlotRef, target: SlotRef): string | null => {
    const sourcePlayer = getPlayerFromSlot(source);
    const targetPlayer = getPlayerFromSlot(target);

    const sourceIsLibero = sourcePlayer?.position === 'libero';
    const targetIsLibero = targetPlayer?.position === 'libero';
    const liberoInvolved = sourceIsLibero || targetIsLibero;
    const liberoBenchInvolved = source.type === 'libero' || target.type === 'libero';

    // On a locked (non-first bench) rotation, only libero replacements via the
    // libero bench are allowed. Swapping two on-court players (even if one is the
    // libero) still changes the rotation order, so it stays locked.
    if (isSwapLocked && !liberoBenchInvolved) {
      return 'Order can only be changed from R1';
    }

    // Court players can't be dropped onto empty bench spots
    if (source.type === 'court' && target.type === 'bench' && !targetPlayer) {
      return 'Empty bench spot';
    }

    // Anything in/out of the libero bench has to involve the libero itself.
    if (liberoBenchInvolved && !liberoInvolved) {
      return 'Swap must include libero';
    }

    // When the libero is part of the swap (as the dragged or the replaced
    // player), it lands in the other slot - which must be the libero bench or a
    // back-row court slot, never the front row or a side bench.
    if (liberoInvolved) {
      const liberoDest = sourceIsLibero ? target : source;
      // The libero can only land on the libero bench or a back-row court slot.
      const landsOnBackRowCourt = liberoDest.type === 'court' && isBackRowCourtIndex(liberoDest.index);
      if (liberoDest.type !== 'libero' && !landsOnBackRowCourt) {
        return 'Libero must be back row';
      }
      // The libero swaps with a court player - it can't fill an empty court slot.
      if (liberoDest.type === 'court' && !getPlayerFromSlot(liberoDest)) {
        return 'Libero must replace a player';
      }
    }

    // The remaining rules are the same state checks used to validate any
    // rotation, so simulate the resulting lineup (the swap cascades into later
    // rotations) and reject the swap if the edited rotation fails validation.
    // Don't block swaps on R1 - any validation errors will still display after the swap.
    if (activeRotation > 0) {
      const after = writeView(
        currentLineup,
        swapInView({ court, leftBench, rightBench, liberoBench, subsBench }, source, target),
        activeRotation,
        activePhase,
        settings.minGirls.autoFulfill,
      );
      const { valid, messages } = validateRotation(after, activeRotation, activePhase, settings);
      if (!valid) return messages[0];
    }

    return null;
  };

  const canSwap = (source: SlotRef, target: SlotRef): boolean => swapDenial(source, target) === null;

  // Would dropping the active drag onto the slot with this id be accepted?
  // Used to drive the green drop-target highlight so it matches the drop logic.
  const canDropOnId = (id: string): boolean => {
    if (!activeId || activeId === id) return false;
    const source = parseSlotId(activeId);
    const target = parseSlotId(id);
    if (!source || !target) return false;
    return canSwap(source, target);
  };

  // While dragging, show a toast explaining why the hovered target is invalid.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDragToast(null);
      return;
    }
    const source = parseSlotId(String(active.id));
    const target = parseSlotId(String(over.id));
    setDragToast(source && target ? swapDenial(source, target) : null);
  };

  // Drag was cancelled (e.g. dropped nowhere or Esc) - clear drag state + toast.
  const handleDragCancel = () => {
    setActiveDragPlayer(null);
    setDragToast(null);
  };

  // Handle drag end - every drop swaps the players in the two slots involved
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Clear drag state
    setActiveId(null);
    setActiveDragPlayer(null);
    setDragToast(null);

    // Dropped outside any valid target, or back where it started - nothing to do
    if (!over || active.id === over.id) return;

    const activeSlot = parseSlotId(String(active.id));
    const overSlot = parseSlotId(String(over.id));
    if (!activeSlot || !overSlot) return;

    if (!canSwap(activeSlot, overSlot)) return;

    // Swap both slots' players in a single update so the rotations cascade once.
    updateView((cur) => swapInView(cur, activeSlot, overSlot));
  };

  // Render drag overlay content. Uses the same opaque per-position background as
  // the slots so the dragged card matches its source exactly.
  const renderDragOverlay = () => {
    if (!activeDragPlayer) return null;

    const pos = activeDragPlayer.position;
    const positionColor = pos ? themedSettings.colors.positions[pos] : '#4a5568';
    const background = pos ? themedSettings.colors.positionBackgrounds[pos] : 'var(--bg-tertiary)';

    return (
      <div
        className="player-slot filled drag-overlay-item"
        style={{
          borderColor: positionColor,
          background,
        }}
      >
        {activeDragPlayer.position && (
          <div
            className="player-position-badge"
            style={{ backgroundColor: positionColor }}
          >
            {POSITION_ABBREV[activeDragPlayer.position]}
          </div>
        )}
        <span className="player-name">{activeDragPlayer.name}</span>
      </div>
    );
  };

  // The message shown in the action bar's toast: the live drag message (why a
  // hovered target is invalid) takes precedence, then the current rotation's
  // validation errors, then an informational note when viewing a later rotation.
  const actionBarToast: { messages: string | string[]; variant: 'error' | 'info' } | null = dragToast
    ? { messages: dragToast, variant: 'error' }
    : validation && !validation.valid
      ? { messages: validation.messages, variant: 'error' }
      : activeRotation > 0
        ? { messages: 'Players can only be configured from R1', variant: 'info' }
        : null;

  return (
    <SettingsContext.Provider value={themedSettings}>
      <div className="app">
        <header className="header">
          <h1><span className="header-emoji">🏐</span> Lineup Simulator</h1>
          <button
            className="settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Settings size={22} aria-hidden="true" />
          </button>
        </header>

        <div className="lineup-tabs">
          {lineups.map((_, index) => {
            const isActive = index === activeLineupIndex;
            return (
              <button
                key={index}
                className={`lineup-tab ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveLineupIndex(index);
                  viewRotation(0);
                }}
              >
                L{index + 1}
              </button>
            );
          })}
        </div>

        <main className="main">
          <div className="container">
            <h2 className="lineup-title">{currentLineup.title || `Lineup ${activeLineupIndex + 1}`}</h2>
            <RotationTracker
              count={rotationCount}
              activeIndex={activeRotation}
              onSelect={viewRotation}
              validity={rotationValidity}
            />
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="arena-section">
                {rotationMethod === 'bench' && (
                  <Bench
                    label="BENCH"
                    className="left"
                    slotsClassName="side-bench-slots"
                    players={leftBench}
                    slotId={(i) => `bench-left-${i}`}
                    onSlotClick={(i) => handleBenchClick('left', i)}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={!isModalLocked && !isRosterFull && leftBench.length < settings.maxSizePerBench}
                    onAdd={() => handleAddBench('left')}
                  />
                )}
                <div style={{ gridColumn: rotationMethod === 'bench' ? 'span 1' : 'span 3' }}>
                  <Court
                    court={court}
                    rotationalPositions={courtRotationalPositions}
                    onSlotClick={handleSlotClick}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    rotationNumber={activeRotation + 1}
                    phase={activePhase}
                    onPhaseChange={setActivePhase}
                  />
                </div>
                {rotationMethod === 'bench' && (
                  <Bench
                    label="BENCH"
                    className="right"
                    slotsClassName="side-bench-slots"
                    players={rightBench}
                    slotId={(i) => `bench-right-${i}`}
                    onSlotClick={(i) => handleBenchClick('right', i)}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={!isModalLocked && !isRosterFull && rightBench.length < settings.maxSizePerBench}
                    onAdd={() => handleAddBench('right')}
                  />
                )}
              </div>
              <div className="arena-section">
                <div style={{ gridColumn: 'span 1' }}>
                  <Bench
                    label={liberoBench && liberoBench.position !== 'libero' ? 'LIB OUT' : 'LIBERO'}
                    labelClassName="libero-bench-label"
                    slotsClassName="libero-slot"
                    players={liberoBench ? [liberoBench] : []}
                    slotId={() => 'libero'}
                    onSlotClick={handleLiberoClick}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={!isModalLocked && !isRosterFull && !liberoBench}
                    onAdd={handleLiberoClick}
                  />
                </div>
                {rotationMethod === 'substitutions' && (
                  <Bench
                    label="SUBS"
                    className="subs-bench"
                    slotsClassName="subs-slots"
                    players={subsBench}
                    slotId={(i) => `sub-${i}`}
                    onSlotClick={handleSubClick}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={!isModalLocked && !isRosterFull && subsBench.length < settings.maxSizePerBench * 2}
                    onAdd={handleAddSub}
                  />
                )}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeId ? renderDragOverlay() : null}
              </DragOverlay>
            </DndContext>
            <ActionBar
              onRotate={handleRotate}
              canRotate={canRotate}
              rotationNumber={activeRotation + 1}
              phase={activePhase}
              onReset={handleResetClick}
              onShare={() => setShareOpen(true)}
              actionsEnabled={hasPlayers}
              toast={actionBarToast}
            />
          </div>
        </main>

        {settingsOpen && (
          <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button>
              <h2>Settings</h2>
              <Controls
                title={currentLineup.title ?? ''}
                titlePlaceholder={`Lineup ${activeLineupIndex + 1}`}
                onTitleChange={setTitle}
                minGirls={minGirls}
                onMinGirlsChange={setMinGirls}
                rotationMethod={rotationMethod}
                onRotationMethodChange={setRotationMethod}
                theme={theme}
                onThemeChange={setTheme}
              />
            </div>
          </div>
        )}

        {shareOpen && (
          <div className="modal-overlay" onClick={() => setShareOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShareOpen(false)}>×</button>
              <h2>Share Lineup</h2>
              <div className="form-group">
                <label>Lineup Name</label>
                <input
                  type="text"
                  value={currentLineup.title ?? ''}
                  placeholder={`Lineup ${activeLineupIndex + 1}`}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={40}
                />
              </div>
              <div className="confirm-actions">
                <button className="btn-save" onClick={handleCopyLink} disabled={!currentLineup.title?.trim()}>
                  {shareCopied ?
                    <><Check size={16} aria-hidden="true" /><span>Copied!</span></> :
                    <><Link size={16} aria-hidden="true" /><span>Copy link</span></>}
                </button>
              </div>
            </div>
          </div>
        )}

        <AddPlayerModal
          key={editingSlot ? `${editingSlot.type}-${editingSlot.side ?? ''}-${editingSlot.index}` : 'closed'}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingSlot(null);
          }}
          onSave={handleSavePlayer}
          onRemove={currentPlayer ? handleRemovePlayer : undefined}
          existingPlayer={currentPlayer}
          isLibero={currentPlayer ? currentPlayer.position === 'libero' : editingSlot?.type === 'libero'}
        />

        {/* Reset Confirmation Modal */}
        {resetModalOpen && (
          <div className="modal-overlay" onClick={() => setResetModalOpen(false)}>
            <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setResetModalOpen(false)}>×</button>
              <h2>Reset Lineup {activeLineupIndex + 1}?</h2>
              <p className="confirm-message">All player data will be cleared. This cannot be undone.</p>
              <div className="confirm-actions">
                <button className="btn-confirm-reset" onClick={handleResetConfirm}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Shared-lineup Import Confirmation (no empty slots available) */}
        {pendingShare && (
          <div className="modal-overlay" onClick={handleImportCancel}>
            <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={handleImportCancel}>×</button>
              <h2>Import shared lineup?</h2>
              <p className="confirm-message">
                All lineup slots are in use. Importing will replace Lineup {activeLineupIndex + 1} and clear its
                current players. This cannot be undone.
              </p>
              <div className="confirm-actions">
                <button className="btn-confirm-reset" onClick={handleImportConfirm}>
                  Replace Lineup {activeLineupIndex + 1}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsContext.Provider>
  );
}

export default App;
