/**
 * categoryFilterBar - a row of category filter chips.
 *
 * The parent passes the category names and which one is selected; this component
 * renders them as toggle buttons and fires 'categoryselect' with { category }
 * when one is picked. It stores no state, so the parent stays the single source
 * of truth. Chips are real buttons with aria-pressed, so they are reachable and
 * operable by keyboard with no extra handlers.
 */
import { LightningElement, api } from 'lwc';

export default class CategoryFilterBar extends LightningElement {
    /** e.g. ['All', 'Investing', 'Retirement'] */
    @api categories = [];
    @api selected;
    @api groupLabel = 'Filter calculators by category';

    get chips() {
        return (Array.isArray(this.categories) ? this.categories : []).map(
            (category) => {
                const active = category === this.selected;
                return {
                    key: category,
                    label: category,
                    pressed: String(active),
                    cssClass: active ? 'chip chip_active' : 'chip'
                };
            }
        );
    }

    get hasChips() {
        return this.chips.length > 1;
    }

    handleClick(event) {
        this.dispatchEvent(
            new CustomEvent('categoryselect', {
                detail: { category: event.currentTarget.dataset.category }
            })
        );
    }
}
