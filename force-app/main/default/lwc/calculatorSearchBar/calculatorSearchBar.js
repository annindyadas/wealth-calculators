/**
 * calculatorSearchBar - a single search input, nothing more.
 *
 * It holds no filtering logic: on each keystroke it fires a 'search' event with
 * { value } and lets the parent (c/calculatorHub, or the site header later)
 * decide what to filter. Keystrokes are debounced by 200ms so a long list is
 * not re-filtered on every character.
 */
import { LightningElement, api } from 'lwc';

const DEBOUNCE_MS = 200;

export default class CalculatorSearchBar extends LightningElement {
    @api placeholder = 'Search calculators';
    @api label = 'Search calculators';
    @api value = '';

    _timer;

    disconnectedCallback() {
        clearTimeout(this._timer);
    }

    handleInput(event) {
        const value = event.target.value;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this.dispatchEvent(
                new CustomEvent('search', { detail: { value } })
            );
        }, DEBOUNCE_MS);
    }

    /** Escape clears the field, which is the expected behaviour in a search box. */
    handleKeyDown(event) {
        if (event.key === 'Escape' && event.target.value) {
            event.target.value = '';
            clearTimeout(this._timer);
            this.dispatchEvent(
                new CustomEvent('search', { detail: { value: '' } })
            );
        }
    }
}
