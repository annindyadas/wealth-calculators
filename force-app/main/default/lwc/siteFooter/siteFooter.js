/**
 * siteFooter - multi-column footer on the deep neutral surface token, plus a
 * bottom bar with copyright and the financial disclaimer.
 *
 * Every column's links and all copy are @api strings, so legal can reword the
 * disclaimer and marketing can re-point links from Experience Builder without a
 * deploy. Link lists are "Label|url, Label|url" strings (an array also works
 * when the component is composed in code). The copyright year is computed at
 * render time, so it never goes stale.
 */
import { LightningElement, api } from 'lwc';

const DEFAULT_DISCLAIMER =
    'Calculations are illustrative only and do not constitute financial advice.';

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

function withKeys(links) {
    return links.map((link, index) => ({
        ...link,
        key: `${link.label}-${index}`
    }));
}

function normalizePathSegment(value) {
    return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}

function toDynamicDomainUrl(url, sitePath, options = {}) {
    const { forceInternal = false, includeSitePath = true } = options;
    const raw = (url || '').trim();
    if (!raw) {
        return '';
    }

    const isWebUrl = /^https?:\/\//i.test(raw);
    if (!forceInternal && (isWebUrl || /^mailto:/i.test(raw) || /^tel:/i.test(raw))) {
        return raw;
    }

    if (typeof window === 'undefined' || !window.location?.origin) {
        return raw;
    }

    let normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
    if (isWebUrl) {
        try {
            const parsed = new URL(raw);
            normalizedPath = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
        } catch {
            normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
        }
    }

    const normalizedSitePath = normalizePathSegment(sitePath);
    const sitePrefix = normalizedSitePath ? `/${normalizedSitePath}` : '';

    if (!includeSitePath || !sitePrefix) {
        return `${window.location.origin}${normalizedPath}`;
    }

    if (
        normalizedPath === sitePrefix ||
        normalizedPath.startsWith(`${sitePrefix}/`)
    ) {
        return `${window.location.origin}${normalizedPath}`;
    }

    return `${window.location.origin}${sitePrefix}${normalizedPath}`;
}

export default class SiteFooter extends LightningElement {
    @api brandName = 'Finance';
    @api sitePath = 'finance';

    @api aboutHeading = 'About';
    @api aboutText =
        'A suite of financial calculators for modelling investments, loans and retirement scenarios. Everything is computed in your browser.';

    @api calculatorsHeading = 'Calculators';
    @api calculatorLinks = 'Compare Health Insurance Plan|/compareplan';

    @api legalHeading = 'Legal';
    @api legalLinks =
        'Disclaimer|/legal/disclaimer, Privacy Notice|/legal/privacy, Terms of Use|/legal/terms';

    @api contactHeading = 'Contact';
    @api contactLinks = 'About Me|/portfolio/';

    /** Editable by legal without a deploy. */
    @api disclaimer = DEFAULT_DISCLAIMER;

    get calculatorItems() {
        return withKeys(parseLinkList(this.calculatorLinks)).map((link) => ({
            ...link,
            url: toDynamicDomainUrl(link.url, this.sitePath, {
                forceInternal: true,
                includeSitePath: false
            })
        }));
    }

    get legalItems() {
        return withKeys(parseLinkList(this.legalLinks)).map((link) => ({
            ...link,
            url: toDynamicDomainUrl(link.url, this.sitePath, {
                forceInternal: true
            })
        }));
    }

    get contactItems() {
        return withKeys(parseLinkList(this.contactLinks)).map((link) => ({
            ...link,
            url: toDynamicDomainUrl(link.url, this.sitePath, {
                forceInternal: true,
                includeSitePath: false
            })
        }));
    }

    get copyright() {
        return `© ${new Date().getFullYear()} ${this.brandName}. All rights reserved.`;
    }
}
