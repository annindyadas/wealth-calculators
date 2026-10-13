import { LightningElement, api, track } from 'lwc';
import {
    CURRENCY_OPTIONS,
    DEFAULT_CURRENCY_CODE,
    currencyCodeFor,
    formatNumberByCurrency,
    parseNumberByCurrency,
    formatCompactCurrency,
    formatCurrency
} from 'c/sipFormat';

const DISCLAIMER =
    'Assumptions: SIP contributions are invested at the start of each month. Returns are annual rates applied consistently in the model. Pre-retirement return uses Annual Return Generated; post-retirement corpus growth uses Corpus Growth After Retirement. Monthly expense is treated as expense at retirement start and then increased yearly by the chosen post-retirement increase. Additional planned expenses are applied by start age and duration. Results are illustrative and exclude taxes, fees, and product-specific charges.';

function toNumber(value, fallback = 0) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function percent(ratePct) {
    return toNumber(ratePct, 0) / 100;
}

function nextExpenseId(list) {
    const max = list.reduce((acc, item) => Math.max(acc, item.id || 0), 0);
    return max + 1;
}

const CHART = {
    width: 640,
    height: 280,
    padTop: 16,
    padRight: 16,
    padBottom: 36,
    padLeft: 56
};

const MONEY_FIELDS = new Set([
    'existingCorpus',
    'monthlySip',
    'monthlyExpenseAtRetirement'
]);

export default class BucketLadderingPlanner extends LightningElement {
    @api defaultCurrencyCode = DEFAULT_CURRENCY_CODE;

    @track state = {
        currencyCode: DEFAULT_CURRENCY_CODE,
        currentAge: 35,
        retirementAge: 60,
        planUntilAge: 90,
        existingCorpus: 1000000,
        monthlySip: 5000,
        sipStepUpPct: 10,
        preRetReturnPct: 11,
        inflationPct: 6,
        monthlyExpenseAtRetirement: 4500,
        postRetExpenseIncreasePct: 6,
        expectedTaxBracketPct: 0,
        useSamePostRetReturn: true,
        postRetReturnPct: 11,
        showAccumulationRows: true,
        tableRowLimit: '10',
        plannedExpenses: [
            {
                id: 1,
                name: 'Car Replacement',
                amount: 25000,
                startAge: 63,
                durationYears: 1
            }
        ]
    };

    @track result = {
        corpusAtRetirement: 0,
        corpusAtRetirementReal: 0,
        lastsUntilAge: 0,
        endingCorpus: 0,
        firstShortfallAge: null,
        rows: []
    };

    disclaimer = DISCLAIMER;
    recalculateTimer = null;
    outputRowsCache = [];
    corpusChartCache = null;
    @track chartTooltip = {
        visible: false,
        text: ''
    };

    connectedCallback() {
        this.state.currencyCode = currencyCodeFor(this.defaultCurrencyCode);
        this.recalculate();
    }

    disconnectedCallback() {
        if (this.recalculateTimer) {
            clearTimeout(this.recalculateTimer);
            this.recalculateTimer = null;
        }
    }

    get currencyOptions() {
        return CURRENCY_OPTIONS;
    }

    get currencyCode() {
        return this.state.currencyCode;
    }

    get postRetReturnDisabled() {
        return this.state.useSamePostRetReturn;
    }

    get hasShortfall() {
        return this.result.firstShortfallAge !== null;
    }

    get lastsUntilLabel() {
        if (this.result.firstShortfallAge === null) {
            return `Corpus lasts through age ${this.state.planUntilAge}`;
        }
        return `Corpus lasts until age ${this.result.firstShortfallAge}`;
    }

    get shortfallLabel() {
        return this.hasShortfall
            ? `First shortfall appears at age ${this.result.firstShortfallAge}`
            : 'No shortfall in selected planning horizon';
    }

    get summaryCards() {
        const retirementAge = Math.round(toNumber(this.state.retirementAge, 0));
        return [
            {
                key: 'retirementCorpus',
                label: `Amount at Retirement Age (${retirementAge})`,
                value: this.money(this.result.corpusAtRetirement),
                valueClass:
                    this.result.corpusAtRetirement < 0
                        ? 'summary-item__value summary-item__value_negative'
                        : 'summary-item__value'
            },
            {
                key: 'retirementCorpusReal',
                label: `Amount at Retirement Age (${retirementAge}, Inflation Adjusted)`,
                value: this.money(this.result.corpusAtRetirementReal),
                valueClass:
                    this.result.corpusAtRetirementReal < 0
                        ? 'summary-item__value summary-item__value_negative'
                        : 'summary-item__value'
            },
            {
                key: 'endingCorpus',
                label: `Corpus Left at Age ${this.state.planUntilAge}`,
                value: this.money(this.result.endingCorpus),
                valueClass:
                    this.result.endingCorpus < 0
                        ? 'summary-item__value summary-item__value_negative'
                        : 'summary-item__value'
            },
            {
                key: 'lastsUntil',
                label: 'Corpus Sustainability',
                value: this.lastsUntilLabel,
                valueClass: 'summary-item__value'
            }
        ];
    }

    get shortfallClass() {
        return this.hasShortfall
            ? 'shortfall-message shortfall-message_negative'
            : 'shortfall-message';
    }

    get existingCorpusInputValue() {
        return this.formatMoneyInput(this.state.existingCorpus);
    }

    get monthlySipInputValue() {
        return this.formatMoneyInput(this.state.monthlySip);
    }

    get monthlyExpenseAtRetirementInputValue() {
        return this.formatMoneyInput(this.state.monthlyExpenseAtRetirement);
    }

    get plannedExpenseRows() {
        const inflation = percent(this.state.inflationPct);
        const currentAge = toNumber(this.state.currentAge, 0);

        return this.state.plannedExpenses.map((expense, index) => {
            const startAge = toNumber(expense.startAge, currentAge);
            const yearsToStart = Math.max(0, startAge - currentAge);
            const adjusted =
                toNumber(expense.amount, 0) * Math.pow(1 + inflation, yearsToStart);
            return {
                ...expense,
                canDelete: index >= 0,
                amountInputValue: this.formatMoneyInput(toNumber(expense.amount, 0)),
                adjustedAmountLabel: this.money(adjusted),
                durationYears: clamp(
                    Math.round(toNumber(expense.durationYears, 1)),
                    1,
                    60
                )
            };
        });
    }

    get outputRows() {
        return this.outputRowsCache;
    }

    get hasOutputRows() {
        return this.outputRows.length > 0;
    }

    get hasChartData() {
        return this.outputRows.length > 0;
    }

    get rowLimitOptions() {
        return [10, 20, 30, 40, 50].map((value) => ({
            label: String(value),
            value: String(value)
        }));
    }

    get tableWrapClass() {
        const limit = clamp(
            Math.round(toNumber(this.state.tableRowLimit, 10)),
            10,
            50
        );
        return `table-wrap table-wrap_limit-${limit}`;
    }

    get chartViewBox() {
        return `0 0 ${CHART.width} ${CHART.height}`;
    }

    get chartAriaLabel() {
        if (!this.hasChartData) {
            return 'No projection available yet.';
        }
        return `Corpus trajectory from age ${this.result.rows[0].age} to age ${this.result.rows[this.result.rows.length - 1].age}.`;
    }

    get corpusChart() {
        return this.corpusChartCache;
    }

    get hasChartTooltip() {
        return this.chartTooltip.visible;
    }

    get showAccumulationRows() {
        return this.state.showAccumulationRows;
    }

    handleCurrencyChange(event) {
        this.state.currencyCode = currencyCodeFor(event.detail.value);
        this.refreshDerivedViews();
    }

    handleInputChange(event) {
        const field = event.target.dataset.field;
        if (!field) {
            return;
        }

        if (field === 'useSamePostRetReturn') {
            this.state.useSamePostRetReturn = event.target.checked;
            if (this.state.useSamePostRetReturn) {
                this.state.postRetReturnPct = this.state.preRetReturnPct;
            }
            this.scheduleRecalculate();
            return;
        }

        if (field === 'showAccumulationRows') {
            this.state.showAccumulationRows = event.target.checked;
            this.refreshDerivedViews();
            return;
        }

        if (field === 'tableRowLimit') {
            const limit = clamp(
                Math.round(toNumber(event.detail?.value ?? event.target.value, 10)),
                10,
                50
            );
            this.state.tableRowLimit = String(limit);
            return;
        }

        const inputValue = event.detail?.value ?? event.target.value;
        const raw = MONEY_FIELDS.has(field)
            ? parseNumberByCurrency(inputValue, this.state.currencyCode)
            : toNumber(inputValue, 0);
        this.state[field] = raw;

        if (field === 'preRetReturnPct' && this.state.useSamePostRetReturn) {
            this.state.postRetReturnPct = raw;
        }

        this.scheduleRecalculate();
    }

    handlePlannedExpenseChange(event) {
        const id = toNumber(event.target.dataset.id, null);
        const field = event.target.dataset.field;
        if (id === null || !field) {
            return;
        }

        this.state.plannedExpenses = this.state.plannedExpenses.map((expense) => {
            if (expense.id !== id) {
                return expense;
            }

            if (field === 'name') {
                return { ...expense, name: event.target.value };
            }

            const inputValue = event.detail?.value ?? event.target.value;
            const raw =
                field === 'amount'
                    ? parseNumberByCurrency(inputValue, this.state.currencyCode)
                    : toNumber(inputValue, 0);
            if (field === 'durationYears') {
                return {
                    ...expense,
                    durationYears: clamp(Math.round(raw), 1, 60)
                };
            }

            if (field === 'startAge') {
                return {
                    ...expense,
                    startAge: clamp(Math.round(raw), 0, 120)
                };
            }

            return { ...expense, [field]: Math.max(0, raw) };
        });

        if (field !== 'name') {
            this.scheduleRecalculate();
        }
    }

    addPlannedExpense() {
        const id = nextExpenseId(this.state.plannedExpenses);
        const startAge = Math.max(
            toNumber(this.state.currentAge, 0),
            toNumber(this.state.retirementAge, 0)
        );

        this.state.plannedExpenses = [
            ...this.state.plannedExpenses,
            {
                id,
                name: '',
                amount: 0,
                startAge,
                durationYears: 1
            }
        ];
        this.scheduleRecalculate();
    }

    removePlannedExpense(event) {
        const id = toNumber(event.target.dataset.id, null);
        if (id === null || this.state.plannedExpenses.length === 1) {
            return;
        }
        this.state.plannedExpenses = this.state.plannedExpenses.filter(
            (expense) => expense.id !== id
        );
        this.scheduleRecalculate();
    }

    scheduleRecalculate() {
        if (this.recalculateTimer) {
            clearTimeout(this.recalculateTimer);
        }

        this.recalculateTimer = setTimeout(() => {
            this.recalculateTimer = null;
            this.recalculate();
        }, 120);
    }

    refreshDerivedViews() {
        this.outputRowsCache = this.buildOutputRows();
        this.corpusChartCache = this.buildCorpusChart(this.outputRowsCache);
    }

    buildOutputRows() {
        const allRows = Array.isArray(this.result?.rows) ? this.result.rows : [];
        const sourceRows = this.state.showAccumulationRows
            ? allRows
            : allRows.filter((row) => row.phase === 'retirement');

        return sourceRows.map((row) => {
            const monthlyExpenseDisplay = -Math.abs(toNumber(row.monthlyExpense, 0));
            const annualExpenseDisplay = -Math.abs(toNumber(row.annualExpense, 0));
            const additionalExpenseDisplay = -Math.abs(
                toNumber(row.additionalExpense, 0)
            );

            return {
                ...row,
            key: `${row.phase}-${row.age}-${row.year}`,
            sipAmountLabel: this.signedMoney(row.sipAmount, true),
            sipAmountMonthlyHoverLabel: `Monthly - ${this.money(toNumber(row.sipAmount, 0) / 12)}`,
            startingCorpusLabel: this.money(row.startingCorpus),
            returnsGeneratedLabel: this.signedMoney(row.returnsGenerated, true),
            monthlyExpenseLabel: this.money(monthlyExpenseDisplay),
            annualExpenseLabel: this.money(annualExpenseDisplay),
            additionalExpenseLabel: this.money(additionalExpenseDisplay),
            corpusLeftLabel: this.money(row.corpusLeft),
            sipAmountClass: this.inflowClass(row.sipAmount),
            startingCorpusClass: this.amountClass(row.startingCorpus),
            returnsGeneratedClass: this.inflowClass(row.returnsGenerated),
            monthlyExpenseClass: this.amountClass(monthlyExpenseDisplay),
            annualExpenseClass: this.amountClass(annualExpenseDisplay),
            additionalExpenseClass: this.amountClass(additionalExpenseDisplay),
            corpusLeftClass: this.inflowClass(row.corpusLeft),
            rowClass: row.corpusLeft < 0 ? 'output-row output-row_negative' : 'output-row'
            };
        });
    }

    buildCorpusChart(rows) {
        if (!rows.length) {
            return null;
        }

        const minValue = Math.min(...rows.map((row) => row.corpusLeft), 0);
        const maxValue = Math.max(
            ...rows.map((row) => row.startingCorpus),
            ...rows.map((row) => row.corpusLeft),
            1
        );
        const plotWidth = CHART.width - CHART.padLeft - CHART.padRight;
        const plotHeight = CHART.height - CHART.padTop - CHART.padBottom;
        const valueRange = maxValue - minValue || 1;

        const xFor = (index) =>
            CHART.padLeft +
            (rows.length > 1 ? (index / (rows.length - 1)) * plotWidth : 0);
        const yFor = (value) =>
            CHART.padTop + ((maxValue - value) / valueRange) * plotHeight;

        const points = rows.map((row, index) => ({
            key: `${row.age}-${row.year}`,
            index,
            x: xFor(index),
            y: yFor(row.corpusLeft),
            age: row.age,
            year: row.year,
            corpusLabel: this.money(row.corpusLeft),
            tooltipText: `Age ${row.age} (${row.year}): ${this.money(row.corpusLeft)}`
        }));

        const linePath = points
            .map((point, index) =>
                `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`
            )
            .join(' ');

        const baselineY = yFor(0);
        const firstX = points[0].x;
        const lastX = points[points.length - 1].x;
        const areaPath = `${linePath} L${lastX.toFixed(2)},${baselineY.toFixed(
            2
        )} L${firstX.toFixed(2)},${baselineY.toFixed(2)} Z`;

        const yTicks = [0, 0.25, 0.5, 0.75, 1].map((factor, index) => {
            const value = minValue + (maxValue - minValue) * factor;
            return {
                key: `y${index}`,
                y: yFor(value),
                label: formatCompactCurrency(value, this.state.currencyCode),
                x: CHART.padLeft - 8
            };
        });

        const xTicks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1]
            .filter((value, index, arr) => arr.indexOf(value) === index)
            .map((index) => ({
                key: `x${index}`,
                x: xFor(index),
                label: `${rows[index].age} (${rows[index].year})`
            }));

        return {
            linePath,
            areaPath,
            points,
            yTicks,
            xTicks,
            baselineY,
            axisLeft: CHART.padLeft,
            axisRight: CHART.width - CHART.padRight,
            axisTop: CHART.padTop,
            axisBottom: CHART.height - CHART.padBottom
        };
    }

    handleChartPointHover(event) {
        const text = event.currentTarget.dataset.tooltip;
        if (!text) {
            return;
        }
        this.chartTooltip = {
            visible: true,
            text
        };
    }

    hideChartTooltip() {
        this.chartTooltip = {
            ...this.chartTooltip,
            visible: false
        };
    }

    recalculate() {
        const currentAge = Math.round(toNumber(this.state.currentAge, 0));
        const currentYear = new Date().getFullYear();
        const retirementAge = Math.max(
            currentAge,
            Math.round(toNumber(this.state.retirementAge, currentAge))
        );
        const planUntilAge = Math.max(
            retirementAge,
            Math.round(toNumber(this.state.planUntilAge, retirementAge))
        );

        const monthlySip = Math.max(0, toNumber(this.state.monthlySip, 0));
        const stepUp = Math.max(0, percent(this.state.sipStepUpPct));
        const preRetAnnual = percent(this.state.preRetReturnPct);
        const inflation = Math.max(0, percent(this.state.inflationPct));
        const postRetExpenseIncrease = Math.max(
            0,
            percent(this.state.postRetExpenseIncreasePct)
        );
        const postRetAnnual = percent(this.state.postRetReturnPct);
        const taxRate = clamp(percent(this.state.expectedTaxBracketPct), 0, 1);
        const taxMultiplier = 1 + taxRate;

        const monthlyReturn = preRetAnnual / 12;
        const yearsToRetirement = Math.max(0, retirementAge - currentAge);

        const plannedExpenses = this.state.plannedExpenses.map((expense) => ({
            ...expense,
            amount: Math.max(0, toNumber(expense.amount, 0)),
            startAge: Math.max(0, Math.round(toNumber(expense.startAge, retirementAge))),
            durationYears: clamp(
                Math.round(toNumber(expense.durationYears, 1)),
                1,
                60
            )
        }));

        const additionalExpenseForAge = (age) =>
            plannedExpenses.reduce((sum, expense) => {
                if (
                    age < expense.startAge ||
                    age >= expense.startAge + expense.durationYears
                ) {
                    return sum;
                }

                const yearsToStart = Math.max(0, expense.startAge - currentAge);
                const adjustedAtStart =
                    expense.amount * Math.pow(1 + inflation, yearsToStart);
                const yearsSinceStart = age - expense.startAge;
                const adjustedForYear =
                    adjustedAtStart * Math.pow(1 + inflation, yearsSinceStart);

                return sum + adjustedForYear;
            }, 0);

        let corpus = Math.max(0, toNumber(this.state.existingCorpus, 0));
        const rows = [];

        for (let year = 0; year < yearsToRetirement; year++) {
            const age = currentAge + year;
            const calendarYear = currentYear + year;
            const startingCorpus = corpus;
            const sipForYear = monthlySip * Math.pow(1 + stepUp, year);
            for (let month = 0; month < 12; month++) {
                corpus = (corpus + sipForYear) * (1 + monthlyReturn);
            }
            const annualSip = sipForYear * 12;
            const corpusBeforeAdditionalExpense = corpus;
            const returnsGenerated =
                corpusBeforeAdditionalExpense - startingCorpus - annualSip;
            const additionalExpense = additionalExpenseForAge(age);
            const corpusLeft = corpusBeforeAdditionalExpense - additionalExpense;

            rows.push({
                phase: 'accumulation',
                age,
                year: calendarYear,
                sipAmount: annualSip,
                startingCorpus,
                returnsGenerated,
                monthlyExpense: 0,
                annualExpense: 0,
                additionalExpense,
                corpusLeft
            });

            corpus = corpusLeft;
        }

        const corpusAtRetirement = corpus;
        const corpusAtRetirementReal =
            yearsToRetirement > 0
                ? corpusAtRetirement / Math.pow(1 + inflation, yearsToRetirement)
                : corpusAtRetirement;

        let monthlyExpense = Math.max(
            0,
            toNumber(this.state.monthlyExpenseAtRetirement, 0)
        );

        let firstShortfallAge = null;
        let lastsUntilAge = planUntilAge;

        for (let age = retirementAge; age <= planUntilAge; age++) {
            const startingCorpus = corpus;
            const returnsGenerated = startingCorpus * postRetAnnual;

            const monthlyExpenseWithTax = monthlyExpense * taxMultiplier;
            const annualExpense = monthlyExpenseWithTax * 12;
            const additionalExpense = additionalExpenseForAge(age) * taxMultiplier;

            const corpusLeft =
                startingCorpus + returnsGenerated - annualExpense - additionalExpense;

            rows.push({
                phase: 'retirement',
                age,
                year: currentYear + (age - currentAge),
                sipAmount: 0,
                startingCorpus,
                returnsGenerated,
                monthlyExpense: monthlyExpenseWithTax,
                annualExpense,
                additionalExpense,
                corpusLeft
            });

            if (firstShortfallAge === null && corpusLeft < 0) {
                firstShortfallAge = age;
                lastsUntilAge = age;
            }

            corpus = corpusLeft;
            monthlyExpense *= 1 + postRetExpenseIncrease;
        }

        this.result = {
            corpusAtRetirement,
            corpusAtRetirementReal,
            lastsUntilAge,
            endingCorpus: corpus,
            firstShortfallAge,
            rows
        };
        this.refreshDerivedViews();
    }

    money(value) {
        return formatCurrency(value, this.state.currencyCode);
    }

    signedMoney(value, showPlus = false) {
        const amount = toNumber(value, 0);
        const formatted = this.money(amount);
        if (showPlus && amount > 0) {
            return `+${formatted}`;
        }
        return formatted;
    }

    formatMoneyInput(value) {
        return formatNumberByCurrency(value, this.state.currencyCode, 2);
    }

    amountClass(value) {
        return value < 0 ? 'amount amount_negative' : 'amount';
    }

    inflowClass(value) {
        if (value < 0) {
            return 'amount amount_negative';
        }
        if (value > 0) {
            return 'amount amount_positive';
        }
        return 'amount';
    }
}
