/**
 * calculatorCard - one calculator in the hub grid, and the only place card
 * styling lives.
 *
 * Everything it shows arrives as plain @api properties, so it is reusable
 * wherever a calculator needs to be linked to, and it does not care whether the
 * data came from calculatorCatalog.js, Custom Metadata or Apex. The whole card
 * is a real anchor for keyboard and middle-click behaviour, but clicks are
 * intercepted and routed through NavigationMixin so it works inside LWR sites.
 */
import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

export default class CalculatorCard extends NavigationMixin(LightningElement) {
    @api name;
    @api description;
    @api category;
    @api iconName = 'utility:trending';
    @api targetUrl;
    @api isEnabled = false;

    get isCardEnabled() {
        return this.isEnabled === true || this.isEnabled === 'true';
    }

    get cardClass() {
        return this.isCardEnabled ? 'card' : 'card card_disabled';
    }

    get cardHref() {
        return this.isCardEnabled ? this.targetUrl : '#';
    }

    get cardAriaDisabled() {
        return this.isCardEnabled ? 'false' : 'true';
    }

    get actionLabel() {
        return this.isCardEnabled ? 'Open calculator' : 'Coming soon';
    }

    handleClick(event) {
        if (!this.isCardEnabled || !this.targetUrl) {
            event.preventDefault();
            return;
        }
        // Let modified clicks (new tab, download) behave natively.
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
            return;
        }
        event.preventDefault();
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: this.targetUrl }
        });
    }
}
