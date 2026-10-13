/**
 * sipScenarioCards - three cards comparing the same investment at a lower,
 * expected and higher growth rate (Below Average / Average / Above Average).
 *
 * The parent computes the three scenarios and passes them in; this component
 * only renders and handles selection. The cards behave as one radio group:
 * click, Arrow keys or Enter/Space picks one, and the choice is reported up as
 * a 'scenarioselect' event so the parent can re-project at that rate.
 */
import { LightningElement, api } from 'lwc';
import { formatCurrency } from 'c/sipFormat';

export default class SipScenarioCards extends LightningElement {
    /** [{ key, label, ratePct, futureValue, totalInterest }] from c/sipMath. */
    @api scenarios = [];
    @api selectedKey = 'average';
    /** 'USD' | 'INR' | 'EUR' - decides symbol and grouping on the amounts. */
    @api currencyCode = 'USD';
    @api groupLabel = 'Compare return scenarios';

    get cards() {
        const list = Array.isArray(this.scenarios) ? this.scenarios : [];
        return list.map((scenario) => {
            const selected = scenario.key === this.selectedKey;
            return {
                ...scenario,
                selected,
                ariaChecked: String(selected),
                tabIndex: selected ? 0 : -1,
                rateLabel: `${scenario.ratePct}% p.a.`,
                formattedValue: formatCurrency(
                    scenario.futureValue,
                    this.currencyCode
                ),
                returnsLabel: `Returns ${formatCurrency(
                    scenario.totalInterest,
                    this.currencyCode
                )}`,
                cssClass: selected
                    ? 'scenario-card scenario-card_selected slds-box slds-box_x-small'
                    : 'scenario-card slds-box slds-box_x-small',
                indicatorClass: selected
                    ? 'indicator indicator_checked'
                    : 'indicator'
            };
        });
    }

    get hasCards() {
        return this.cards.length > 0;
    }

    handleSelect(event) {
        this.select(event.currentTarget.dataset.key);
    }

    handleKeyDown(event) {
        const { key } = event;
        const keys = this.cards.map((card) => card.key);
        const current = keys.indexOf(event.currentTarget.dataset.key);

        if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
            event.preventDefault();
            this.select(keys[current]);
            return;
        }

        let offset = 0;
        if (key === 'ArrowRight' || key === 'ArrowDown') {
            offset = 1;
        } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
            offset = -1;
        } else {
            return;
        }

        event.preventDefault();
        const next = keys[(current + offset + keys.length) % keys.length];
        this.select(next);
        // Follow focus, as expected inside a radio group.
        Promise.resolve().then(() => {
            const target = this.template.querySelector(
                `[data-key="${next}"]`
            );
            if (target) {
                target.focus();
            }
        });
    }

    select(key) {
        if (!key || key === this.selectedKey) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('scenarioselect', { detail: { key } })
        );
    }
}
