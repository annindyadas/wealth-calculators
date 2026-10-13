/**
 * sipLumpsumCalculator - the parent component you place on a page. Everything
 * runs in the browser; there are no server calls.
 *
 * It owns all user input (mode tabs, sliders, currency picker) and holds the
 * only copy of the calculation state. On every input change it runs one
 * recalculate() pass through c/sipMath, then feeds the result down to three
 * presentation children: c/sipGrowthChart, c/sipScenarioCards and
 * c/sipYearlyBreakdown. Amounts are formatted through c/sipFormat.
 */
import { LightningElement, api, track } from 'lwc';
import {
    projectInvestment,
    solveMonthlySipForTarget,
    inflationAdjustedValue,
    buildScenarios
} from 'c/sipMath';
import {
    formatCurrency,
    formatNumberByCurrency,
    parseNumberByCurrency,
    currencyCodeFor,
    CURRENCY_OPTIONS,
    DEFAULT_CURRENCY_CODE
} from 'c/sipFormat';

const MODE = {
    SIP_AMOUNT: 'SIP_AMOUNT',
    SIP_TARGET: 'SIP_TARGET',
    LUMPSUM: 'LUMPSUM',
    LUMPSUM_SIP: 'LUMPSUM_SIP'
};

const SIP_MODES = [MODE.SIP_AMOUNT, MODE.SIP_TARGET, MODE.LUMPSUM_SIP];
const LUMPSUM_MODES = [MODE.LUMPSUM, MODE.LUMPSUM_SIP];

const COMPOUNDING_FREQUENCY = {
    MONTHLY: 'monthly',
    QUARTERLY: 'quarterly',
    SEMI_ANNUALLY: 'semi-annually',
    ANNUALLY: 'annually'
};

const COMPOUNDING_FREQUENCY_OPTIONS = [
    { label: 'Monthly', value: COMPOUNDING_FREQUENCY.MONTHLY },
    { label: 'Quarterly', value: COMPOUNDING_FREQUENCY.QUARTERLY },
    {
        label: 'Semi-Annually',
        value: COMPOUNDING_FREQUENCY.SEMI_ANNUALLY
    },
    { label: 'Annually', value: COMPOUNDING_FREQUENCY.ANNUALLY }
];

// Shown under the tab bar so each mode explains itself.
const MODE_SUMMARY = {
    [MODE.SIP_AMOUNT]:
        'You invest a fixed amount at the start of every month. See what it grows to by the end of the term.',
    [MODE.SIP_TARGET]:
        'You already have a goal amount in mind. See the monthly amount you need to invest to reach it.',
    [MODE.LUMPSUM]:
        'You invest a single amount once, upfront, and leave it to grow. See what it becomes.',
    [MODE.LUMPSUM_SIP]:
        'You start with a one-time amount, then keep adding every month on top of it. See the combined total.'
};

// Slider bounds. Duration bounds come from the @api min/maxDurationYears.
const BOUNDS = {
    monthly: { min: 500, max: 200000, step: 500 },
    target: { min: 100000, max: 100000000, step: 50000 },
    lumpsum: { min: 1000, max: 10000000, step: 1000 },
    rate: { min: 1, max: 30, step: 0.01 },
    stepUp: { min: 0, max: 50, step: 0.01 },
    inflation: { min: 1, max: 15, step: 0.01 }
};

// The three amount fields. Sliders are capped by BOUNDS above, but a typed
// amount is only capped by ENTRY_RANGE, so any exact figure can be keyed in
// even when the slider cannot reach it (the thumb just parks at its own end).
const AMOUNT_FIELDS = {
    monthlyAmount: 'monthly',
    targetAmount: 'target',
    lumpsumAmount: 'lumpsum'
};
const ENTRY_RANGE = { min: 0, max: 1000000000000 };

const DISCLAIMER =
    'This is an illustrative projection only and does not constitute investment advice. Actual returns may vary. Assumptions: SIP contributions are invested at the start of each month. Lumpsum is invested upfront and compounded at the selected frequency. Annual step-up is applied once at the start of each year. Returns are projected using a constant annual rate. Taxes, exit loads and fund-level charges are not included. Inflation-adjusted (today\'s money) values assume a constant annual inflation rate.';

function toNumber(value, fallback) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/** Accepts real booleans plus the "false"/"true" strings Flow and Builder pass. */
function normalizeBoolean(value, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    if (typeof value === 'string') {
        return value.toLowerCase() !== 'false';
    }
    return Boolean(value);
}

function normalizeCompoundingFrequency(value) {
    const key = String(value || '').toLowerCase();
    return COMPOUNDING_FREQUENCY_OPTIONS.some((item) => item.value === key)
        ? key
    : COMPOUNDING_FREQUENCY.MONTHLY;
}

export default class SipLumpsumCalculator extends LightningElement {
    // ---------------------------------------------------------------------
    // Design-time configuration (Record Page / Experience Cloud / Flow)
    // ---------------------------------------------------------------------
    /** Currency selected when the component loads. Anything unset means USD. */
    @api defaultCurrencyCode;
    /**
     * Deprecated and ignored at runtime. Earlier versions configured the
     * currency by symbol ('₹', '$'); the property is only kept because
     * Experience Builder pages already reference it and Salesforce blocks
     * removing a property that is in use.
     */
    @api defaultCurrencySymbol;
    @api defaultAnnualRate = 12;
    @api minDurationYears = 1;
    @api maxDurationYears = 40;
    @api defaultCompoundingFrequency = COMPOUNDING_FREQUENCY.MONTHLY;
    // LWC forbids public boolean properties that default to true, so these are
    // getter/setter pairs whose "unset" state resolves to true.
    _showLumpsumTab;
    _showStepUp;
    _showScenarioCards;
    _connected = false;

    @api
    get showLumpsumTab() {
        return normalizeBoolean(this._showLumpsumTab, true);
    }
    set showLumpsumTab(value) {
        this._showLumpsumTab = value;
        this.refreshIfConnected();
    }

    @api
    get showStepUp() {
        return normalizeBoolean(this._showStepUp, true);
    }
    set showStepUp(value) {
        this._showStepUp = value;
        this.refreshIfConnected();
    }

    @api
    get showScenarioCards() {
        return normalizeBoolean(this._showScenarioCards, true);
    }
    set showScenarioCards(value) {
        this._showScenarioCards = value;
    }

    /** Builder / Flow can change configuration after the first render. */
    refreshIfConnected() {
        if (this._connected) {
            this.recalculate();
        }
    }

    /** +/- offset (in percentage points) used for the outer scenario cards. */
    @api scenarioOffset = 2;

    // ---------------------------------------------------------------------
    // User input state
    // ---------------------------------------------------------------------
    @track state = {
        mode: MODE.SIP_AMOUNT,
        currencyCode: DEFAULT_CURRENCY_CODE,
        monthlyAmount: 25000,
        targetAmount: 10000000,
        lumpsumAmount: 500000,
        annualRate: 12,
        durationYears: 10,
        stepUpPct: 10,
        includeInflation: false,
        inflationRate: 6,
        compoundingFrequency: COMPOUNDING_FREQUENCY.MONTHLY,
        selectedScenarioKey: 'average'
    };

    disclaimer = DISCLAIMER;

    /**
     * Memoized calculation output. Recomputed only when an input changes, so a
     * slider drag never re-runs the target-amount binary search per getter.
     */
    @track calc = {
        monthlyAmount: 0,
        effectiveRate: 12,
        scenarios: [],
        projection: projectInvestment()
    };

    connectedCallback() {
        // Unset or unrecognised resolves to USD. The deprecated
        // defaultCurrencySymbol is deliberately not consulted.
        this.state.currencyCode = currencyCodeFor(this.defaultCurrencyCode);
        this.state.annualRate = clamp(
            toNumber(this.defaultAnnualRate, 12),
            BOUNDS.rate.min,
            BOUNDS.rate.max
        );
        this.state.compoundingFrequency = normalizeCompoundingFrequency(
            this.defaultCompoundingFrequency
        );
        this.state.durationYears = clamp(
            this.state.durationYears,
            this.durationMin,
            this.durationMax
        );
        if (!this.showLumpsumTab && LUMPSUM_MODES.includes(this.state.mode)) {
            this.state.mode = MODE.SIP_AMOUNT;
        }
        this._connected = true;
        this.recalculate();
    }

    // ---------------------------------------------------------------------
    // Derived configuration
    // ---------------------------------------------------------------------
    /** 'USD' | 'INR' | 'EUR' - drives every amount rendered by the calculator. */
    get currencyCode() {
        return this.state.currencyCode;
    }

    get currencyOptions() {
        return CURRENCY_OPTIONS;
    }

    handleCurrencyChange(event) {
        this.state.currencyCode = currencyCodeFor(event.detail.value);
    }

    get durationMin() {
        return Math.max(1, Math.round(toNumber(this.minDurationYears, 1)));
    }

    get durationMax() {
        return Math.max(
            this.durationMin,
            Math.round(toNumber(this.maxDurationYears, 40))
        );
    }

    get bounds() {
        return BOUNDS;
    }

    // ---------------------------------------------------------------------
    // Tabs
    // ---------------------------------------------------------------------
    get tabs() {
        const definitions = [
            { key: MODE.SIP_AMOUNT, label: 'SIP - Investment Amount' },
            { key: MODE.SIP_TARGET, label: 'SIP - Target Amount' },
            { key: MODE.LUMPSUM, label: 'Lumpsum' },
            { key: MODE.LUMPSUM_SIP, label: 'Lumpsum + SIP' }
        ].filter(
            (tab) => this.showLumpsumTab || !LUMPSUM_MODES.includes(tab.key)
        );

        return definitions.map((tab) => {
            const active = tab.key === this.state.mode;
            return {
                ...tab,
                active,
                ariaSelected: String(active),
                tabIndex: active ? 0 : -1,
                cssClass: active
                    ? 'slds-tabs_default__item slds-is-active'
                    : 'slds-tabs_default__item',
                linkClass: active
                    ? 'slds-tabs_default__link tab-button is-active-tab'
                    : 'slds-tabs_default__link tab-button'
            };
        });
    }

    handleTabClick(event) {
        const mode = event.currentTarget.dataset.mode;
        if (mode && mode !== this.state.mode) {
            this.state.mode = mode;
            this.state.selectedScenarioKey = 'average';
            this.recalculate();
        }
    }

    handleTabKeyDown(event) {
        const { key } = event;
        if (key !== 'ArrowRight' && key !== 'ArrowLeft') {
            return;
        }
        event.preventDefault();
        const keys = this.tabs.map((tab) => tab.key);
        const current = keys.indexOf(this.state.mode);
        const offset = key === 'ArrowRight' ? 1 : -1;
        const next = keys[(current + offset + keys.length) % keys.length];
        this.state.mode = next;
        this.state.selectedScenarioKey = 'average';
        this.recalculate();
        Promise.resolve().then(() => {
            const active = this.template.querySelector(
                '[data-mode].is-active-tab'
            );
            if (active) {
                active.focus();
            }
        });
    }

    // ---------------------------------------------------------------------
    // Which inputs are relevant for the current mode
    // ---------------------------------------------------------------------
    get isSipMode() {
        return SIP_MODES.includes(this.state.mode);
    }

    get showMonthlyInput() {
        return (
            this.state.mode === MODE.SIP_AMOUNT ||
            this.state.mode === MODE.LUMPSUM_SIP
        );
    }

    get showTargetInput() {
        return this.state.mode === MODE.SIP_TARGET;
    }

    get showLumpsumInput() {
        return LUMPSUM_MODES.includes(this.state.mode);
    }

    get showStepUpInput() {
        return this.showStepUp && this.isSipMode;
    }

    get showCompoundingFrequencyInput() {
        return this.showLumpsumInput;
    }

    get isTargetMode() {
        return this.state.mode === MODE.SIP_TARGET;
    }

    /** One-line explanation of the selected mode, shown under the tabs. */
    get modeSummary() {
        return MODE_SUMMARY[this.state.mode];
    }

    /** In combined mode the lumpsum is the money you begin with. */
    get lumpsumLabel() {
        return this.state.mode === MODE.LUMPSUM_SIP
            ? 'Starting Lumpsum Amount'
            : 'Lumpsum Amount';
    }

    get compoundingFrequencyOptions() {
        return COMPOUNDING_FREQUENCY_OPTIONS;
    }

    get compoundingFrequencyLabel() {
        const option = COMPOUNDING_FREQUENCY_OPTIONS.find(
            (item) => item.value === this.state.compoundingFrequency
        );
        return option ? option.label : 'Monthly';
    }

    handleCompoundingFrequencyChange(event) {
        this.state.compoundingFrequency = normalizeCompoundingFrequency(
            event.detail.value
        );
        this.recalculate();
    }

    // ---------------------------------------------------------------------
    // Input handlers -- one pair (range + number) per metric
    // ---------------------------------------------------------------------
    handleValueChange(event) {
        const field = event.currentTarget.dataset.field;
        const rawValue = event.detail
            ? event.detail.value
            : event.target.value;
        // Amounts: the slider is held to its display range, typed entry is not.
        const amountKey = AMOUNT_FIELDS[field];
        if (amountKey) {
            const isSlider = event.currentTarget.dataset.source === 'slider';
            const parsed = isSlider
                ? toNumber(rawValue, null)
                : parseNumberByCurrency(rawValue, this.state.currencyCode);
            if (!Number.isFinite(parsed)) {
                return;
            }
            const range =
                isSlider
                    ? BOUNDS[amountKey]
                    : ENTRY_RANGE;
            this.state[field] = clamp(parsed, range.min, range.max);
            this.recalculate();
            return;
        }

        const raw = toNumber(rawValue, null);
        if (raw === null) {
            return;
        }

        switch (field) {
            case 'annualRate':
                this.state.annualRate = clamp(
                    raw,
                    BOUNDS.rate.min,
                    BOUNDS.rate.max
                );
                // A new base rate invalidates the scenario selection.
                this.state.selectedScenarioKey = 'average';
                break;
            case 'durationYears':
                this.state.durationYears = clamp(
                    Math.round(raw),
                    this.durationMin,
                    this.durationMax
                );
                break;
            case 'stepUpPct':
                this.state.stepUpPct = clamp(
                    raw,
                    BOUNDS.stepUp.min,
                    BOUNDS.stepUp.max
                );
                break;
            case 'inflationRate':
                this.state.inflationRate = clamp(
                    raw,
                    BOUNDS.inflation.min,
                    BOUNDS.inflation.max
                );
                break;
            default:
                break;
        }
        this.recalculate();
    }

    handleInflationToggle(event) {
        this.state.includeInflation = event.target.checked;
    }

    handleScenarioSelect(event) {
        const key = event.detail && event.detail.key;
        if (key) {
            this.state.selectedScenarioKey = key;
            this.recalculate();
        }
    }

    // ---------------------------------------------------------------------
    // Current input values (for the template)
    // ---------------------------------------------------------------------
    get monthlyAmount() {
        return this.state.monthlyAmount;
    }

    get monthlyAmountInputValue() {
        return this.formatInputAmount(this.state.monthlyAmount);
    }

    get targetAmount() {
        return this.state.targetAmount;
    }

    get targetAmountInputValue() {
        return this.formatInputAmount(this.state.targetAmount);
    }

    get lumpsumAmount() {
        return this.state.lumpsumAmount;
    }

    get lumpsumAmountInputValue() {
        return this.formatInputAmount(this.state.lumpsumAmount);
    }

    get annualRate() {
        return this.state.annualRate;
    }

    get durationYears() {
        return this.state.durationYears;
    }

    get stepUpPct() {
        return this.state.stepUpPct;
    }

    get includeInflation() {
        return this.state.includeInflation;
    }

    get inflationRate() {
        return this.state.inflationRate;
    }

    get selectedScenarioKey() {
        return this.state.selectedScenarioKey;
    }

    get compoundingFrequency() {
        return this.state.compoundingFrequency;
    }

    get effectiveStepUpPct() {
        return this.showStepUpInput ? this.state.stepUpPct : 0;
    }

    get effectiveLumpsum() {
        return this.showLumpsumInput ? this.state.lumpsumAmount : 0;
    }

    // ---------------------------------------------------------------------
    // Calculation
    // ---------------------------------------------------------------------
    /**
     * Single calculation pass, run once per input change:
     *   1. in target mode, back-solve the monthly SIP at the *base* rate;
     *   2. build the three scenarios off that same invested amount;
     *   3. project at whichever scenario rate is currently selected.
     */
    recalculate() {
        const years = this.state.durationYears;
        const lumpsum = this.effectiveLumpsum;
        const stepUpPct = this.effectiveStepUpPct;
        const baseRate = this.state.annualRate;

        let monthlyAmount = this.showMonthlyInput
            ? this.state.monthlyAmount
            : 0;
        if (this.isTargetMode) {
            monthlyAmount = solveMonthlySipForTarget({
                targetAmount: this.state.targetAmount,
                annualRatePct: baseRate,
                years,
                stepUpPct,
                lumpsum,
                compoundingFrequency: this.state.compoundingFrequency
            });
        }

        const scenarios = buildScenarios({
            annualRatePct: baseRate,
            offsetPct: toNumber(this.scenarioOffset, 2),
            monthlyAmount,
            lumpsum,
            years,
            stepUpPct,
            compoundingFrequency: this.state.compoundingFrequency
        });
        const selected =
            scenarios.find(
                (item) => item.key === this.state.selectedScenarioKey
            ) || scenarios[1];
        const effectiveRate = selected ? selected.ratePct : baseRate;

        this.calc = {
            monthlyAmount,
            effectiveRate,
            scenarios,
            projection: projectInvestment({
                monthlyAmount,
                lumpsum,
                annualRatePct: effectiveRate,
                years,
                stepUpPct,
                compoundingFrequency: this.state.compoundingFrequency
            })
        };
    }

    /** Rate actually used for the headline / chart: base rate or the picked scenario. */
    get effectiveRate() {
        return this.calc.effectiveRate;
    }

    /** Scenarios are always computed off the base rate, never off the selection. */
    get scenarios() {
        return this.calc.scenarios;
    }

    /** Monthly SIP in play: the entered amount, or the solved one in target mode. */
    get solvedMonthlyAmount() {
        return this.calc.monthlyAmount;
    }

    /** The projection driving the headline, chart and breakdown table. */
    get projection() {
        return this.calc.projection;
    }

    get futureValue() {
        return this.projection.futureValue;
    }

    get totalInvested() {
        return this.projection.totalInvested;
    }

    get totalInterest() {
        return this.projection.totalInterest;
    }

    get realValue() {
        return inflationAdjustedValue(
            this.futureValue,
            this.state.inflationRate,
            this.state.durationYears
        );
    }

    // ---------------------------------------------------------------------
    // Output text
    // ---------------------------------------------------------------------
    get headline() {
        const years = this.state.durationYears;
        const yearWord = years === 1 ? 'year' : 'years';
        if (this.isTargetMode) {
            return `To reach ${this.format(this.state.targetAmount)} in ${years} ${yearWord}, you need to invest ${this.format(this.solvedMonthlyAmount)} monthly`;
        }
        return `After ${years} ${yearWord}, you will have ${this.format(this.futureValue)}`;
    }

    get subline() {
        return `Invested ${this.format(this.totalInvested)} | Estimated returns ${this.format(this.totalInterest)} | ${this.growthMultiple}x your investment`;
    }

    get growthMultiple() {
        if (this.totalInvested <= 0) {
            return '0';
        }
        return (this.futureValue / this.totalInvested).toFixed(2);
    }

    get inflationRealValueLabel() {
        return this.format(this.realValue);
    }

    get inflationRateLabel() {
        return `${this.state.inflationRate}%`;
    }

    get rateSummary() {
        const stepUp =
            this.effectiveStepUpPct > 0
                ? ` with a ${this.effectiveStepUpPct}% annual step-up`
                : '';
        const compoundingNote = this.showLumpsumInput
            ? `Lumpsum compounded ${this.compoundingFrequencyLabel.toLowerCase()}.`
            : '';
        // In target mode the SIP is solved at the base rate; the chart and cards
        // then show what that same SIP does at the selected scenario rate.
        if (this.isTargetMode && this.effectiveRate !== this.state.annualRate) {
            const summary = `Required amount solved at ${this.state.annualRate}% p.a.${stepUp}; chart shown at ${this.effectiveRate}% p.a.`;
            return compoundingNote ? `${summary} ${compoundingNote}` : summary;
        }
        const summary = `Projected at ${this.effectiveRate}% p.a.${stepUp}`;
        return compoundingNote ? `${summary}. ${compoundingNote}` : summary;
    }

    format(value) {
        return formatCurrency(value, this.state.currencyCode);
    }

    formatInputAmount(value) {
        return formatNumberByCurrency(value, this.state.currencyCode, 2);
    }

    // ---------------------------------------------------------------------
    // Child component payloads
    // ---------------------------------------------------------------------
    get chartSeries() {
        return this.projection.breakdown.map((row) => ({
            year: row.year,
            invested: row.cumulativeInvested,
            total: row.closingBalance
        }));
    }

    get breakdownRows() {
        return this.projection.breakdown;
    }

    get hasProjection() {
        return this.projection.breakdown.length > 0;
    }

    get displayScenarioCards() {
        return this.showScenarioCards && this.hasProjection;
    }

    // ---------------------------------------------------------------------
    // Aria helpers for the sliders
    // ---------------------------------------------------------------------
    get monthlyAriaLabel() {
        return `Monthly investment amount in ${this.currencyCode}`;
    }

    get targetAriaLabel() {
        return `Target maturity amount in ${this.currencyCode}`;
    }

    get lumpsumAriaLabel() {
        return `${this.lumpsumLabel} in ${this.currencyCode}`;
    }

    get rateAriaLabel() {
        return 'Expected annual growth rate in percent';
    }

    get durationAriaLabel() {
        return 'Investment duration in years';
    }

    get stepUpAriaLabel() {
        return 'Annual step-up on the monthly investment, in percent';
    }

    get inflationAriaLabel() {
        return 'Assumed annual inflation rate in percent';
    }

    get compoundingFrequencyAriaLabel() {
        return 'Compounding frequency for lumpsum amount';
    }

    get currencyAriaLabel() {
        return 'Display currency and number format';
    }
}
