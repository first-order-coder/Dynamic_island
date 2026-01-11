import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Play, Pause, RefreshCw, Timer, Clock, Pin, PinOff, LocateFixed, Power, Flame, Coffee } from 'lucide-react';
import { springApple, viewFade, easeApple, pressTap, hoverLift, fadeMed } from './motion';

// DEBUG mode - set to false to remove red window outline
const DEBUG = false;

type TimerState = 'idle' | 'running' | 'paused' | 'finished';
type TimerMode = 'countdown' | 'countup' | 'pomodoro';
type PomodoroPhase = 'work' | 'short_break' | 'long_break';

// Finish animation constants (single source of truth)
const easePremium: [number, number, number, number] = [0.22, 0.61, 0.36, 1]; // iOS-ish
const FINISH_POP_SCALE = 1.045;     // slightly bigger but still subtle (was 1.03)
const FINISH_POP_DURATION = 0.24;   // slower/smoother (was ~0.16)
const FINISH_RING_DURATION = 0.85;  // slower (was ~0.65)
const FINISH_GLOW_DURATION = 520;   // ms (was ~300)

// Finish ring animation component (one-shot pulse ring - subtle)
const FinishRing = ({ triggerKey }: { triggerKey: number }) => {
    if (triggerKey <= 0) return null;
    return (
        <motion.div
            key={`ring-${triggerKey}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: FINISH_RING_DURATION, ease: easePremium }}
        >
            <motion.div
                className="rounded-full border border-white/18"
                style={{ width: '108%', height: '108%' }}  // subtle size
                initial={{ scale: 0.985, opacity: 0.75 }}
                animate={{ scale: 1.16, opacity: 0 }}
                transition={{ duration: FINISH_RING_DURATION, ease: easePremium }}
            />
        </motion.div>
    );
};

// Finish glow component (smooth fade-in/out for premium feel)
const FinishGlow = ({ visible }: { visible: boolean }) => {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="finish-glow"
                    className="absolute inset-0 rounded-[inherit] pointer-events-none"
                    // Keep the glow shape constant; animate only opacity for smoothness
                    style={{
                        boxShadow:
                            '0 0 0 1px rgba(239,68,68,0.55), 0 0 12px rgba(239,68,68,0.35)',
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        opacity: {
                            // slightly slower fade-out feels more premium
                            duration: 0.35,
                            ease: easePremium,
                        },
                    }}
                />
            )}
        </AnimatePresence>
    );
};

const ModeBadgeIcon = ({ mode, state, allowGlow = false }: { mode: TimerMode; state: TimerState; allowGlow?: boolean }) => {
    const isRunning = state === 'running';
    const isPaused = state === 'paused';
    const isFinished = state === 'finished';

    // Color rules
    const colorClass =
        isFinished ? 'text-red-400' :
        isPaused ? 'text-yellow-400' :
        isRunning ? 'text-cyan-400' :
        'text-zinc-500';

    const ringClass =
        isFinished ? 'border-red-400/20 bg-red-400/10' :
        isPaused ? 'border-yellow-400/20 bg-yellow-400/10' :
        isRunning ? 'border-cyan-400/20 bg-cyan-400/10' :
        'border-white/10 bg-white/5';

    const Icon = mode === 'countdown' ? Timer : mode === 'countup' ? Clock : Flame;

    return (
        <motion.div
            className={`flex items-center justify-center w-[22px] h-[22px] rounded-full border transition-[box-shadow,background-color,border-color,color] duration-200 ${ringClass} ${colorClass}`}
            animate={{
                scale: isRunning ? [1, 1.06, 1] : 1,
                opacity: isRunning ? [0.95, 1, 0.95] : 1,
                boxShadow: allowGlow ? (
                    isFinished ? '0 0 10px rgba(239,68,68,0.35)' :
                    isPaused ? '0 0 10px rgba(250,204,21,0.25)' :
                    isRunning ? '0 0 12px rgba(34,211,238,0.35)' :
                    'none'
                ) : 'none'
            }}
            transition={isRunning ? { 
                scale: { duration: 1.4, repeat: Infinity, ease: easeApple },
                opacity: { duration: 1.4, repeat: Infinity, ease: easeApple }
            } : fadeMed}
        >
            <Icon size={13} strokeWidth={2.5} />
        </motion.div>
    );
};

// Island size constants - single source of truth
const ISLAND_W_EXPANDED = 400;
const EXPANDED_H_DEFAULT = 380;        // non-pomodoro modes
const EXPANDED_H_POMO_IDLE = 600;      // pomodoro idle/settings
const EXPANDED_H_POMO_ACTIVE = 420;    // pomodoro running/paused/finished

const ISLAND_H_COLLAPSED = 44;              // increased from 34 for premium spacing
const ISLAND_W_IDLE = 200;                  // increased from 150
const ISLAND_W_ACTIVE = 190;                // increased from 140 (running/paused/finished)
const COLLAPSED_RADIUS = 24;                // increased from 20 for smoother corners

// IMPORTANT: minimal padding - no shadow area needed
const PAD_COLLAPSED = 0;   // no padding in collapsed mode (no shadow)
const PAD_EXPANDED = 2;    // minimal padding when expanded (optional subtle shadow)

// Spacing system for expanded view (Apple-like consistency)
const PAD_OUTER = 20;      // distance from island border to content
const GAP_STACK = 16;      // vertical gap between major sections
const GAP_INLINE = 8;      // small inline gaps
const HEADER_H = 28;       // header row height alignment target
const BTN_SIZE = 30;       // top-right icon button hit area (same for all)
const GAP_MODE_TIME = 18;  // gap between mode toggle and time display
const GAP_CONTROLS = 24;   // gap between reset and play/pause buttons
const FOOTER_SAFE_PAD = 120; // enough to clear the big play button + spacing

const Island = () => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSizeExpanded, setIsSizeExpanded] = useState(false); // Controls container/window size (stays expanded during exit)
    const [state, setState] = useState<TimerState>('idle');
    const [timeLeft, setTimeLeft] = useState(15 * 60);
    const [timerMode, setTimerMode] = useState<TimerMode>('countdown');

    const [inputMinutes, setInputMinutes] = useState(15);
    const [inputSeconds, setInputSeconds] = useState(0);

    // Pomodoro settings
    const [workMinutes, setWorkMinutes] = useState(25);
    const [shortBreakMinutes, setShortBreakMinutes] = useState(5);
    const [longBreakMinutes, setLongBreakMinutes] = useState(15);
    const [longBreakEvery, setLongBreakEvery] = useState(4);
    const [autoStartNext, setAutoStartNext] = useState(true);

    // Pomodoro runtime state
    const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work');
    const [pomodoroSessionCount, setPomodoroSessionCount] = useState(0);

    // New Features State
    const [isPinned, setIsPinned] = useState(true);
    const [alwaysExpanded, setAlwaysExpanded] = useState(false);

    // Dismissal state for smooth collapse transition
    const [isDismissing, setIsDismissing] = useState(false);
    const DISMISS_CHROME_MS = 65;
    const DISMISS_SHRINK_DELAY_MS = 35;

    // Finish animation trigger state
    const [finishFxKey, setFinishFxKey] = useState(0);
    const [finishGlowOn, setFinishGlowOn] = useState(false);
    const finishedFromCountdownRef = useRef(false);
    const finishScaleKey = useRef(0);

    // Function to request collapse (triggers exit animation immediately)
    const requestCollapse = () => {
        if (!isExpanded) return;
        if (alwaysExpanded) return;

        // Begin dismissal immediately to avoid header flash
        setIsDismissing(true);

        // Start exit animation (expanded view exits)
        setIsExpanded(false);

        // Start shrinking shortly after so it "snaps" into pill visually
        window.setTimeout(() => {
            setIsSizeExpanded(false);
        }, DISMISS_SHRINK_DELAY_MS);
    };

    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Drag state - pointer events with capture
    const isDragging = useRef(false);
    const dragPointerId = useRef<number | null>(null);
    const lastScreenPos = useRef({ x: 0, y: 0 });
    const totalDrag = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);

    // rAF throttling for smooth drag
    const pendingDelta = useRef({ x: 0, y: 0 });
    const rafId = useRef<number | null>(null);

    const flushMove = () => {
        rafId.current = null;
        const { x, y } = pendingDelta.current;
        pendingDelta.current = { x: 0, y: 0 };
        if (window.electron && (x !== 0 || y !== 0)) {
            window.electron.moveWindow(x, y);
        }
    };

    const endTimeRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    const lastPinToggleAt = useRef<number>(0);
    const PIN_COOLDOWN_MS = 1200; // Increased to ensure no race conditions

    // Toggle Pin
    const togglePin = () => {
        const newState = !isPinned;
        // Set timestamp FIRST before state update to prevent race conditions
        lastPinToggleAt.current = Date.now();
        setIsPinned(newState);

        if (!window.electron) return;

        // Always be interactive immediately after toggling pin.
        // Force this multiple times to ensure it sticks
        window.electron.setIgnoreMouseEvents(false);
        
        // Toggle always-on-top in main process (hardened handler preserves visibility)
        window.electron.setAlwaysOnTop(newState);
        
        // IMPORTANT: focus so outside click will blur reliably
        window.electron.focusWindow?.();
        
        // Force interactivity again after a tiny delay to override any race conditions
        setTimeout(() => {
            window.electron?.setIgnoreMouseEvents(false);
        }, 10);

        // Main process handles click-through automatically via polling
    };

    const startTimer = () => {
        const now = Date.now();

        // If starting fresh (idle) or resuming (paused)
        if (state === 'idle') {
            if (timerMode === 'countdown') {
                const total = inputMinutes * 60 + inputSeconds;
                setTimeLeft(total);
                endTimeRef.current = now + total * 1000;
            } else if (timerMode === 'pomodoro') {
                // Initialize Pomodoro phase and timeLeft if needed
                const phaseDuration = pomodoroPhase === 'work' 
                    ? workMinutes * 60 
                    : pomodoroPhase === 'short_break' 
                    ? shortBreakMinutes * 60 
                    : longBreakMinutes * 60;
                
                if (timeLeft === 0 || timeLeft !== phaseDuration) {
                    setTimeLeft(phaseDuration);
                }
                endTimeRef.current = now + timeLeft * 1000;
            } else {
                setTimeLeft(0);
                startTimeRef.current = now;
            }
        } else if (state === 'paused') {
            // Resuming logic
            if (timerMode === 'countdown' || timerMode === 'pomodoro') {
                // Determine new end time based on remaining timeLeft
                endTimeRef.current = now + timeLeft * 1000;
            } else {
                // Determine new start time based on elapsed timeLeft
                startTimeRef.current = now - timeLeft * 1000;
            }
        }

        setState('running');
        // Restore old behavior: collapse for BOTH countdown and stopwatch on start
            setIsExpanded(false);
    };

    const pauseTimer = () => {
        setState('paused');
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const stopTimer = () => {
        setState('idle');
        if (timerMode === 'countup') {
            setTimeLeft(0);
        } else if (timerMode === 'pomodoro') {
            // Reset Pomodoro state
            setPomodoroPhase('work');
            setPomodoroSessionCount(0);
            setTimeLeft(workMinutes * 60);
        }
        if (timerRef.current) clearInterval(timerRef.current);
        finishedFromCountdownRef.current = false;
        finishScaleKey.current = 0;
    };

    const playBeep = () => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    };

    // Advance Pomodoro phase when current phase completes (using ref to access latest values)
    const pomodoroPhaseRef = useRef(pomodoroPhase);
    const pomodoroSessionCountRef = useRef(pomodoroSessionCount);
    
    useEffect(() => {
        pomodoroPhaseRef.current = pomodoroPhase;
        pomodoroSessionCountRef.current = pomodoroSessionCount;
    }, [pomodoroPhase, pomodoroSessionCount]);
    
    const advancePomodoroPhase = (now: number) => {
        const currentPhase = pomodoroPhaseRef.current;
        const currentCount = pomodoroSessionCountRef.current;
        
        if (currentPhase === 'work') {
            // Work phase finished - increment session count
            const newCount = currentCount + 1;
            setPomodoroSessionCount(newCount);
            
            // Determine next phase: long break every N sessions, otherwise short break
            const nextPhase: PomodoroPhase = newCount % longBreakEvery === 0 ? 'long_break' : 'short_break';
            setPomodoroPhase(nextPhase);
            
            const nextDuration = nextPhase === 'long_break' 
                ? longBreakMinutes * 60 
                : shortBreakMinutes * 60;
            
            setTimeLeft(nextDuration);
            
            if (autoStartNext) {
                // Auto-start next phase
                endTimeRef.current = now + nextDuration * 1000;
                setState('running');
            } else {
                // Wait for user to start
                setState('paused');
            }
        } else {
            // Break phase finished - return to work
            setPomodoroPhase('work');
            const workDuration = workMinutes * 60;
            setTimeLeft(workDuration);
            
            if (autoStartNext) {
                // Auto-start work phase
                endTimeRef.current = now + workDuration * 1000;
                setState('running');
            } else {
                // Wait for user to start
                setState('paused');
            }
        }
    };

    useEffect(() => {
        if (state === 'running') {
            timerRef.current = setInterval(() => {
                const now = Date.now();

                if (timerMode === 'countdown' || timerMode === 'pomodoro') {
                        const remaining = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
                    setTimeLeft(remaining);

                        if (remaining <= 0) {
                        finishedFromCountdownRef.current = true;
                        setFinishFxKey((k) => k + 1);
                        finishScaleKey.current += 1;
                        playBeep();
                        
                        if (timerMode === 'pomodoro') {
                            // Advance Pomodoro phase
                            const wasAutoStart = autoStartNext;
                            advancePomodoroPhase(now);
                            
                            // If autoStartNext is false, pause and clear interval
                            if (!wasAutoStart) {
                                clearInterval(timerRef.current!);
                                setState('paused');
                            }
                            // If autoStartNext is true, interval continues with updated endTimeRef
                        } else {
                            // Countdown finished
                            clearInterval(timerRef.current!);
                            setState('finished');
                            // DO NOT auto-expand on finish - keep current expanded state
                            setTimeLeft(0);
                        }
                    }
                    } else {
                        // Countup - use max to prevent negative jitter on first tick
                        const elapsed = Math.max(0, Math.floor((now - startTimeRef.current) / 1000));
                    setTimeLeft(elapsed);
                    }
            }, 100); // Check more frequently for smoothness, though updating state effectively per second change
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [state, timerMode, autoStartNext]);

    // Reset Pomodoro state when switching away from Pomodoro mode
    useEffect(() => {
        if (timerMode !== 'pomodoro' && state === 'idle') {
            setPomodoroPhase('work');
            setPomodoroSessionCount(0);
        }
    }, [timerMode, state]);

    // Sync timeLeft with inputs when idle
    useEffect(() => {
        if (state === 'idle') {
            if (timerMode === 'countdown') {
                setTimeLeft(inputMinutes * 60 + inputSeconds);
            } else if (timerMode === 'pomodoro') {
                // Sync timeLeft to current phase duration
                const phaseDuration = pomodoroPhase === 'work' 
                    ? workMinutes * 60 
                    : pomodoroPhase === 'short_break' 
                    ? shortBreakMinutes * 60 
                    : longBreakMinutes * 60;
                setTimeLeft(phaseDuration);
            } else {
                setTimeLeft(0);
            }
        }
    }, [inputMinutes, inputSeconds, state, timerMode, pomodoroPhase, workMinutes, shortBreakMinutes, longBreakMinutes]);

    // Use main-process BrowserWindow blur/focus events (source of truth)
    useEffect(() => {
        if (!window.electron?.onWindowBlur) return;

        const onBlur = () => {
            // Ignore blur during cooldown to prevent forced collapse
            if (Date.now() - lastPinToggleAt.current < PIN_COOLDOWN_MS) return;
            // Collapse on real BrowserWindow blur (outside click)
            if (isExpanded && !alwaysExpanded) {
                requestCollapse();
            }
        };

        const onFocus = () => {
            // no-op, but we keep the listener registered
        };

        window.electron.onWindowBlur(onBlur);

        // Optional: on focus you can do nothing or log
        if (window.electron.onWindowFocus) {
            window.electron.onWindowFocus(onFocus);
        }

        // Cleanup: remove listeners when effect re-runs or component unmounts
        return () => {
            // The preload's onWindowBlur/onWindowFocus already calls removeAllListeners
            // but we can add explicit cleanup if needed
            if (window.electron?.onWindowBlur) {
                window.electron.onWindowBlur(() => {});
            }
            if (window.electron?.onWindowFocus) {
                window.electron.onWindowFocus(() => {});
            }
        };
    }, [isExpanded, alwaysExpanded]);

    const isHovering = useRef(false);
    const isPinnedRef = useRef(isPinned);
    const isExpandedRef = useRef(isExpanded);

    // Keep refs in sync (still used for drag logic)
    useEffect(() => {
        isPinnedRef.current = isPinned;
    }, [isPinned]);

    useEffect(() => {
        isExpandedRef.current = isExpanded;
    }, [isExpanded]);

    // NOTE: Main process now handles selective click-through automatically.
    // We only ensure interactivity when expanded or unpinned.
    useEffect(() => {
        if (!window.electron) return;

        // If expanded: always ensure interactive (main process will also handle this, but ensure it here too)
        if (isExpanded) {
            window.electron.setIgnoreMouseEvents(false);
        }
        // Main process handles collapsed + pinned click-through automatically via polling
    }, [isExpanded]);

    // Finish glow ping effect (one-shot, tight red edge halo)
    useEffect(() => {
        if (finishFxKey === 0) return;
        if (!finishedFromCountdownRef.current) return;

        setFinishGlowOn(true);
        // Keep glow visible ~650ms total (includes fade-in/out for smooth animation)
        const t = window.setTimeout(() => setFinishGlowOn(false), 650);
        return () => window.clearTimeout(t);
    }, [finishFxKey]);

    // Shared morph progress: 1=expanded, 0=collapsed
    const morphT = useMotionValue(isSizeExpanded ? 1 : 0);

    useEffect(() => {
        // Faster spring for collapse, keep current for expansion
        const springConfig = isSizeExpanded 
            ? springApple 
            : { type: "spring" as const, stiffness: 680, damping: 45, mass: 0.85 };
        const controls = animate(morphT, isSizeExpanded ? 1 : 0, springConfig);
        return () => controls.stop();
    }, [isSizeExpanded, morphT]);

    // Compute expanded height based on mode and state
    const expandedH =
        timerMode === 'pomodoro'
            ? (state === 'idle' ? EXPANDED_H_POMO_IDLE : EXPANDED_H_POMO_ACTIVE)
            : EXPANDED_H_DEFAULT;

    // Compute collapsed dimensions
    const collapsedW = (state === 'running' || state === 'paused' || state === 'finished')
        ? ISLAND_W_ACTIVE
        : ISLAND_W_IDLE;
    const collapsedH = ISLAND_H_COLLAPSED;

    // Transform motion values from shared progress
    const wMv = useTransform(morphT, [0, 1], [collapsedW, ISLAND_W_EXPANDED]);
    const hMv = useTransform(morphT, [0, 1], [collapsedH, expandedH]);
    const rMv = useTransform(morphT, [0, 1], [COLLAPSED_RADIUS, 48]);

    // For interactive rect computation (uses final target values)
    const islandW = isSizeExpanded
        ? ISLAND_W_EXPANDED
        : collapsedW;
    const islandH = isSizeExpanded ? expandedH : collapsedH;

    const pad = isSizeExpanded ? PAD_EXPANDED : PAD_COLLAPSED;

    const winW = islandW + pad * 2;
    const winH = islandH + pad * 2;

    // Compute interactive rect in window-local coordinates
    const interactiveRect = useMemo(() => ({
        x: pad + ((winW - pad * 2) - islandW) / 2,
        y: pad,
        width: islandW,
        height: islandH,
    }), [pad, winW, islandW, islandH]);

    // Window resize: sync with animated motion values for smooth morph
    const lastSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
    const animationFrameRef = useRef<number | null>(null);
    const isAnimatingRef = useRef(false);

    useEffect(() => {
        if (!window.electron?.resizeWindow) return;

        isAnimatingRef.current = true;
        const targetW = isSizeExpanded ? ISLAND_W_EXPANDED : collapsedW;
        const targetH = isSizeExpanded ? expandedH : collapsedH;

        const updateWindowSize = () => {
            const currentW = wMv.get();
            const currentH = hMv.get();
            const pad = isSizeExpanded ? PAD_EXPANDED : PAD_COLLAPSED;
            const w = Math.round(currentW + pad * 2);
            const h = Math.round(currentH + pad * 2);

            // Dedupe: only call when size actually changed
            if (lastSizeRef.current.w !== w || lastSizeRef.current.h !== h) {
                lastSizeRef.current = { w, h };
                window.electron.resizeWindow(w, h);
            }

            // Check if animation is complete (within 1px of target)
            const wDiff = Math.abs(currentW - targetW);
            const hDiff = Math.abs(currentH - targetH);
            if (wDiff < 1 && hDiff < 1) {
                isAnimatingRef.current = false;
                return;
            }

            animationFrameRef.current = requestAnimationFrame(updateWindowSize);
        };

        animationFrameRef.current = requestAnimationFrame(updateWindowSize);
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            isAnimatingRef.current = false;
        };
    }, [wMv, hMv, isSizeExpanded, collapsedW, expandedH]);

    // Report overlay mode to main process
    useEffect(() => {
        if (!window.electron?.overlaySetMode) return;
        window.electron.overlaySetMode(isExpanded, isPinned);
    }, [isExpanded, isPinned]);

    // Report interactive rect to main process
    useEffect(() => {
        if (!window.electron?.overlaySetInteractiveRect) return;
        // Debug log to verify interactiveRect calculation
        console.log('interactiveRect', interactiveRect, { winW, winH, pad, islandW, islandH });
        window.electron.overlaySetInteractiveRect(interactiveRect);
    }, [interactiveRect]);

    const handleMouseEnter = () => {
        console.log('React: handleMouseEnter');
        isHovering.current = true;
        // Main process handles click-through automatically, but ensure interactivity when hovering
        // (main process polling will detect cursor over pill and enable interactivity)
    };

    const handleMouseLeave = () => {
        console.log('React: handleMouseLeave', { isDragging: isDragging.current });
        isHovering.current = false;
        // Main process handles click-through automatically via polling
        // Note: pointer capture handles drag even if cursor leaves, so we don't need to check dragging here
    };

    // Helper to check if target should not trigger drag
    const isNoDragTarget = (target: EventTarget | null): boolean => {
        if (!target) return false;
        const element = target as HTMLElement;
        return (
            element.tagName === 'BUTTON' ||
            element.tagName === 'INPUT' ||
            !!element.closest('button') ||
            !!element.closest('input') ||
            !!element.closest('[data-no-drag="true"]')
        );
    };

    // Pointer-based drag handlers for smooth, native-feeling drag
    const onPointerDown = (e: React.PointerEvent) => {
        if (isNoDragTarget(e.target)) return;

        isDragging.current = true;
        hasMoved.current = false;
        totalDrag.current = { x: 0, y: 0 };

        dragPointerId.current = e.pointerId;
        lastScreenPos.current = { x: e.screenX, y: e.screenY };

        // Capture pointer so drag continues even if cursor leaves window
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        // Force interactivity during drag - critical for smooth dragging
        window.electron?.setIgnoreMouseEvents(false);
    };

    const onPointerMove = (e: React.PointerEvent) => {
            if (!isDragging.current) return;
        if (dragPointerId.current !== e.pointerId) return;

        const dx = e.screenX - lastScreenPos.current.x;
        const dy = e.screenY - lastScreenPos.current.y;

        lastScreenPos.current = { x: e.screenX, y: e.screenY };

        // Track total movement for click detection (1px threshold)
        totalDrag.current.x += dx;
        totalDrag.current.y += dy;
        if (Math.abs(totalDrag.current.x) > 1 || Math.abs(totalDrag.current.y) > 1) {
                hasMoved.current = true;
            }

        // Accumulate delta and schedule rAF flush for smooth 60fps updates
        pendingDelta.current.x += dx;
        pendingDelta.current.y += dy;
        if (!rafId.current) {
            rafId.current = requestAnimationFrame(flushMove);
        }
    };

    const endPointerDrag = () => {
        // Release capture if still held
        if (dragPointerId.current !== null && isDragging.current) {
            // Note: release is automatic on pointer up/cancel, but we reset the ref
            dragPointerId.current = null;
        }

        isDragging.current = false;

        // Flush any pending move immediately
        if (rafId.current) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
            flushMove();
        }

        // Restore click-through rules AFTER drag ends
        // Main process polling will handle click-through automatically based on state
        // We don't need to manually set ignoreMouseEvents here since main process handles it
    };

    const handleClick = () => {
        // Only expand if we didn't drag
        if (!hasMoved.current && !isExpanded) {
            setIsSizeExpanded(true);
            setIsExpanded(true);
            // Force focus so the next outside click triggers a real blur event
            window.electron?.focusWindow?.();
        }
    };

    const handleRecenter = async (e: React.MouseEvent) => {
        e.stopPropagation();
        console.log('[UI] recenter clicked');

        const api = window.electron as any;
        if (!api) return console.error('[UI] window.electron missing');
        console.log('[UI] electron keys:', Object.keys(api));

        if (typeof api.recenterWindow !== 'function') {
            console.error('[UI] recenterWindow missing from preload');
            return;
        }

        try {
            await api.setIgnoreMouseEvents?.(false); // ensure interactive during click
            const res = await api.recenterWindow();
            console.log('[UI] recenter IPC response:', res);
        } catch (err) {
            console.error('[UI] recenter error:', err);
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const shouldFinishFx = state === 'finished' && finishedFromCountdownRef.current;

    return (
        <div 
            className="w-full h-full flex items-start justify-center" 
            style={{ 
                padding: pad,
                ...(DEBUG ? {
                    background: 'rgba(255,0,0,0.06)',
                    outline: '1px solid rgba(255,0,0,0.35)'
                } : {})
            }}
        >
            {/* Outer wrapper for FinishRing (non-overflow so ring doesn't clip) */}
        <motion.div
                className="relative"
                style={{ width: wMv, height: hMv }}
                animate={{
                    scale: shouldFinishFx && finishFxKey > 0 ? [1, FINISH_POP_SCALE, 1] : 1,
                }}
                transition={{
                    scale: shouldFinishFx ? { duration: FINISH_POP_DURATION, ease: easePremium } : { duration: 0.08 },
                }}
            >
                {/* Finish Ring Animation - outside pill container so it doesn't clip */}
                {shouldFinishFx && (
                    <FinishRing triggerKey={finishFxKey} />
                )}

                <motion.div
                    className="relative overflow-hidden border border-white/5 select-none cursor-grab active:cursor-grabbing transition-[box-shadow,filter] duration-300 ease-out"
            style={{
                        width: '100%',
                        height: '100%',
                background: 'rgba(0, 0, 0, 1)',
                        transformOrigin: '50% 50%',
                        borderRadius: rMv,
                        boxShadow: isSizeExpanded
                            ? '0 12px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)'
                            : 'none' // no shadow/glow in collapsed mode
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            initial={false}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endPointerDrag}
                    onPointerCancel={endPointerDrag}
            onClick={handleClick}
        >
            {/* Background Base */}
            <div className="absolute inset-0 bg-black pointer-events-none" />

                {/* Finish Glow Ping - tight red edge halo overlay with smooth fade */}
                <FinishGlow visible={finishGlowOn} />

            {/* AnimatePresence with onExitComplete: shrink container/window AFTER expanded content exits */}
            <AnimatePresence 
                mode="wait" 
                initial={false}
                onExitComplete={() => {
                    if (!isExpanded) {
                        setIsSizeExpanded(false);   // safety
                        setIsDismissing(false);     // reset after dismissal
                    }
                }}
            >
                {isExpanded ? (
                    <motion.div
                        key="expanded"
                        className="absolute inset-0 w-full min-w-0 min-h-0 flex flex-col pointer-events-auto"
                        style={{ padding: `${PAD_OUTER}px` }}
                        variants={viewFade}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        {/* A) Top Header */}
                        <motion.div
                            initial={false}
                            animate={{ opacity: isDismissing ? 0 : 1, y: isDismissing ? -2 : 0 }}
                            transition={{ duration: DISMISS_CHROME_MS / 1000, ease: easeApple }}
                            style={{ height: `${HEADER_H}px`, marginBottom: `${GAP_STACK}px` }}
                        >
                            <div 
                                className="flex justify-between items-center"
                                style={{ height: `${HEADER_H}px` }}
                            >
                            {/* Left Side: Mode Indicator */}
                                <div className="flex items-center">
                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black tracking-[0.15em] border uppercase transition-[background-color,color,border-color] duration-200 ${state === 'running' ? 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20' :
                                    state === 'paused' ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' :
                                        'bg-white/10 text-white border-white/20'
                                    }`}>
                                    {state === 'idle' ? timerMode : state}
                                </span>
                            </div>

                            {/* Right Side: Controls */}
                                <div 
                                    data-no-drag="true" 
                                    className="flex items-center"
                                    style={{ gap: `${GAP_INLINE}px` }}
                                >
                                {/* Pin Toggle */}
                                    <motion.button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            togglePin();
                                        }}
                                    title={isPinned ? "Unpin from top" : "Pin to top"}
                                        className={`rounded-full flex items-center justify-center transition-colors cursor-pointer ${isPinned ? 'text-zinc-200 bg-white/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                            }`}
                                        style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px` }}
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        {isPinned ? <Pin size={14} fill="currentColor" /> : <PinOff size={14} />}
                                    </motion.button>

                                    {/* Quit App */}
                                    <motion.button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            window.electron?.setIgnoreMouseEvents(false); // ensure interactivity
                                            window.electron?.quitApp?.();
                                        }}
                                        title="Quit"
                                        className="rounded-full flex items-center justify-center transition-colors cursor-pointer relative z-50 text-zinc-500 hover:text-red-300 hover:bg-red-500/10"
                                        style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px` }}
                                        data-no-drag="true"
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        <Power size={14} />
                                    </motion.button>

                                {/* Divider */}
                                    <div className="w-px h-3 bg-white/5" />

                                    {/* Recenter */}
                                    <motion.button
                                        onClick={handleRecenter}
                                        title="Recenter"
                                        className="bg-zinc-900 hover:bg-zinc-800 hover:text-white rounded-full flex items-center justify-center transition-colors cursor-pointer group relative z-50 pointer-events-auto"
                                        style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px` }}
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        <LocateFixed size={14} className="text-zinc-500 group-hover:text-white" />
                                    </motion.button>
                            </div>
                        </div>
                        </motion.div>

                        {/* B) Center Content */}
                        <div
                            className="flex-1 flex flex-col items-stretch"
                            style={{ minHeight: 0 }}
                        >
                        {/* Mode Toggle */}
                        {state === 'idle' && (
                                <div
                                    className="w-full min-w-0 grid grid-cols-3"
                                    style={{ gap: `${GAP_INLINE}px`, marginBottom: `${GAP_MODE_TIME}px` }}
                                >
                                    {/* Countdown */}
                                    <motion.button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTimerMode('countdown');
                                    }}
                                        className={`min-w-0 w-full flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer ${timerMode === 'countdown'
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.16)]'
                                        : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                        }`}
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        <Timer size={14} strokeWidth={3} className="shrink-0" />
                                        <span className="truncate">Timer</span>
                                    </motion.button>

                                    {/* Countup */}
                                    <motion.button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTimerMode('countup');
                                    }}
                                        className={`min-w-0 w-full flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer ${timerMode === 'countup'
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.16)]'
                                        : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                        }`}
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        <Clock size={14} strokeWidth={3} className="shrink-0" />
                                        <span className="truncate">Stopwatch</span>
                                    </motion.button>

                                    {/* Pomodoro */}
                                    <motion.button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTimerMode('pomodoro');
                                        }}
                                        className={`min-w-0 w-full flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer ${timerMode === 'pomodoro'
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.16)]'
                                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        <Flame size={14} strokeWidth={3} className="shrink-0" />
                                        <span className="truncate">Pomodoro</span>
                                    </motion.button>
                            </div>
                        )}

                            {/* Content area */}
                            <div
                                className="flex-1 w-full min-h-0"
                                style={{ overflow: 'visible' }}
                            >
                                {/* Time Display / Inputs */}
                            {state === 'idle' ? (
                                    timerMode === 'pomodoro' ? (
                                        <div className="flex flex-col items-center justify-start w-full pt-1" style={{ gap: `${GAP_STACK}px` }}>
                                            {/* Settings */}
                                            <div className="w-full max-w-[340px] mx-auto grid grid-cols-[1fr_110px_64px] gap-x-4 gap-y-4 items-center">
                                                {/* Work */}
                                                <label className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase text-right pr-1 whitespace-nowrap">
                                                    Work
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="99"
                                                    value={workMinutes}
                                                    onChange={(e) => {
                                                        const val = Math.max(1, Math.min(99, parseInt(e.target.value) || 1));
                                                        setWorkMinutes(val);
                                                    }}
                                                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-center text-white text-sm font-mono focus:outline-none focus:border-white/20"
                                                />
                                                <span className="text-[10px] text-zinc-600 whitespace-nowrap text-left pl-1">
                                                    min
                                                </span>

                                                {/* Short Break */}
                                                <label className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase text-right pr-1 whitespace-nowrap">
                                                    Short break
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="60"
                                                    value={shortBreakMinutes}
                                                    onChange={(e) => {
                                                        const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
                                                        setShortBreakMinutes(val);
                                                    }}
                                                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-center text-white text-sm font-mono focus:outline-none focus:border-white/20"
                                                />
                                                <span className="text-[10px] text-zinc-600 whitespace-nowrap text-left pl-1">
                                                    min
                                                </span>

                                                {/* Long Break */}
                                                <label className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase text-right pr-1 whitespace-nowrap">
                                                    Long break
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="60"
                                                    value={longBreakMinutes}
                                                    onChange={(e) => {
                                                        const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
                                                        setLongBreakMinutes(val);
                                                    }}
                                                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-center text-white text-sm font-mono focus:outline-none focus:border-white/20"
                                                />
                                                <span className="text-[10px] text-zinc-600 whitespace-nowrap text-left pl-1">
                                                    min
                                                </span>

                                                {/* Long Break Every */}
                                                <label className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase text-right pr-1 whitespace-nowrap">
                                                    Long break every
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="10"
                                                    value={longBreakEvery}
                                                    onChange={(e) => {
                                                        const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                                                        setLongBreakEvery(val);
                                                    }}
                                                    className="w-full bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-center text-white text-sm font-mono focus:outline-none focus:border-white/20"
                                                />
                                                <span className="text-[10px] text-zinc-600 whitespace-nowrap text-left pl-1">
                                                    sessions
                                                </span>

                                                {/* Auto-start Next */}
                                                <label className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase text-right pr-1 whitespace-nowrap">
                                                    Auto-start next
                                                </label>

                                                {/* keep existing toggle logic unchanged, just place it in column 2 */}
                                                <div className="justify-self-start">
                                                    <motion.button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAutoStartNext(!autoStartNext);
                                                        }}
                                                        className={`w-12 h-6 rounded-full transition-colors ${autoStartNext ? 'bg-cyan-400' : 'bg-zinc-800'}`}
                                                        whileTap={pressTap}
                                                    >
                                                        <motion.div
                                                            className="w-5 h-5 bg-white rounded-full shadow-lg"
                                                            animate={{ x: autoStartNext ? 26 : 2 }}
                                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                        />
                                                    </motion.button>
                                                </div>

                                                {/* empty unit cell to preserve grid */}
                                                <span />
                                            </div>
                                            
                                            {/* Current Phase Display */}
                                            <div className="flex flex-col items-center" style={{ gap: `${GAP_INLINE}px`, marginTop: `10px` }}>
                                                <span className="text-7xl font-mono font-black text-white tracking-tighter tabular-nums">
                                                    {formatTime(timeLeft)}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">
                                                        {pomodoroPhase === 'work' ? 'Work' : pomodoroPhase === 'short_break' ? 'Break' : 'Long Break'}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-600">•</span>
                                                    <span className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase">
                                                        Session {pomodoroSessionCount + 1} / {longBreakEvery}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : timerMode === 'countdown' ? (
                                        <div className="flex flex-col items-center justify-center w-full">
                                        {/* Digit Row */}
                                        <div className="flex items-center justify-center">
                                            <div className="w-24 flex justify-center">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputMinutes.toString().padStart(2, '0')}
                                                    onChange={(e) => setInputMinutes(Math.max(0, Math.min(99, parseInt(e.target.value.replace(/\D/g, '')) || 0)))}
                                                    onWheel={(e) => {
                                                        const delta = e.deltaY < 0 ? 1 : -1;
                                                        setInputMinutes(prev => Math.max(0, Math.min(99, prev + delta)));
                                                    }}
                                                    className="w-full !bg-transparent text-center focus:outline-none border-b border-white/5 focus:border-white/20 transition-all p-0 leading-none tabular-nums text-7xl font-black text-white appearance-none"
                                                    placeholder="00"
                                                />
                                            </div>

                                            <div className="w-12 flex items-center justify-center">
                                                <span className="text-white/20 text-7xl font-black leading-none">:</span>
                                            </div>

                                            <div className="w-24 flex justify-center">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputSeconds.toString().padStart(2, '0')}
                                                    onChange={(e) => setInputSeconds(Math.max(0, Math.min(59, parseInt(e.target.value.replace(/\D/g, '')) || 0)))}
                                                    onWheel={(e) => {
                                                        const delta = e.deltaY < 0 ? 1 : -1;
                                                        setInputSeconds(prev => Math.max(0, Math.min(59, prev + delta)));
                                                    }}
                                                    className="w-full !bg-transparent text-center focus:outline-none border-b border-white/5 focus:border-white/20 transition-all p-0 leading-none tabular-nums text-7xl font-black text-white appearance-none"
                                                    placeholder="00"
                                                />
                                            </div>
                                        </div>

                                        {/* Label Row */}
                                        <div className="flex items-center mt-4 text-zinc-600 font-black tracking-[0.2em] uppercase text-[10px] leading-none">
                                            <div className="w-24 text-center">Minutes</div>
                                            <div className="w-12" /> {/* Spacer matched to colon area */}
                                            <div className="w-24 text-center">Seconds</div>
                                        </div>
                                    </div>
                                ) : (
                                        <div className="flex flex-col items-center" style={{ gap: `${GAP_INLINE * 2}px` }}>
                                        <span className="text-7xl font-mono font-black text-white/20 tracking-tighter tabular-nums">00:00</span>
                                        <span className="text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">Ready</span>
                                    </div>
                                )
                            ) : (
                                    <div className="flex flex-col items-center" style={{ gap: `${GAP_INLINE * 2}px` }}>
                                        <motion.div
                                            className={`text-8xl font-mono font-black tracking-tighter tabular-nums antialiased transition-[color,filter] duration-200 ease-out ${state === 'running' ? 'text-cyan-400' :
                                        state === 'paused' ? 'text-yellow-400' :
                                            state === 'finished' ? 'text-red-500' : 'text-white'
                                        }`}
                                            animate={{
                                        filter: state === 'running'
                                            ? 'drop-shadow(0 0 15px rgba(34, 211, 238, 0.4))'
                                            : state === 'paused'
                                                ? 'drop-shadow(0 0 10px rgba(250, 204, 21, 0.2))'
                                                        : state === 'finished'
                                                            ? 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.3))'
                                                : 'none'
                                    }}
                                            transition={fadeMed}
                                >
                                    {formatTime(timeLeft)}
                                        </motion.div>
                                        {timerMode === 'pomodoro' && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">
                                                    {pomodoroPhase === 'work' ? 'Work' : pomodoroPhase === 'short_break' ? 'Break' : 'Long Break'}
                                                </span>
                                                <span className="text-[10px] text-zinc-600">•</span>
                                                <span className="text-[10px] font-black tracking-[0.2em] text-zinc-600 uppercase">
                                                    Session {pomodoroSessionCount + 1} / {longBreakEvery}
                                                </span>
                                </div>
                            )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* C) Bottom Controls */}
                        <div className="shrink-0">
                        <div 
                            className="flex items-center justify-center"
                            style={{ gap: `${GAP_CONTROLS}px`, marginTop: `${(timerMode === 'pomodoro' && state === 'idle') ? 10 : GAP_STACK}px` }}
                        >
                            <motion.button
                                onClick={stopTimer}
                                className="p-3.5 rounded-full bg-zinc-900 hover:bg-white text-zinc-500 hover:text-black transition-colors cursor-pointer shadow-lg"
                                title="Reset"
                                whileHover={hoverLift}
                                whileTap={pressTap}
                                transition={{ duration: 0.12, ease: easeApple }}
                            >
                                <RefreshCw size={20} strokeWidth={2.5} />
                            </motion.button>

                            {state === 'running' ? (
                                <motion.button
                                    onClick={pauseTimer}
                                    className="p-5 rounded-full transition-all cursor-pointer shadow-2xl bg-cyan-400 text-black shadow-cyan-400/20"
                                    whileHover={hoverLift}
                                    whileTap={pressTap}
                                    transition={{ duration: 0.12, ease: easeApple }}
                                >
                                    <Pause size={24} fill="currentColor" strokeWidth={0} />
                                </motion.button>
                            ) : (
                                <motion.button
                                    onClick={startTimer}
                                    className={`p-5 rounded-full transition-all cursor-pointer shadow-2xl ${state === 'paused' ? 'bg-yellow-400 text-black shadow-yellow-400/20' : 'bg-white text-black'
                                        }`}
                                    whileHover={hoverLift}
                                    whileTap={pressTap}
                                    transition={{ duration: 0.12, ease: easeApple }}
                                >
                                    <Play size={24} fill="currentColor" strokeWidth={0} className="ml-1" />
                                </motion.button>
                            )}
                        </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="collapsed"
                        className="absolute inset-0 flex items-center justify-between px-5 pointer-events-auto"
                        variants={viewFade}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        {state === 'idle' && (
                            <div className="w-full flex justify-center">
                                <span className="text-[11px] font-bold tracking-widest text-zinc-500 uppercase">
                                    {timerMode === 'countdown' ? 'Set Timer' : timerMode === 'countup' ? 'Stopwatch' : 'Pomodoro'}
                                </span>
                            </div>
                        )}
                        {(state === 'running' || state === 'paused' || state === 'finished') && (
                            <>
                                <div className="flex items-center gap-3">
                                    {/* Icon without badge - just the icon itself */}
                                    {(() => {
                                        const iconSize = 17; // slightly bigger, still smaller than digits
                                        const iconClass =
                                            state === 'running'
                                                ? 'text-cyan-400'
                                                : state === 'paused'
                                                ? 'text-yellow-400'
                                                : state === 'finished'
                                                ? 'text-red-500'
                                                : 'text-zinc-500';
                                        
                                        if (timerMode === 'pomodoro') {
                                            // Show different icon based on phase
                                            const Icon = pomodoroPhase === 'work' ? Flame : Coffee;
                                            return <Icon size={iconSize} className={iconClass} strokeWidth={2.5} />;
                                        } else if (timerMode === 'countdown') {
                                            return <Timer size={iconSize} className={iconClass} strokeWidth={2.5} />;
                                        } else {
                                            return <Clock size={iconSize} className={iconClass} strokeWidth={2.5} />;
                                        }
                                    })()}
                                    <motion.span 
                                        className={`font-mono font-bold tracking-tighter text-base tabular-nums transition-colors duration-200 ${state === 'running' ? 'text-cyan-400' :
                                            state === 'paused' ? 'text-yellow-400' :
                                                state === 'finished' ? 'text-red-500' : 'text-zinc-400'
                                            }`}
                                    >
                                        {formatTime(timeLeft)}
                                    </motion.span>
                                </div>
                                <motion.button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (state === 'running') pauseTimer();
                                        else if (state === 'paused') startTimer();
                                        else if (state === 'finished') stopTimer();
                                    }}
                                    className="p-2 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                    whileHover={hoverLift}
                                    whileTap={pressTap}
                                    transition={{ duration: 0.12, ease: easeApple }}
                                >
                                    {state === 'running' ? <Pause size={14} fill="currentColor" /> :
                                        state === 'finished' ? <RefreshCw size={14} /> :
                                            <Play size={14} fill="currentColor" className="ml-0.5" />}
                                </motion.button>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
            </motion.div>
        </div>
    );
};

export default Island;
