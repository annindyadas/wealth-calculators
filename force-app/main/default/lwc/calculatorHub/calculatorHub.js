/**
 * calculatorHub - the grid of every calculator on the site, with search and
 * category filtering. This is the scalability layer.
 *
 * The list itself lives in ./calculatorCatalog.js; this component only filters
 * and lays it out. It composes three children: c/calculatorSearchBar (fires
 * 'search'), c/categoryFilterBar (fires 'categoryselect') and one
 * c/calculatorCard per visible entry. Search text and the selected category
 * filter the same list, and an empty state shows when nothing matches.
 */
import { LightningElement, api, track } from 'lwc';
import { getCalculators, getCategories } from './calculatorCatalog';

const ALL_CATEGORIES = 'All';

export default class CalculatorHub extends LightningElement {
    // @api heading = 'Calculators';
    @api subheading =
        'Pick a calculator to model a scenario. Everything runs in your browser.';
    @api searchPlaceholder = 'Search calculators';

    @track searchTerm = '';
    @track selectedCategory = ALL_CATEGORIES;

    catalog = getCalculators();

    get categories() {
        return [ALL_CATEGORIES, ...getCategories()];
    }

    /** Search text and category chip narrow the same list. */
    get visibleCalculators() {
        const term = this.searchTerm.trim().toLowerCase();
        return this.catalog.filter((entry) => {
            const matchesCategory =
                this.selectedCategory === ALL_CATEGORIES ||
                entry.category === this.selectedCategory;
            const matchesTerm =
                !term ||
                entry.name.toLowerCase().includes(term) ||
                entry.description.toLowerCase().includes(term) ||
                entry.category.toLowerCase().includes(term);
            return matchesCategory && matchesTerm;
        });
    }

    get hasResults() {
        return this.visibleCalculators.length > 0;
    }

    get resultCountLabel() {
        const count = this.visibleCalculators.length;
        return `${count} ${count === 1 ? 'calculator' : 'calculators'}`;
    }

    get emptyStateMessage() {
        return this.searchTerm
            ? `No calculators match "${this.searchTerm}".`
            : 'No calculators in this category yet.';
    }

    handleSearch(event) {
        this.searchTerm = event.detail.value || '';
    }

    handleCategorySelect(event) {
        this.selectedCategory = event.detail.category || ALL_CATEGORIES;
    }

    handleClearFilters() {
        this.searchTerm = '';
        this.selectedCategory = ALL_CATEGORIES;
    }
}
