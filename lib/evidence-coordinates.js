const MAX_POINTS = 16;
const MIN_SPAN = 0.001;
const MIN_AREA = MIN_SPAN * MIN_SPAN;

function polygonArea(points) {
    if (points.length === 2) {
        return Math.abs(points[1].x - points[0].x) * Math.abs(points[1].y - points[0].y);
    }
    const doubled = points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + (point.x * next.y) - (next.x * point.y);
    }, 0);
    return Math.abs(doubled) / 2;
}

export function normalizeEvidenceCoordinates(value) {
    if (!Array.isArray(value) || value.length < 2 || value.length > MAX_POINTS) return [];
    if (!value.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)
        && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) return [];
    const points = value.map(point => ({ x: point.x, y: point.y }));
    const width = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x));
    const height = Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    if (width < MIN_SPAN || height < MIN_SPAN || polygonArea(points) < MIN_AREA) return [];
    return points;
}

export function evidenceCoordinatesUsable(value) {
    return normalizeEvidenceCoordinates(value).length > 0;
}
