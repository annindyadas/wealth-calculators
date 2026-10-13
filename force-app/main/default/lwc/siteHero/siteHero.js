/**
 * siteHero - the flat accent-tinted band at the top of a landing page.
 *
 * All copy is @api driven, so nothing is hardcoded: heading, subheading, CTA
 * label and URL, plus an optional "featured calculator" card (name, icon and
 * URL) that only renders when a name and URL are both supplied. The heading is
 * the page's single h1, so do not place this on a page that also uses
 * c/calculatorPageLayout, which owns the h1 there.
 */
import { LightningElement, api } from 'lwc';

export default class SiteHero extends LightningElement {
    @api heading = 'Model your money before you commit to it';
    @api subheading =
        'A suite of calculators for investing, borrowing and retirement planning. No sign-in, no data leaves your browser.';
    // @api ctaLabel = 'Browse calculators';
    // @api ctaUrl = '/calculators';

    // @api featuredName;
    // @api featuredIconName = 'utility:trending';
    // @api featuredUrl;
    // @api featuredEyebrow = 'Featured calculator';

    // get hasCta() {
    //     return Boolean(this.ctaLabel && this.ctaUrl);
    // }

    // get hasFeatured() {
    //     return Boolean(this.featuredName && this.featuredUrl);
    // }
}
