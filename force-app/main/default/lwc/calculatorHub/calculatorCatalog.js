/**
 * calculatorCatalog - the one list of calculators on the site.
 *
 * Adding a calculator means appending one entry here. Nothing else changes:
 * siteHeader, the cards and the filter chips all derive from this list.
 *
 * Swapping to a Custom Metadata Type or Custom Object later: keep the shape of
 * each entry identical (that shape is what calculatorCard consumes) and replace
 * getCalculators() with an Apex/wire call that maps rows onto it. The children
 * take plain properties, so their API does not change.
 *
 * targetUrl values are site-relative paths. REPLACE_ME: point these at the real
 * page routes once the Experience Builder pages exist.
 */

const CALCULATORS = [
    {
        id: 'sip-lumpsum',
        name: 'SIP & Lumpsum Calculator',
        description:
            'Project a monthly SIP, a one-time lumpsum, or both together, with optional annual step-up.',
        category: 'Investing',
        iconName: 'utility:trending',
        targetUrl: '/sip-lumpsum',
        isEnabled: true
    },
    {
        id: 'bucket-laddering',
        name: 'Bucket Laddering Planner',
        description:
            'Split a corpus across short, medium and long horizon buckets and see how each ladder matures.',
        category: 'Retirement',
        iconName: 'utility:layers',
        targetUrl: '/bucket-laddering',
        isEnabled: true
    },
    {
        id: 'goal-planner',
        name: 'Goal Planner',
        description:
            'Work backwards from a target amount and date to the monthly contribution it needs.',
        category: 'Planning',
        iconName: 'utility:goal',
        targetUrl: '/goal-planner',
        isEnabled: false
    },
    {
        id: 'retirement-corpus',
        name: 'Retirement Corpus',
        description:
            'Estimate the corpus required to fund your retirement, adjusted for inflation.',
        category: 'Retirement',
        iconName: 'utility:clock',
        targetUrl: '/retirement-corpus',
        isEnabled: false
    },
    {
        id: 'emi',
        name: 'Loan EMI Calculator',
        description:
            'Work out the monthly instalment, total interest and amortisation on a loan.',
        category: 'Borrowing',
        iconName: 'utility:money',
        targetUrl: '/emi',
        isEnabled: false
    },
    {
        id: 'inflation-impact',
        name: 'Inflation Impact',
        description:
            'See what a future amount is worth in today’s money at a chosen inflation rate.',
        category: 'Planning',
        iconName: 'utility:down',
        targetUrl: '/inflation-impact',
        isEnabled: false
    }
];

/** All calculators, in display order. */
export function getCalculators() {
    return CALCULATORS.map((entry) => ({ ...entry }));
}

/** Distinct categories in first-seen order, for the filter chips. */
export function getCategories() {
    return [...new Set(CALCULATORS.map((entry) => entry.category))];
}

/**
 * Sibling calculators for the "related" strip on a calculator page.
 * @param {string} currentId id to exclude
 * @param {number} [limit=4] how many to return
 */
export function getRelatedCalculators(currentId, limit = 4) {
    const current = CALCULATORS.find((entry) => entry.id === currentId);
    const sameCategory = CALCULATORS.filter(
        (entry) =>
            entry.id !== currentId &&
            current &&
            entry.category === current.category
    );
    const others = CALCULATORS.filter(
        (entry) => entry.id !== currentId && !sameCategory.includes(entry)
    );
    return [...sameCategory, ...others]
        .slice(0, limit)
        .map((entry) => ({ name: entry.name, targetUrl: entry.targetUrl }));
}
