import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RefreshCw, X, Timer, Clock, Pin, PinOff, Maximize2, Minimize2 } from 'lucide-react';
import { springApple, viewFade, easeApple, pressTap, hoverLift, fadeMed } from './motion';

// DEBUG mode - set to false to remove red window outline
const DEBUG = false;

type TimerState = 'idle' | 'running' | 'paused' | 'finished';
type TimerMode = 'countdown' | 'countup';

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

    const Icon = mode === 'countdown' ? Timer : Clock;

    return (
        <motion.div
            className={`flex items-center justify-center w-5 h-5 rounded-full border transition-[box-shadow,background-color,border-color,color] duration-200 ${ringClass} ${colorClass}`}
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
            <Icon size={12} strokeWidth={2.5} />
        </motion.div>
    );
};

// Island size constants - single source of truth
const ISLAND_W_EXPANDED = 400;
const ISLAND_H_EXPANDED = 380;

const ISLAND_H_COLLAPSED = 34;
const ISLAND_W_IDLE = 150;
const ISLAND_W_ACTIVE = 140; // running/paused/finished

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

const Island = () => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [state, setState] = useState<TimerState>('idle');
    const [timeLeft, setTimeLeft] = useState(15 * 60);
    const [timerMode, setTimerMode] = useState<TimerMode>('countdown');

    const [inputMinutes, setInputMinutes] = useState(15);
    const [inputSeconds, setInputSeconds] = useState(0);

    // New Features State
    const [isPinned, setIsPinned] = useState(true);
    const [alwaysExpanded, setAlwaysExpanded] = useState(false);

    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Drag state
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);

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
            } else {
                setTimeLeft(0);
                startTimeRef.current = now;
            }
        } else if (state === 'paused') {
            // Resuming logic
            if (timerMode === 'countdown') {
                // Determine new end time based on remaining timeLeft
                endTimeRef.current = now + timeLeft * 1000;
            } else {
                // Determine new start time based on elapsed timeLeft
                startTimeRef.current = now - timeLeft * 1000;
            }
        }

        setState('running');
        // Only collapse for countdown to get it out of the way; 
        // Keep expanded for stopwatch so user can see it start counting
        if (timerMode === 'countdown') {
            setIsExpanded(false);
        }
    };

    const pauseTimer = () => {
        setState('paused');
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const stopTimer = () => {
        setState('idle');
        if (timerMode === 'countup') setTimeLeft(0);
        if (timerRef.current) clearInterval(timerRef.current);
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

    useEffect(() => {
        if (state === 'running') {
            timerRef.current = setInterval(() => {
                const now = Date.now();

                setTimeLeft((prev) => {
                    if (timerMode === 'countdown') {
                        const remaining = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));

                        if (remaining <= 0) {
                            clearInterval(timerRef.current!);
                            setState('finished');
                            setIsExpanded(true);
                            playBeep();
                            return 0;
                        }
                        return remaining;
                    } else {
                        // Countup - use max to prevent negative jitter on first tick
                        const elapsed = Math.max(0, Math.floor((now - startTimeRef.current) / 1000));
                        return elapsed;
                    }
                });
            }, 100); // Check more frequently for smoothness, though updating state effectively per second change
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [state, timerMode]);

    // Sync timeLeft with inputs when idle
    useEffect(() => {
        if (state === 'idle') {
            if (timerMode === 'countdown') {
                setTimeLeft(inputMinutes * 60 + inputSeconds);
            } else {
                setTimeLeft(0);
            }
        }
    }, [inputMinutes, inputSeconds, state, timerMode]);

    // Use main-process BrowserWindow blur/focus events (source of truth)
    useEffect(() => {
        if (!window.electron?.onWindowBlur) return;

        const onBlur = () => {
            // Ignore blur during cooldown to prevent forced collapse
            if (Date.now() - lastPinToggleAt.current < PIN_COOLDOWN_MS) return;
            // Collapse on real BrowserWindow blur (outside click)
            if (isExpanded && !alwaysExpanded) setIsExpanded(false);
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

    // Compute current island size
    const islandW = isExpanded
        ? ISLAND_W_EXPANDED
        : (state === 'running' || state === 'paused' || state === 'finished')
            ? ISLAND_W_ACTIVE
            : ISLAND_W_IDLE;

    const islandH = isExpanded ? ISLAND_H_EXPANDED : ISLAND_H_COLLAPSED;

    const pad = isExpanded ? PAD_EXPANDED : PAD_COLLAPSED;

    const winW = islandW + pad * 2;
    const winH = islandH + pad * 2;

    // Compute interactive rect in window-local coordinates
    const interactiveRect = useMemo(() => ({
        x: pad + ((winW - pad * 2) - islandW) / 2,
        y: pad,
        width: islandW,
        height: islandH,
    }), [pad, winW, islandW, islandH]);

    // Window resize: throttled + deduplicated for smooth performance
    const lastSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

    useEffect(() => {
        if (!window.electron?.resizeWindow) return;

        const w = winW;
        const h = winH;
        
        // Dedupe: only call when size actually changed
        if (lastSizeRef.current.w === w && lastSizeRef.current.h === h) return;
        lastSizeRef.current = { w, h };

        // Throttle via requestAnimationFrame
        const id = requestAnimationFrame(() => {
            window.electron?.resizeWindow(w, h);
        });
        return () => cancelAnimationFrame(id);
    }, [winW, winH]);

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
    };

    // Custom drag implementation
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;

            const deltaX = e.screenX - dragStart.current.x;
            const deltaY = e.screenY - dragStart.current.y;

            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                hasMoved.current = true;
            }

            if (hasMoved.current && window.electron) {
                window.electron.moveWindow(deltaX, deltaY);
                dragStart.current = { x: e.screenX, y: e.screenY };
            }
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            // Main process handles click-through automatically via polling
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Don't start drag if clicking on interactive elements or no-drag zones
        const target = e.target as HTMLElement;
        if (
            target.tagName === 'BUTTON' || 
            target.tagName === 'INPUT' || 
            target.closest('button') || 
            target.closest('input') ||
            target.closest('[data-no-drag="true"]')
        ) {
            return;
        }

        isDragging.current = true;
        hasMoved.current = false;
        dragStart.current = { x: e.screenX, y: e.screenY };
    };

    const handleClick = () => {
        // Only expand if we didn't drag
        if (!hasMoved.current && !isExpanded) {
            setIsExpanded(true);
            // Force focus so the next outside click triggers a real blur event
            window.electron?.focusWindow?.();
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

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
            <motion.div
                layout
                className="relative overflow-hidden border border-white/5 select-none cursor-grab active:cursor-grabbing transition-[box-shadow,filter] duration-200 ease-out"
                style={{
                    background: 'rgba(0, 0, 0, 1)',
                    transformOrigin: '50% 50%',
                    boxShadow: isExpanded
                        ? '0 12px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)'
                        : 'none'  // no shadow/glow in collapsed mode
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                initial={false}
                animate={{
                    width: islandW,
                    height: islandH,
                    borderRadius: isExpanded ? 48 : 20
                }}
                transition={springApple}
                onMouseDown={handleMouseDown}
                onClick={handleClick}
            >
            {/* Background Base */}
            <div className="absolute inset-0 bg-black pointer-events-none" />

            {/* CONTENT VIEWS - Single AnimatePresence with mode="wait" for smooth transitions */}
            <AnimatePresence mode="wait" initial={false}>
                {isExpanded ? (
                    <motion.div
                        key="expanded"
                        className="absolute inset-0 flex flex-col pointer-events-auto"
                        style={{ padding: `${PAD_OUTER}px` }}
                        variants={viewFade}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        {/* A) Top Header */}
                        <div 
                            className="flex justify-between items-center"
                            style={{ height: `${HEADER_H}px`, marginBottom: `${GAP_STACK}px` }}
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

                                {/* Always Expanded Toggle */}
                                <motion.button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setAlwaysExpanded(!alwaysExpanded);
                                    }}
                                    title={alwaysExpanded ? "Disable always expanded" : "Keep expanded"}
                                    className={`rounded-full flex items-center justify-center transition-colors cursor-pointer ${alwaysExpanded ? 'text-zinc-200 bg-white/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                        }`}
                                    style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px` }}
                                    whileHover={hoverLift}
                                    whileTap={pressTap}
                                    transition={{ duration: 0.12, ease: easeApple }}
                                >
                                    {alwaysExpanded ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                                </motion.button>

                                {/* Divider */}
                                <div className="w-px h-3 bg-white/5" />

                                {/* Close/Collapse */}
                                <motion.button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsExpanded(false);
                                    }}
                                    className="bg-zinc-900 hover:bg-zinc-800 hover:text-white rounded-full flex items-center justify-center transition-colors cursor-pointer group"
                                    style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px` }}
                                    whileHover={hoverLift}
                                    whileTap={pressTap}
                                    transition={{ duration: 0.12, ease: easeApple }}
                                >
                                    <X size={14} className="text-zinc-500 group-hover:text-white" />
                                </motion.button>
                            </div>
                        </div>

                        {/* B) Center Content */}
                        <div 
                            className="flex-1 flex flex-col items-center justify-center"
                            style={{ paddingLeft: 0, paddingRight: 0 }}
                        >
                            {/* Mode Toggle */}
                            {state === 'idle' && (
                                <div 
                                    className="flex items-center justify-center"
                                    style={{ gap: `${GAP_INLINE}px`, marginBottom: `${GAP_MODE_TIME}px` }}
                                >
                                    <motion.button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTimerMode('countdown');
                                        }}
                                        className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black tracking-widest transition-all cursor-pointer uppercase min-w-[120px] relative z-10 ${timerMode === 'countdown'
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        <div className="flex items-center gap-2 pointer-events-none">
                                            <Timer size={14} strokeWidth={3} />
                                            Timer
                                        </div>
                                    </motion.button>
                                    <motion.button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTimerMode('countup');
                                        }}
                                        className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black tracking-widest transition-all cursor-pointer uppercase min-w-[120px] relative z-10 ${timerMode === 'countup'
                                            ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        whileHover={hoverLift}
                                        whileTap={pressTap}
                                        transition={{ duration: 0.12, ease: easeApple }}
                                    >
                                        <div className="flex items-center gap-2 pointer-events-none">
                                            <Clock size={14} strokeWidth={3} />
                                            Stopwatch
                                        </div>
                                    </motion.button>
                                </div>
                            )}

                            {/* Time Display / Inputs */}
                            {state === 'idle' ? (
                                timerMode === 'countdown' ? (
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
                            )}
                        </div>

                        {/* C) Bottom Controls */}
                        <div 
                            className="flex items-center justify-center"
                            style={{ gap: `${GAP_CONTROLS}px`, marginTop: `${GAP_STACK}px` }}
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
                    </motion.div>
                ) : (
                    <motion.div
                        key="collapsed"
                        className="absolute inset-0 flex items-center justify-between px-4 pointer-events-auto"
                        variants={viewFade}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        {state === 'idle' && (
                            <div className="w-full flex justify-center">
                                <span className="text-[11px] font-bold tracking-widest text-zinc-500 uppercase">
                                    {timerMode === 'countdown' ? 'Set Timer' : 'Stopwatch'}
                                </span>
                            </div>
                        )}
                        {(state === 'running' || state === 'paused' || state === 'finished') && (
                            <>
                                <div className="flex items-center gap-2">
                                    <ModeBadgeIcon mode={timerMode} state={state} allowGlow={false} />
                                    <motion.span 
                                        className={`font-mono font-bold tracking-tighter text-sm transition-colors duration-200 ${state === 'running' ? 'text-cyan-400' :
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
                                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                    whileHover={hoverLift}
                                    whileTap={pressTap}
                                    transition={{ duration: 0.12, ease: easeApple }}
                                >
                                    {state === 'running' ? <Pause size={13} fill="currentColor" /> :
                                        state === 'finished' ? <RefreshCw size={13} /> :
                                            <Play size={13} fill="currentColor" className="ml-0.5" />}
                                </motion.button>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
        </div>
    );
};

export default Island;
