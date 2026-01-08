import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RefreshCw, X, Timer, Clock } from 'lucide-react';

// Extend window type for Electron API
declare global {
    interface Window {
        electron?: {
            resizeWindow: (width: number, height: number) => Promise<void>;
            moveWindow: (deltaX: number, deltaY: number) => Promise<void>;
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

    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Drag state
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);

    const endTimeRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);

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
        setIsExpanded(false);
    };

    const pauseTimer = () => {
        setState('paused');
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const stopTimer = () => {
        setState('idle');
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
                        // Countup
                        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
                        return elapsed;
                    }
                });
            }, 100); // Check more frequently for smoothness, though updating state effectively per second change
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [state, timerMode]);

    useEffect(() => {
        const handleBlur = () => {
            if (isExpanded) setIsExpanded(false);
        };
        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [isExpanded]);

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
            className="relative overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10 select-none cursor-grab active:cursor-grabbing"
            style={{
                background: 'linear-gradient(180deg, rgba(39,39,42,1) 0%, rgba(9,9,11,1) 100%)',
                boxShadow: isExpanded
                    ? '0 20px 50px -12px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)'
                    : '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
            }}
            initial={false}
            animate={{
                width: isExpanded ? 360 : (state === 'running' || state === 'paused' ? 120 : 150),
                height: isExpanded ? 240 : 40,
                borderRadius: isExpanded ? 40 : 20
            }}
            transition={{ type: 'spring', stiffness: 200, damping: 25, mass: 0.8 }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            {/* Noise Overlay */}
            <div className="absolute inset-0 bg-white/[0.02] pointer-events-none" />

            {/* COLLAPSED VIEW */}
            <AnimatePresence>
                {!isExpanded && (
                    <motion.div
                        key="collapsed"
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {state === 'idle' && (
                            <span className="text-sm font-medium text-zinc-400">Set Timer</span>
                        )}
                        {(state === 'running' || state === 'paused' || state === 'finished') && (
                            <div className="flex items-center gap-2">
                                {state === 'running' && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                )}
                                <span className={`font-mono font-bold tracking-tight ${state === 'running' ? 'text-emerald-400' :
                                    state === 'finished' ? 'text-red-500' : 'text-amber-400'
                                    }`}>
                                    {formatTime(timeLeft)}
                                </span>
                            </div>
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
                        <div className="flex justify-between items-center px-1">
                            <span className="text-zinc-500 text-[10px] font-bold tracking-widest uppercase">
                                {state === 'idle' ? (timerMode === 'countdown' ? 'Countdown' : 'Stopwatch') : 'Current Timer'}
                            </span>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="bg-zinc-800 hover:bg-zinc-700 rounded-full p-2 transition-colors cursor-pointer"
                            >
                                <X size={14} className="text-zinc-400" />
                            </button>
                        </div>

                        {/* Mode Toggle */}
                        {state === 'idle' && (
                            <div className="flex items-center justify-center gap-2">
                                <button
                                    onClick={() => setTimerMode('countdown')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${timerMode === 'countdown'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                        }`}
                                >
                                    <Timer size={12} />
                                    Timer
                                </button>
                                <button
                                    onClick={() => setTimerMode('countup')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${timerMode === 'countup'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                        }`}
                                >
                                    <Clock size={12} />
                                    Stopwatch
                                </button>
                            </div>
                        )}

                        {/* Main Content */}
                        <div className="flex-1 flex items-center justify-center">
                            {state === 'idle' ? (
                                timerMode === 'countdown' ? (
                                    <div className="flex items-center gap-6 text-3xl font-mono font-bold text-white">
                                        <div className="flex flex-col items-center">
                                            <input
                                                type="number"
                                                value={inputMinutes}
                                                onChange={(e) => setInputMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                                                className="w-20 bg-transparent text-center focus:outline-none border-b-2 border-zinc-700 focus:border-emerald-500 transition-colors py-1 cursor-text"
                                                placeholder="00"
                                            />
                                            <span className="text-xs text-zinc-500 font-sans tracking-wide mt-2">MIN</span>
                                        </div>
                                        <span className="text-zinc-600 pb-8">:</span>
                                        <div className="flex flex-col items-center">
                                            <input
                                                type="number"
                                                value={inputSeconds}
                                                onChange={(e) => setInputSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                                                className="w-20 bg-transparent text-center focus:outline-none border-b-2 border-zinc-700 focus:border-emerald-500 transition-colors py-1 cursor-text"
                                                placeholder="00"
                                            />
                                            <span className="text-xs text-zinc-500 font-sans tracking-wide mt-2">SEC</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-4xl font-mono font-bold text-blue-400">00:00</span>
                                        <span className="text-xs text-zinc-500">Press play to start</span>
                                    </div>
                                )
                            ) : (
                                <div className={`text-5xl font-mono font-bold tracking-tight tabular-nums ${timerMode === 'countup' ? 'text-blue-400' : 'text-white'}`}>
                                    {formatTime(timeLeft)}
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-6">
                            <button
                                onClick={stopTimer}
                                className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                title="Reset"
                            >
                                <RefreshCw size={18} />
                            </button>

                            {state === 'running' ? (
                                <button
                                    onClick={pauseTimer}
                                    className="p-4 rounded-full bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 transition-colors cursor-pointer"
                                >
                                    <Pause size={20} fill="currentColor" />
                                </button>
                            ) : (
                                <button
                                    onClick={startTimer}
                                    className="p-4 rounded-full bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                                >
                                    <Play size={20} fill="currentColor" className="ml-0.5" />
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
