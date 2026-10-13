/**
 * sipMath - service module (no UI, no server calls). All the maths behind the
 * calculator, kept separate so it can be reasoned about on its own.
 *
 * projectInvestment() is the engine: it simulates the investment year by year
 * and returns the maturity value plus a per-year breakdown, covering all four
 * modes. solveMonthlySipForTarget() runs it backwards to answer "how much per
 * month do I need?". buildScenarios() runs it at three rates for comparison,
 * and inflationAdjustedValue() restates a result in today's money.
 *
 * Compounding convention:
 * - SIP legs compound monthly using r = annualRatePct / 12 / 100.
 * - Lumpsum legs compound at the selected frequency (monthly/quarterly/
 *   semi-annually/annually).
 * SIP contributions are made at the START of each month (annuity due), which is
 * what the closed-form FV = P x (((1+r)^n - 1) / r) x (1+r) describes.
 *
 * projectInvestment() is the single engine for all four calculator modes. With
 * stepUpPct = 0 it reproduces the closed forms used by the UI:
 *   SIP     : FV = P x (((1 + r)^n - 1) / r) x (1 + r)
 *   Lumpsum : FV = P x (1 + R/m)^(m*years)
 */

const MONTHS_PER_YEAR = 12;
const COMPOUNDING_FREQUENCY = {
    MONTHLY: 'monthly',
    QUARTERLY: 'quarterly',
    SEMI_ANNUALLY: 'semi-annually',
    ANNUALLY: 'annually'
};

const PERIODS_PER_YEAR = {
    [COMPOUNDING_FREQUENCY.MONTHLY]: 12,
    [COMPOUNDING_FREQUENCY.QUARTERLY]: 4,
    [COMPOUNDING_FREQUENCY.SEMI_ANNUALLY]: 2,
    [COMPOUNDING_FREQUENCY.ANNUALLY]: 1
};

function num(value) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function wholeYears(years) {
    return Math.max(0, Math.round(num(years)));
}

function monthlyRate(annualRatePct) {
    return num(annualRatePct) / MONTHS_PER_YEAR / 100;
}

function normalizeCompoundingFrequency(value) {
    const key = String(value || '').toLowerCase();
    return PERIODS_PER_YEAR[key]
        ? key
    : COMPOUNDING_FREQUENCY.MONTHLY;
}

/**
 * @typedef {Object} YearRow
 * @property {number} year 1-based year index
 * @property {number} stepUpAppliedPct step-up applied that year (0 for year 1)
 * @property {number} yearlyInvestment invested during that year (+ lumpsum in year 1)
 * @property {number} cumulativeInvested principal invested up to and including that year
 * @property {number} interestEarned closingBalance - cumulativeInvested
 * @property {number} closingBalance balance at the end of that year
 */

/**
 * Year-by-year simulation covering SIP, step-up SIP, lumpsum and lumpsum + SIP.
 * Each year's contribution steps up from the prior year, compounds monthly, and
 * the closing balance rolls forward as the next year's opening principal. With
 * stepUpPct = 0 and lumpsum = 0 this matches the closed-form SIP value.
 *
 * @param {Object} input
 * @param {number} [input.monthlyAmount=0] first-year monthly SIP
 * @param {number} [input.lumpsum=0] one-time investment at t = 0
 * @param {number} [input.annualRatePct=0] annual growth rate, in percent
 * @param {number} [input.years=0] duration in whole years
 * @param {number} [input.stepUpPct=0] annual increase applied to the SIP
 * @param {string} [input.compoundingFrequency='monthly'] lumpsum compounding frequency
 * @returns {{futureValue: number, totalInvested: number, totalInterest: number, breakdown: YearRow[]}}
 */
export function projectInvestment({
    monthlyAmount = 0,
    lumpsum = 0,
    annualRatePct = 0,
    years = 0,
    stepUpPct = 0,
    compoundingFrequency = COMPOUNDING_FREQUENCY.MONTHLY
} = {}) {
    const baseMonthly = Math.max(0, num(monthlyAmount));
    const initial = Math.max(0, num(lumpsum));
    const monthlySipRate = monthlyRate(annualRatePct);
    const annualRate = num(annualRatePct) / 100;
    const totalYears = wholeYears(years);
    const stepUp = Math.max(0, num(stepUpPct));
    const frequencyKey = normalizeCompoundingFrequency(compoundingFrequency);
    const periodsPerYear = PERIODS_PER_YEAR[frequencyKey];
    const monthsPerPeriod = MONTHS_PER_YEAR / periodsPerYear;
    const lumpsumPeriodicRate = annualRate / periodsPerYear;

    let lumpsumBalance = initial;
    let sipBalance = 0;
    let balance = initial;
    let cumulativeInvested = initial;
    const breakdown = [];

    for (let year = 1; year <= totalYears; year++) {
        const contribution =
            baseMonthly * Math.pow(1 + stepUp / 100, year - 1);

        for (let month = 1; month <= MONTHS_PER_YEAR; month++) {
            if (baseMonthly > 0) {
                // Contribution at the start of the month, then one month of SIP growth.
                sipBalance = (sipBalance + contribution) * (1 + monthlySipRate);
            }

            if (month % monthsPerPeriod === 0) {
                lumpsumBalance *= 1 + lumpsumPeriodicRate;
            }
        }

        balance = sipBalance + lumpsumBalance;

        const yearlySip = contribution * MONTHS_PER_YEAR;
        cumulativeInvested += yearlySip;

        breakdown.push({
            year,
            stepUpAppliedPct: baseMonthly > 0 && year > 1 ? stepUp : 0,
            yearlyInvestment: year === 1 ? yearlySip + initial : yearlySip,
            cumulativeInvested,
            interestEarned: balance - cumulativeInvested,
            closingBalance: balance
        });
    }

    return {
        futureValue: balance,
        totalInvested: cumulativeInvested,
        totalInterest: balance - cumulativeInvested,
        breakdown
    };
}

/**
 * Reverse solve: the monthly SIP needed to reach a target maturity value.
 * Step-up makes this non-algebraic, so this is a bisection search over the
 * monthly amount, using {@link projectInvestment} as the forward function. The
 * upper bound doubles until it brackets the target, then halves to convergence
 * within one cent or 100 iterations.
 *
 * @param {Object} input
 * @param {number} input.targetAmount desired maturity value
 * @param {number} input.annualRatePct annual growth rate, in percent
 * @param {number} input.years duration in whole years
 * @param {number} [input.stepUpPct=0] annual step-up on the SIP
 * @param {number} [input.lumpsum=0] lumpsum contributing towards the target
 * @param {string} [input.compoundingFrequency='monthly'] lumpsum compounding frequency
 * @returns {number} required monthly SIP (0 when nothing needs solving)
 */
export function solveMonthlySipForTarget({
    targetAmount,
    annualRatePct,
    years,
    stepUpPct = 0,
    lumpsum = 0,
    compoundingFrequency = COMPOUNDING_FREQUENCY.MONTHLY
} = {}) {
    const TOLERANCE = 0.01;
    const MAX_ITERATIONS = 100;
    const target = Math.max(0, num(targetAmount));
    const totalYears = wholeYears(years);
    const fvFor = (amount) =>
        projectInvestment({
            monthlyAmount: amount,
            lumpsum,
            annualRatePct,
            years: totalYears,
            stepUpPct,
            compoundingFrequency
        }).futureValue;

    // Nothing to solve: no target, no time, or the lumpsum already gets there.
    if (target <= 0 || totalYears <= 0 || fvFor(0) >= target) {
        return 0;
    }

    let low = 0;
    let high = Math.max(1, target / (totalYears * MONTHS_PER_YEAR));
    let expansions = 0;
    while (fvFor(high) < target && expansions < 60) {
        high *= 2;
        expansions += 1;
    }

    let mid = high;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        mid = (low + high) / 2;
        const fv = fvFor(mid);
        if (Math.abs(fv - target) <= TOLERANCE) {
            break;
        }
        if (fv < target) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return mid;
}

/**
 * Purchasing power of a future amount in today's money.
 * RealValue = FV / (1 + inflationRate)^years
 */
export function inflationAdjustedValue(futureValue, inflationRatePct, years) {
    const fv = num(futureValue);
    const i = num(inflationRatePct) / 100;
    const y = wholeYears(years);
    return i <= 0 || y <= 0 ? fv : fv / Math.pow(1 + i, y);
}

/**
 * Three comparison scenarios at rate - offset, rate and rate + offset.
 * @returns {Array<{key: string, label: string, ratePct: number, futureValue: number, totalInterest: number}>}
 */
export function buildScenarios({
    annualRatePct,
    offsetPct = 2,
    monthlyAmount = 0,
    lumpsum = 0,
    years = 0,
    stepUpPct = 0,
    compoundingFrequency = COMPOUNDING_FREQUENCY.MONTHLY
} = {}) {
    const base = num(annualRatePct);
    const offset = Math.abs(num(offsetPct));

    return [
        { key: 'below', label: 'Below Average', ratePct: Math.max(0, base - offset) },
        { key: 'average', label: 'Average', ratePct: base },
        { key: 'above', label: 'Above Average', ratePct: base + offset }
    ].map((scenario) => {
        const projection = projectInvestment({
            monthlyAmount,
            lumpsum,
            annualRatePct: scenario.ratePct,
            years,
            stepUpPct,
            compoundingFrequency
        });
        return {
            ...scenario,
            futureValue: projection.futureValue,
            totalInterest: projection.totalInterest
        };
    });
}
