/**
 * calculatorPageLayout - outer page chrome for a single calculator page:
 * breadcrumb, h1, a slot for the calculator, and a related-calculators strip.
 *
 * It deliberately knows nothing about any calculator's internals. The calculator
 * goes in the default slot and keeps its own inputs-versus-results layout; this
 * component only supplies the title, spacing and footer strip. Because
 * Experience Builder cannot fill a slot, c/sipLumpsumCalculator is the slot's
 * fallback content - set "Hide Default Calculator" on pages for other
 * calculators. Breadcrumbs and related links accept either an array (when
 * composed in code) or a "Label|url, Label|url" string, which is what
 * Experience Builder can pass.
 */
import { LightningElement, api } from 'lwc';

/** Parses "Label|url, Label|url" into [{ label, url }]. */
function parseLinkList(value) {
    if (Array.isArray(value)) {
        return value
            .filter((item) => item && (item.name || item.label))
            .map((item) => ({
                label: item.label || item.name,
                url: item.url || item.targetUrl || ''
            }));
    }
    if (typeof value !== 'string' || !value.trim()) {
        return [];
    }
    return value
        .split(',')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
            const [label, url = ''] = pair.split('|').map((part) => part.trim());
            return { label, url };
        })
        .filter((link) => link.label);
}

export default class CalculatorPageLayout extends LightningElement {
    /** The page's single h1. */
    @api pageTitle = 'Calculator';
    @api pageSummary;

    /** Breadcrumb trail, e.g. "Home|/, Calculators|/calculators". */
    @api breadcrumbs = 'Home|/, Calculators|/calculators';

    /** Related calculators, e.g. "Goal Planner|/calculators/goal-planner". */
    @api relatedCalculators = '';
    @api relatedHeading = 'Related calculators';

    /**
     * Suppresses the fallback SIP & Lumpsum calculator, for pages that host a
     * different calculator. Inverted rather than "show", because LWC does not
     * allow a public boolean to default to true.
     */
    @api hideDefaultCalculator = false;

    get showDefaultCalculator() {
        const value = this.hideDefaultCalculator;
        const hidden =
            typeof value === 'string'
                ? value.toLowerCase() === 'true'
                : Boolean(value);
        return !hidden;
    }

    get breadcrumbLinks() {
        return parseLinkList(this.breadcrumbs).map((link, index) => ({
            ...link,
            key: `${link.label}-${index}`
        }));
    }

    get hasBreadcrumbs() {
        return this.breadcrumbLinks.length > 0;
    }

    get relatedLinks() {
        return parseLinkList(this.relatedCalculators).map((link, index) => ({
            ...link,
            key: `${link.label}-${index}`
        }));
    }

    get hasRelated() {
        return this.relatedLinks.length > 0;
    }

    get hasSummary() {
        return Boolean(this.pageSummary);
    }
}
