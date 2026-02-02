// Activity tracking store using localStorage
const STORAGE_KEY = 'islandTimer.activity.v1';

export function loadActivity(): Record<string, number> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return {};
        const parsed = JSON.parse(stored);
        // Validate it's an object with string keys and number values
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return {};
        }
        const result: Record<string, number> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && value > 0) {
                result[key] = value;
            }
        }
        return result;
    } catch {
        return {};
    }
}

export function bumpActivity(dateISO: string, delta: number = 1): void {
    const activity = loadActivity();
    const current = activity[dateISO] || 0;
    activity[dateISO] = Math.max(0, current + delta);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(activity));
    } catch (err) {
        console.error('Failed to save activity:', err);
    }
}

export function getTodayISO(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
