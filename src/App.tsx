import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RefreshCw, X, Timer, Clock, Pin, PinOff, Maximize2, Minimize2 } from 'lucide-react';

// Extend window type for Electron API
declare global {
    interface Window {
        electron?: {
            resizeWindow: (width: number, height: number) => Promise<void>;
            moveWindow: (deltaX: number, deltaY: number) => Promise<void>;
            setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => Promise<void>;
            setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
        };
    }
}

type TimerState = 'idle' | 'running' | 'paused' | 'finished';
type TimerMode = 'countdown' | 'countup';

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

    // Toggle Pin
    const togglePin = () => {
        const newState = !isPinned;
        setIsPinned(newState);
        if (window.electron) window.electron.setAlwaysOnTop(newState);
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

    useEffect(() => {
        const handleBlur = () => {
            // Respect alwaysExpanded preference
            if (isExpanded && !alwaysExpanded) setIsExpanded(false);
        };
        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [isExpanded, alwaysExpanded]);

    const isHovering = useRef(false);

    // Set initial mouse ignore state
    useEffect(() => {
        if (window.electron) {
            window.electron.setIgnoreMouseEvents(true, { forward: true });
        }
    }, []);

    const handleMouseEnter = () => {
        console.log('React: handleMouseEnter');
        isHovering.current = true;
        if (window.electron) {
            window.electron.setIgnoreMouseEvents(false);
        }
    };

    const handleMouseLeave = () => {
        console.log('React: handleMouseLeave', { isDragging: isDragging.current });
        isHovering.current = false;
        if (window.electron && !isDragging.current) {
            window.electron.setIgnoreMouseEvents(true, { forward: true });
        }
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
            // If we released drag and we are not hovering anymore (dragged out), 
            // set transparency back on
            if (!isHovering.current && window.electron) {
                window.electron.setIgnoreMouseEvents(true, { forward: true });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Don't start drag if clicking on interactive elements
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('button') || target.closest('input')) {
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
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };


    return (
        <motion.div
            className="relative overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.8)] border border-white/5 select-none cursor-grab active:cursor-grabbing"
            style={{
                background: 'rgba(0, 0, 0, 1)',
                boxShadow: isExpanded
                    ? '0 25px 50px -12px rgba(0,0,0,1), inset 0 1px 0 rgba(255,255,255,0.05)'
                    : '0 4px 12px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)'
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            initial={false}
            animate={{
                width: isExpanded ? 400 : (state === 'running' || state === 'paused' ? 140 : 150),
                height: isExpanded ? 380 : 34,
                borderRadius: isExpanded ? 48 : 20
            }}
            transition={{ type: 'spring', stiffness: 200, damping: 25, mass: 0.8 }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            {/* Background Base */}
            <div className="absolute inset-0 bg-black pointer-events-none" />

            {/* COLLAPSED VIEW */}
            <AnimatePresence>
                {!isExpanded && (
                    <motion.div
                        key="collapsed"
                        className="absolute inset-0 flex items-center justify-between px-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
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
                                    {state === 'running' && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                                    )}
                                    <span className={`font-mono font-bold tracking-tighter text-sm ${state === 'running' ? 'text-cyan-400' :
                                        state === 'paused' ? 'text-yellow-400' :
                                            state === 'finished' ? 'text-red-500' : 'text-zinc-400'
                                        }`}>
                                        {formatTime(timeLeft)}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (state === 'running') pauseTimer();
                                        else if (state === 'paused') startTimer();
                                        else if (state === 'finished') stopTimer();
                                    }}
                                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                >
                                    {state === 'running' ? <Pause size={13} fill="currentColor" /> :
                                        state === 'finished' ? <RefreshCw size={13} /> :
                                            <Play size={13} fill="currentColor" className="ml-0.5" />}
                                </button>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* EXPANDED VIEW */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        key="expanded"
                        className="absolute inset-0 flex flex-col gap-2 p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center">
                            {/* Left Side: Mode Indicator */}
                            <div className="flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black tracking-[0.15em] border uppercase ${state === 'running' ? 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20' :
                                    state === 'paused' ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' :
                                        'bg-white/10 text-white border-white/20'
                                    }`}>
                                    {state === 'idle' ? timerMode : state}
                                </span>
                            </div>

                            {/* Right Side: Controls */}
                            <div className="flex items-center gap-1">
                                {/* Pin Toggle */}
                                <button
                                    onClick={togglePin}
                                    title={isPinned ? "Unpin from top" : "Pin to top"}
                                    className={`p-1.5 rounded-full transition-colors cursor-pointer ${isPinned ? 'text-zinc-200 bg-white/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                        }`}
                                >
                                    {isPinned ? <Pin size={12} fill="currentColor" /> : <PinOff size={12} />}
                                </button>

                                {/* Always Expanded Toggle */}
                                <button
                                    onClick={() => setAlwaysExpanded(!alwaysExpanded)}
                                    title={alwaysExpanded ? "Disable always expanded" : "Keep expanded"}
                                    className={`p-1.5 rounded-full transition-colors cursor-pointer ${alwaysExpanded ? 'text-zinc-200 bg-white/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                        }`}
                                >
                                    {alwaysExpanded ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                                </button>

                                {/* Divider */}
                                <div className="w-px h-3 bg-white/5 mx-1" />

                                {/* Close/Collapse */}
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="bg-zinc-900 hover:bg-zinc-800 hover:text-white rounded-full p-1.5 transition-colors cursor-pointer group"
                                >
                                    <X size={12} className="text-zinc-500 group-hover:text-white" />
                                </button>
                            </div>
                        </div>

                        {/* Mode Toggle */}
                        {state === 'idle' && (
                            <div className="flex items-center justify-center gap-3 my-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTimerMode('countdown');
                                    }}
                                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black tracking-widest transition-all cursor-pointer uppercase min-w-[120px] relative z-10 ${timerMode === 'countdown'
                                        ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                                        : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 pointer-events-none">
                                        <Timer size={14} strokeWidth={3} />
                                        Timer
                                    </div>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTimerMode('countup');
                                    }}
                                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black tracking-widest transition-all cursor-pointer uppercase min-w-[120px] relative z-10 ${timerMode === 'countup'
                                        ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                                        : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 pointer-events-none">
                                        <Clock size={14} strokeWidth={3} />
                                        Stopwatch
                                    </div>
                                </button>
                            </div>
                        )}

                        <div className="flex-1 flex items-center justify-center -mt-10">
                            {state === 'idle' ? (
                                timerMode === 'countdown' ? (
                                    <div className="flex flex-col items-center justify-center w-full min-h-[160px]">
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
                                    <div className="flex flex-col items-center gap-4">
                                        <span className="text-7xl font-mono font-black text-white/20 tracking-tighter tabular-nums">00:00</span>
                                        <span className="text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">Ready</span>
                                    </div>
                                )
                            ) : (
                                <div
                                    className={`text-8xl font-mono font-black tracking-tighter tabular-nums antialiased transition-all duration-300 ${state === 'running' ? 'text-cyan-400' :
                                        state === 'paused' ? 'text-yellow-400' :
                                            state === 'finished' ? 'text-red-500' : 'text-white'
                                        }`}
                                    style={{
                                        filter: state === 'running'
                                            ? 'drop-shadow(0 0 15px rgba(34, 211, 238, 0.4))'
                                            : state === 'paused'
                                                ? 'drop-shadow(0 0 10px rgba(250, 204, 21, 0.2))'
                                                : 'none'
                                    }}
                                >
                                    {formatTime(timeLeft)}
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-8 mb-2">
                            <button
                                onClick={stopTimer}
                                className="p-3.5 rounded-full bg-zinc-900 hover:bg-white text-zinc-500 hover:text-black transition-all cursor-pointer shadow-lg"
                                title="Reset"
                            >
                                <RefreshCw size={20} strokeWidth={2.5} />
                            </button>

                            {state === 'running' ? (
                                <button
                                    onClick={pauseTimer}
                                    className="p-5 rounded-full transition-all cursor-pointer shadow-2xl bg-cyan-400 text-black shadow-cyan-400/20"
                                >
                                    <Pause size={24} fill="currentColor" strokeWidth={0} />
                                </button>
                            ) : (
                                <button
                                    onClick={startTimer}
                                    className={`p-5 rounded-full transition-all cursor-pointer shadow-2xl ${state === 'paused' ? 'bg-yellow-400 text-black shadow-yellow-400/20' : 'bg-white text-black'
                                        }`}
                                >
                                    <Play size={24} fill="currentColor" strokeWidth={0} className="ml-1" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default Island;
