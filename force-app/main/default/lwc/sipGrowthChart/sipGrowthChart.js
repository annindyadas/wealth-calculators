/**
 * sipGrowthChart - read-only area chart of how the projection grows, drawn as
 * plain SVG (no charting library, no server calls).
 *
 * The parent passes a series of { year, invested, total } points. A single
 * getter scales those into two stacked bands: the total-value band sits behind
 * the invested band, so the visible gap between the two lines is the interest
 * earned. It scales with its container through the SVG viewBox, and exposes an
 * aria-label summary plus a tooltip on each year's data point.
 */
import { LightningElement, api } from 'lwc';
import { formatCurrency, formatCompactCurrency } from 'c/sipFormat';

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 320;
const PADDING = { top: 16, right: 16, bottom: 40, left: 76 };
const Y_TICK_COUNT = 5;
const MAX_X_LABELS = 10;

/** Round a value up to a readable axis maximum (1/2/5 x 10^n). */
function niceCeiling(value) {
    if (value <= 0) {
        return 1;
    }
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find(
        (candidate) => normalized <= candidate
    );
    return step * magnitude;
}

export default class SipGrowthChart extends LightningElement {
    /** [{ year, invested, total }] -- cumulative invested vs. closing balance. */
    @api series = [];
    /** 'USD' | 'INR' | 'EUR' - decides symbol and grouping on the axis labels. */
    @api currencyCode = 'USD';
    @api chartTitle = 'Growth over time';

    viewBox = `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`;

    get data() {
        return (Array.isArray(this.series) ? this.series : []).filter(
            (row) => row && Number.isFinite(row.year)
        );
    }

    get hasData() {
        return this.data.length > 0;
    }

    /** Everything the template needs, computed in one pass. */
    get chart() {
        const data = this.data;
        if (!data.length) {
            return null;
        }

        const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
        const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
        const baseline = PADDING.top + plotHeight;
        const maxYear = Math.max(...data.map((row) => row.year));
        const yMax = niceCeiling(Math.max(...data.map((row) => row.total), 1));

        const xFor = (year) =>
            PADDING.left + (maxYear > 0 ? (year / maxYear) * plotWidth : 0);
        const yFor = (value) =>
            PADDING.top + plotHeight - (Math.max(0, value) / yMax) * plotHeight;

        const points = data.map((row) => ({
            key: `y${row.year}`,
            year: row.year,
            cx: xFor(row.year),
            cyTotal: yFor(row.total),
            cyInvested: yFor(row.invested),
            tooltip: `Year ${row.year}: value ${formatCurrency(
                row.total,
                this.currencyCode
            )}, invested ${formatCurrency(row.invested, this.currencyCode)}`
        }));

        // Anchor both series at the origin so the areas close cleanly.
        const origin = { cx: xFor(0), cyTotal: baseline, cyInvested: baseline };
        const path = (key) =>
            [origin, ...points]
                .map(
                    (point, index) =>
                        `${index === 0 ? 'M' : 'L'}${point.cx.toFixed(2)},${point[
                            key
                        ].toFixed(2)}`
                )
                .join(' ');
        const area = (key) =>
            `${path(key)} L${points[points.length - 1].cx.toFixed(
                2
            )},${baseline} L${origin.cx.toFixed(2)},${baseline} Z`;

        const yTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, index) => {
            const value = (yMax / Y_TICK_COUNT) * index;
            return {
                key: `t${index}`,
                value,
                y: yFor(value),
                label: formatCompactCurrency(value, this.currencyCode),
                x1: PADDING.left,
                x2: VIEW_WIDTH - PADDING.right,
                labelX: PADDING.left - 10
            };
        });

        const labelEvery = Math.max(1, Math.ceil(maxYear / MAX_X_LABELS));
        const xTicks = data
            .filter(
                (row) => row.year % labelEvery === 0 || row.year === maxYear
            )
            .map((row) => ({
                key: `x${row.year}`,
                label: String(row.year),
                x: xFor(row.year),
                y: baseline + 20
            }));

        return {
            axisY: {
                x1: PADDING.left,
                y1: PADDING.top,
                x2: PADDING.left,
                y2: baseline
            },
            axisX: {
                x1: PADDING.left,
                y1: baseline,
                x2: VIEW_WIDTH - PADDING.right,
                y2: baseline
            },
            totalArea: area('cyTotal'),
            investedArea: area('cyInvested'),
            totalLine: path('cyTotal'),
            investedLine: path('cyInvested'),
            points,
            yTicks,
            xTicks,
            xAxisLabel: { x: PADDING.left + plotWidth / 2, y: VIEW_HEIGHT - 4 }
        };
    }

    get finalRow() {
        const data = this.data;
        return data.length ? data[data.length - 1] : null;
    }

    get ariaSummary() {
        const row = this.finalRow;
        if (!row) {
            return 'No projection to chart yet.';
        }
        return `Area chart of projected growth over ${row.year} years. Total invested grows to ${formatCurrency(
            row.invested,
            this.currencyCode
        )} and the total value reaches ${formatCurrency(
            row.total,
            this.currencyCode
        )}.`;
    }

    get investedLegend() {
        const row = this.finalRow;
        return row
            ? `Invested ${formatCurrency(row.invested, this.currencyCode)}`
            : 'Invested';
    }

    get interestLegend() {
        const row = this.finalRow;
        return row
            ? `Interest earned ${formatCurrency(
                  row.total - row.invested,
                  this.currencyCode
              )}`
            : 'Interest earned';
    }
}
