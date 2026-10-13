/**
 * siteHeader - the sticky masthead: wordmark, up to three nav links, search and
 * one CTA. Placed in the site's header region.
 *
 * Every label and URL is an @api string so links can be renamed in Experience
 * Builder without a redeploy, and new calculators never require touching this
 * component. Below 768px the links collapse into a hamburger that opens a
 * slide-out panel (Escape closes it, focus moves to the panel). The search box
 * only fires a 'search' event with { value }; wiring it to the calculator
 * registry is a separate step.
 */
import { LightningElement, api } from 'lwc';

export default class SiteHeader extends LightningElement {
    @api wordmark = 'Finance';
    @api wordmarkUrl = '/';

    @api navOneLabel = 'Home';
    @api navOneUrl = '/';
    @api navTwoLabel = 'Calculators';
    @api navTwoUrl = '/calculators';
    @api navThreeLabel = 'Insights';
    @api navThreeUrl = '/insights';

    @api ctaLabel = 'Get started';
    @api ctaUrl = '/calculators';
    @api searchPlaceholder = 'Search calculators';

    menuOpen = false;
    mobileSearchOpen = false;

    /** Only links with both a label and a URL are rendered. */
    get navLinks() {
        return [
            { label: this.navOneLabel, url: this.navOneUrl },
            { label: this.navTwoLabel, url: this.navTwoUrl },
            { label: this.navThreeLabel, url: this.navThreeUrl }
        ]
            .filter((link) => link.label && link.url)
            .map((link) => ({ ...link, key: `${link.label}-${link.url}` }));
    }

    get hasCta() {
        return Boolean(this.ctaLabel && this.ctaUrl);
    }

    get menuExpanded() {
        return String(this.menuOpen);
    }

    get menuButtonLabel() {
        return this.menuOpen ? 'Close menu' : 'Open menu';
    }

    get menuIcon() {
        return this.menuOpen ? 'utility:close' : 'utility:rows';
    }

    get panelClass() {
        return this.menuOpen ? 'panel panel_open' : 'panel';
    }

    get mobileSearchClass() {
        return this.mobileSearchOpen
            ? 'header__mobile-search header__mobile-search_open'
            : 'header__mobile-search';
    }

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        if (this.menuOpen) {
            this.mobileSearchOpen = false;
            // Move focus into the panel once it has rendered.
            Promise.resolve().then(() => {
                const firstLink = this.template.querySelector('.panel__link');
                if (firstLink) {
                    firstLink.focus();
                }
            });
        }
    }

    toggleMobileSearch() {
        this.mobileSearchOpen = !this.mobileSearchOpen;
        if (this.mobileSearchOpen) {
            this.menuOpen = false;
        }
    }

    handleKeyDown(event) {
        if (event.key !== 'Escape') {
            return;
        }
        if (this.menuOpen) {
            this.menuOpen = false;
            const toggle = this.template.querySelector('.header__menu-button');
            if (toggle) {
                toggle.focus();
            }
        }
        this.mobileSearchOpen = false;
    }

    /** Closing on navigation keeps the panel from staying open behind the page. */
    handlePanelNavigate() {
        this.menuOpen = false;
    }

    handleSearch(event) {
        this.dispatchEvent(
            new CustomEvent('search', { detail: { value: event.detail.value } })
        );
    }
}
