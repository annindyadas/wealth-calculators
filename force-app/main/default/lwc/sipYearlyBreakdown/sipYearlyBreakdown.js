/**
 * sipYearlyBreakdown - the year-by-year table under the chart.
 *
 * Takes the breakdown rows produced by c/sipMath and maps them onto four
 * columns: Year, Investment Amount, Interest Earned and Maturity Amount, plus a
 * "Step Up" badge column showing the increase applied that year. Amounts are
 * formatted through c/sipFormat into plain text rather than using the
 * datatable's currency type, because that type follows the user's Salesforce
 * locale and would always put the symbol in front - wrong for EUR. It renders
 * through c/sipDatatable rather than lightning-datatable, because the badge
 * column needs a custom cell type.
 */
import { LightningElement, api } from 'lwc';
import { formatCurrency } from 'c/sipFormat';

export default class SipYearlyBreakdown extends LightningElement {
    /** Year rows produced by sipMath.projectInvestment(). */
    @api rows = [];
    /** 'USD' | 'INR' | 'EUR' - decides symbol position and grouping. */
    @api currencyCode = 'USD';
    @api tableTitle = 'Year-by-year breakdown';

    /** Adds the step-up badge column. The parent always sets this explicitly. */
    @api showStepUp = false;

    get columns() {
        // Pre-formatted text, right aligned, so every currency keeps its own
        // symbol position and grouping.
        const currency = {
            type: 'text',
            cellAttributes: { alignment: 'right' }
        };
        const columns = [
            {
                label: 'Year',
                fieldName: 'year',
                type: 'number',
                fixedWidth: 80,
                cellAttributes: { alignment: 'left' }
            },
            {
                label: 'Investment Amount',
                fieldName: 'investmentAmount',
                ...currency
            },
            { label: 'Interest Earned', fieldName: 'interestEarned', ...currency },
            {
                label: 'Maturity Amount',
                fieldName: 'maturityAmount',
                ...currency
            }
        ];

        if (this.showStepUp) {
            columns.push({
                label: 'Step Up',
                fieldName: 'stepUpLabel',
                type: 'stepUpBadge',
                fixedWidth: 110,
                typeAttributes: { assistiveLabel: { fieldName: 'stepUpAssistive' } }
            });
        }
        return columns;
    }

    /** Values are rounded to whole currency units at this render boundary only. */
    get tableRows() {
        const money = (value) => formatCurrency(value, this.currencyCode);
        return (Array.isArray(this.rows) ? this.rows : []).map((row) => ({
            year: row.year,
            investmentAmount: money(row.yearlyInvestment),
            interestEarned: money(row.interestEarned),
            maturityAmount: money(row.closingBalance),
            stepUpLabel:
                row.stepUpAppliedPct > 0 ? `${row.stepUpAppliedPct}%` : '',
            stepUpAssistive:
                row.stepUpAppliedPct > 0
                    ? `Stepped up by ${row.stepUpAppliedPct} percent this year`
                    : ''
        }));
    }

    get hasRows() {
        return this.tableRows.length > 0;
    }

    /**
     * lightning-datatable only pins its header when its container has a fixed
     * height, so set one: tall enough for the rows, capped so a 40 year term
     * scrolls instead of pushing the page down.
     */
    get tableStyle() {
        const HEADER_REM = 2.6;
        const ROW_REM = 2.05;
        const MAX_REM = 24;
        const needed = HEADER_REM + this.tableRows.length * ROW_REM;
        return `height: ${Math.min(needed, MAX_REM).toFixed(2)}rem;`;
    }
}
