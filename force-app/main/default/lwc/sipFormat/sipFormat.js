/**
 * sipFormat - service module (no UI). Currency display rules for the calculator.
 *
 * Three currencies, each with its own real-world numbering convention:
 *   USD  $1,234,567      symbol first, comma grouping, short units K / M / B
 *   INR  ₹12,34,567      symbol first, lakh/crore grouping, short units K / L / Cr
 *   EUR  1.234.567 €     symbol last, dot grouping, short units K / Mio / Mrd
 * resolveCurrency() accepts a code ('USD') or a symbol ('$') and always returns
 * a currency; formatCurrency() rounds to whole units for display only.
 */

const CURRENCIES = [
    {
        code: 'USD',
        symbol: '$',
        label: '$ USD',
        locale: 'en-US',
        symbolAfter: false,
        units: [
            { limit: 1000000000, suffix: 'B' },
            { limit: 1000000, suffix: 'M' },
            { limit: 1000, suffix: 'K' }
        ]
    },
    {
        code: 'INR',
        symbol: '₹',
        label: '₹ INR',
        locale: 'en-IN',
        symbolAfter: false,
        units: [
            { limit: 10000000, suffix: 'Cr' },
            { limit: 100000, suffix: 'L' },
            { limit: 1000, suffix: 'K' }
        ]
    },
    {
        code: 'EUR',
        symbol: '€',
        label: '€ EUR',
        locale: 'de-DE',
        symbolAfter: true,
        units: [
            { limit: 1000000000, suffix: 'Mrd' },
            { limit: 1000000, suffix: 'Mio' },
            { limit: 1000, suffix: 'K' }
        ]
    }
];

export const DEFAULT_CURRENCY_CODE = 'USD';

/** Options for a lightning-combobox currency picker. */
export const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({
    label: currency.label,
    value: currency.code
}));

/** Accepts 'USD' / '$' / undefined and always returns a currency definition. */
export function resolveCurrency(codeOrSymbol) {
    return (
        CURRENCIES.find(
            (currency) =>
                currency.code === codeOrSymbol ||
                currency.symbol === codeOrSymbol
        ) || CURRENCIES.find((currency) => currency.code === DEFAULT_CURRENCY_CODE)
    );
}

export function currencyCodeFor(codeOrSymbol) {
    return resolveCurrency(codeOrSymbol).code;
}

export function currencyLocaleFor(codeOrSymbol) {
    return resolveCurrency(codeOrSymbol).locale;
}

function toNumber(value) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function attachSymbol(currency, text) {
    return currency.symbolAfter
        ? `${text} ${currency.symbol}`
        : `${currency.symbol}${text}`;
}

function group(value, currency, maxDecimals) {
    return new Intl.NumberFormat(currency.locale, {
        maximumFractionDigits: maxDecimals
    }).format(value);
}

/** Whole-unit amount. e.g. 1234567 -> "$1,234,567" / "₹12,34,567" / "1.234.567 €" */
export function formatCurrency(value, codeOrSymbol) {
    const currency = resolveCurrency(codeOrSymbol);
    const amount = toNumber(value);
    const sign = amount < 0 ? '-' : '';
    const absoluteGrouped = group(Math.round(Math.abs(amount)), currency, 0);
    return `${sign}${attachSymbol(currency, absoluteGrouped)}`;
}

/** Short form for chart axis labels. e.g. "$1.2M" / "₹12.35 L" / "1,2 Mio €" */
export function formatCompactCurrency(value, codeOrSymbol) {
    const currency = resolveCurrency(codeOrSymbol);
    const amount = toNumber(value);
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    const unit = currency.units.find((candidate) => abs >= candidate.limit);

    if (!unit) {
        return `${sign}${attachSymbol(currency, group(Math.round(abs), currency, 0))}`;
    }
    const scaled = abs / unit.limit;
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    // Multi-letter units read better with a space: "12.35 L", "1,2 Mio".
    const separator = unit.suffix.length > 1 ? ' ' : '';
    const shortText = `${group(scaled, currency, decimals)}${separator}${unit.suffix}`;
    return `${sign}${attachSymbol(currency, shortText)}`;
}

export function formatNumberByCurrency(value, codeOrSymbol, maxDecimals = 2) {
    const currency = resolveCurrency(codeOrSymbol);
    return new Intl.NumberFormat(currency.locale, {
        maximumFractionDigits: maxDecimals,
        minimumFractionDigits: 0,
        useGrouping: true
    }).format(toNumber(value));
}

export function parseNumberByCurrency(inputValue, codeOrSymbol) {
    const currency = resolveCurrency(codeOrSymbol);
    const raw = String(inputValue ?? '').trim();
    if (!raw) {
        return 0;
    }

    const parts = new Intl.NumberFormat(currency.locale).formatToParts(12345.6);
    const groupSeparator =
        parts.find((part) => part.type === 'group')?.value || ',';
    const decimalSeparator =
        parts.find((part) => part.type === 'decimal')?.value || '.';

    const escapedGroup = groupSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedDecimal = decimalSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let normalized = raw
        .replace(new RegExp(escapedGroup, 'g'), '')
        .replace(new RegExp(escapedDecimal, 'g'), '.')
        .replace(/[\s\u00A0]/g, '')
        .replace(currency.symbol, '')
        .replace(/[^0-9.-]/g, '');

    const minusCount = (normalized.match(/-/g) || []).length;
    if (minusCount > 1) {
        normalized = normalized.replace(/-/g, '');
    }

    const firstDot = normalized.indexOf('.');
    if (firstDot !== -1) {
        normalized =
            normalized.slice(0, firstDot + 1) +
            normalized.slice(firstDot + 1).replace(/\./g, '');
    }

    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}
