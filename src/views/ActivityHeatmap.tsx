import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { loadActivity } from '../activityStore';

// GitHub dark theme colors
const COLORS = {
    empty: '#161b22',
    level1: '#0e4429',
    level2: '#006d32',
    level3: '#26a641',
    level4: '#39d353',
    border: '#30363d',
    text: '#c9d1d9',
    muted: '#8b949e',
};

const CELL_SIZE = 20; // Increased for noticeably bigger cells
const CELL_GAP = 4; // Increased for better spacing
const CELL_ROUNDED = 3; // Slightly increased for proportional rounded corners
const WEEKDAY_LABEL_WIDTH = 32; // Slightly increased for better alignment
const HEADER_HEIGHT = 18;
const HEADER_MARGIN = 4;

type Half = 'H1' | 'H2';

// Helper: Determine which half a date belongs to
function getHalfForDate(date: Date): Half {
    const month = date.getMonth(); // 0-11
    return month < 6 ? 'H1' : 'H2'; // Jan-Jun (0-5) = H1, Jul-Dec (6-11) = H2
}

// Helper: Get date range for a half
function getHalfRange(year: number, half: Half): { from: Date; to: Date } {
    if (half === 'H1') {
        return {
            from: new Date(year, 0, 1),   // Jan 1
            to: new Date(year, 5, 30),    // Jun 30
        };
    } else {
        return {
            from: new Date(year, 6, 1),   // Jul 1
            to: new Date(year, 11, 31),   // Dec 31
        };
    }
}

// Helper: Pad date range to full week bounds (Monday to Sunday)
function padToWeekBounds(from: Date, to: Date): { start: Date; end: Date } {
    // Start: Monday on/before 'from'
    const fromDayOfWeek = from.getDay(); // 0 = Sunday, 1 = Monday, ...
    const mondayOffset = fromDayOfWeek === 0 ? -6 : 1 - fromDayOfWeek;
    const start = new Date(from);
    start.setDate(from.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);

    // End: Sunday on/after 'to'
    const toDayOfWeek = to.getDay();
    const sundayOffset = toDayOfWeek === 0 ? 0 : 7 - toDayOfWeek;
    const end = new Date(to);
    end.setDate(to.getDate() + sundayOffset);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

function getIntensity(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count >= 2 && count <= 3) return 2;
    if (count >= 4 && count <= 6) return 3;
    return 4;
}

function getColor(intensity: number): string {
    switch (intensity) {
        case 0: return COLORS.empty;
        case 1: return COLORS.level1;
        case 2: return COLORS.level2;
        case 3: return COLORS.level3;
        case 4: return COLORS.level4;
        default: return COLORS.empty;
    }
}

function formatDate(date: Date): string {
    // Format as DD/MM (e.g., 14/02, 19/07)
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
}

// Generate weeks for a date range
function getWeeksInRange(start: Date, end: Date): Array<Array<Date>> {
    const weeks: Array<Array<Date>> = [];
    const current = new Date(start);

    while (current <= end) {
        const week: Date[] = [];
        for (let i = 0; i < 7; i++) {
            week.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        weeks.push(week);
    }

    return weeks;
}

// Get month positions for months in the selected half
function getMonthPositionsForHalf(
    year: number,
    half: Half,
    weeks: Array<Array<Date>>
): Array<{ month: number; weekIndex: number }> {
    const positions: Array<{ month: number; weekIndex: number }> = [];
    const seenMonths = new Set<number>();
    
    // Determine which months are in this half
    const halfMonths = half === 'H1' 
        ? [0, 1, 2, 3, 4, 5]  // Jan-Jun
        : [6, 7, 8, 9, 10, 11]; // Jul-Dec

    weeks.forEach((week, weekIndex) => {
        week.forEach((day) => {
            if (day.getFullYear() === year) {
                const month = day.getMonth();
                if (halfMonths.includes(month) && day.getDate() <= 7 && !seenMonths.has(month)) {
                    seenMonths.add(month);
                    positions.push({ month, weekIndex });
                }
            }
        });
    });

    return positions;
}

export function ActivityHeatmap() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [hoveredCell, setHoveredCell] = useState<{ date: Date; count: number; clientX: number; clientY: number } | null>(null);
    const year = new Date().getFullYear();
    const activity = loadActivity();

    // Load selected half from localStorage, default to half containing today
    const [selectedHalf, setSelectedHalf] = useState<Half>(() => {
        try {
            const stored = localStorage.getItem('islandTimer.activityHalf');
            if (stored === 'H1' || stored === 'H2') {
                return stored;
            }
        } catch {}
        // Default to half containing today
        return getHalfForDate(new Date());
    });

    // Persist half selection
    useLayoutEffect(() => {
        try {
            localStorage.setItem('islandTimer.activityHalf', selectedHalf);
        } catch {}
    }, [selectedHalf]);

    // Calculate total for entire year (not just the half)
    const totalForYear = useMemo(() => {
        let totalCount = 0;
        Object.entries(activity).forEach(([dateStr, count]) => {
            const date = new Date(dateStr + 'T00:00:00');
            if (date.getFullYear() === year && count > 0) {
                totalCount += count;
            }
        });
        return totalCount;
    }, [year, activity]);

    // Generate weeks for selected half
    const { weeks, monthPositions } = useMemo(() => {
        const { from, to } = getHalfRange(year, selectedHalf);
        const { start, end } = padToWeekBounds(from, to);
        const weeksData = getWeeksInRange(start, end);
        const monthPos = getMonthPositionsForHalf(year, selectedHalf, weeksData);
        return { weeks: weeksData, monthPositions: monthPos };
    }, [year, selectedHalf]);

    // Calculate natural dimensions
    const naturalWidth = useMemo(() => {
        return WEEKDAY_LABEL_WIDTH + weeks.length * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    }, [weeks.length]);

    const naturalHeight = useMemo(() => {
        return HEADER_HEIGHT + HEADER_MARGIN + 7 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    }, []);

    // Fit-to-view scaling with ResizeObserver
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Safety: ensure no scroll position offset
        if (container.scrollLeft !== 0) {
            container.scrollLeft = 0;
        }

        const updateScale = () => {
            const availableWidth = container.clientWidth;
            // Reserve some padding (12px on each side)
            const maxWidth = availableWidth - 24;
            // Cap scale at 1 (never upscale past natural size)
            const calculatedScale = Math.min(1, maxWidth / naturalWidth);
            setScale(calculatedScale);
        };

        updateScale();

        const resizeObserver = new ResizeObserver(updateScale);
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
        };
    }, [naturalWidth, weeks.length]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekdayLabels = ['Mon', 'Wed', 'Fri'];

    return (
        <div 
            ref={containerRef}
            className="w-full flex flex-col items-center" 
            style={{ gap: '12px', padding: '8px 0', overflow: 'hidden' }}
        >
            {/* Header */}
            <div className="text-sm" style={{ color: COLORS.text }}>
                <strong>{totalForYear}</strong> sessions in <strong>{year}</strong>
            </div>

            {/* Half Selector */}
            <div className="flex gap-2">
                <button
                    onClick={() => setSelectedHalf('H1')}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase transition-all ${
                        selectedHalf === 'H1'
                            ? 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                    }`}
                    style={{ cursor: 'pointer' }}
                >
                    Jan–Jun
                </button>
                <button
                    onClick={() => setSelectedHalf('H2')}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase transition-all ${
                        selectedHalf === 'H2'
                            ? 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                    }`}
                    style={{ cursor: 'pointer' }}
                >
                    Jul–Dec
                </button>
            </div>

            {/* Scaled Heatmap Container */}
            <div 
                style={{ 
                    width: '100%',
                    height: `${naturalHeight * scale}px`,
                    display: 'flex',
                    justifyContent: 'flex-start',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Scaled Canvas */}
                <div
                    style={{
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        width: `${naturalWidth}px`,
                        height: `${naturalHeight}px`,
                        flexShrink: 0,
                    }}
                >
                    {/* Heatmap Grid - CSS Grid layout for perfect alignment */}
                    <div 
                        style={{ 
                            display: 'grid',
                            gridTemplateColumns: `${WEEKDAY_LABEL_WIDTH}px 1fr`,
                            gap: 0,
                        }}
                    >
                        {/* Column 1: Empty space for month labels alignment */}
                        <div style={{ height: `${HEADER_HEIGHT + HEADER_MARGIN}px` }} />

                        {/* Column 2: Month labels row - width matches grid exactly */}
                        <div 
                            className="relative" 
                            style={{ 
                                height: `${HEADER_HEIGHT}px`,
                                marginBottom: `${HEADER_MARGIN}px`,
                                width: `${weeks.length * (CELL_SIZE + CELL_GAP) - CELL_GAP}px`,
                            }}
                        >
                            {monthPositions.map(({ month, weekIndex }) => (
                                <div
                                    key={month}
                                    className="absolute text-[10px]"
                                    style={{
                                        left: `${weekIndex * (CELL_SIZE + CELL_GAP)}px`,
                                        color: COLORS.muted,
                                        whiteSpace: 'nowrap',
                                        transform: 'translateX(0)',
                                    }}
                                >
                                    {monthNames[month]}
                                </div>
                            ))}
                        </div>

                        {/* Column 1: Weekday labels - absolute positioned to match rows */}
                        <div 
                            className="relative" 
                            style={{ 
                                height: `${7 * (CELL_SIZE + CELL_GAP) - CELL_GAP}px`,
                            }}
                        >
                            {weekdayLabels.map((label, idx) => {
                                // Mon = row 0, Wed = row 2, Fri = row 4
                                const rowIndex = idx === 0 ? 0 : idx === 1 ? 2 : 4;
                                const topPx = rowIndex * (CELL_SIZE + CELL_GAP);
                                return (
                                    <div
                                        key={label}
                                        className="absolute text-[10px] text-right pr-2"
                                        style={{
                                            color: COLORS.muted,
                                            top: `${topPx}px`,
                                            width: `${WEEKDAY_LABEL_WIDTH - 8}px`,
                                            height: `${CELL_SIZE}px`,
                                            lineHeight: `${CELL_SIZE}px`,
                                        }}
                                    >
                                        {label}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Column 2: Grid - ALL weeks rendered, no slicing */}
                        <div className="flex" style={{ gap: `${CELL_GAP}px`, overflow: 'visible' }}>
                            {weeks.map((week, weekIdx) => (
                                <div key={weekIdx} className="flex flex-col" style={{ gap: `${CELL_GAP}px` }}>
                                    {week.map((day, dayIdx) => {
                                        const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                                        const count = activity[dateStr] || 0;
                                        const intensity = getIntensity(count);
                                        const color = getColor(intensity);
                                        
                                        // Determine if this day is in the selected half's range
                                        const { from, to } = getHalfRange(year, selectedHalf);
                                        const isInHalf = day >= from && day <= to;

                                        return (
                                            <div
                                                key={`${weekIdx}-${dayIdx}`}
                                                className="relative"
                                                style={{
                                                    width: `${CELL_SIZE}px`,
                                                    height: `${CELL_SIZE}px`,
                                                    backgroundColor: isInHalf ? color : COLORS.empty,
                                                    border: `1px solid ${COLORS.border}`,
                                                    borderRadius: `${CELL_ROUNDED}px`,
                                                    cursor: isInHalf ? 'pointer' : 'default',
                                                    opacity: isInHalf ? 1 : 0.3,
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (isInHalf) {
                                                        setHoveredCell({
                                                            date: day,
                                                            count,
                                                            clientX: e.clientX,
                                                            clientY: e.clientY,
                                                        });
                                                    }
                                                }}
                                                onMouseMove={(e) => {
                                                    if (isInHalf && hoveredCell?.date === day) {
                                                        setHoveredCell({
                                                            date: day,
                                                            count,
                                                            clientX: e.clientX,
                                                            clientY: e.clientY,
                                                        });
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    if (hoveredCell?.date === day) {
                                                        setHoveredCell(null);
                                                    }
                                                }}
                                                onFocus={(e) => {
                                                    if (isInHalf) {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setHoveredCell({
                                                            date: day,
                                                            count,
                                                            clientX: rect.left + rect.width / 2,
                                                            clientY: rect.top - 8,
                                                        });
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (hoveredCell?.date === day) {
                                                        setHoveredCell(null);
                                                    }
                                                }}
                                                tabIndex={isInHalf ? 0 : -1}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Tooltip (outside scaled canvas, normal size) */}
                {hoveredCell && (
                    <div
                        className="fixed pointer-events-none z-50 px-2 py-1 rounded text-xs whitespace-nowrap"
                        style={{
                            backgroundColor: '#21262d',
                            color: COLORS.text,
                            border: `1px solid ${COLORS.border}`,
                            left: `${hoveredCell.clientX}px`,
                            top: `${hoveredCell.clientY}px`,
                            transform: 'translate(-50%, -100%)',
                            marginTop: '-4px',
                        }}
                    >
                        {hoveredCell.count} {hoveredCell.count === 1 ? 'session' : 'sessions'} on {formatDate(hoveredCell.date)}
                    </div>
                )}
            </div>

            {/* Legend (outside scaled canvas) */}
            <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.muted }}>
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((intensity) => (
                    <div
                        key={intensity}
                        style={{
                            width: `${CELL_SIZE}px`,
                            height: `${CELL_SIZE}px`,
                            backgroundColor: getColor(intensity),
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: `${CELL_ROUNDED}px`,
                        }}
                    />
                ))}
                <span>More</span>
            </div>
        </div>
    );
}
