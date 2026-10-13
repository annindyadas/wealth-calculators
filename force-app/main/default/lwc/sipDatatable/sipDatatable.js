/**
 * sipDatatable - lightning-datatable plus one extra column type.
 *
 * Standard datatables cannot render a badge in a cell, so this subclass
 * registers a "stepUpBadge" custom type whose markup lives in stepUpBadge.html
 * (an up-right arrow plus the percentage). Only c/sipYearlyBreakdown uses
 * it. There is deliberately no sipDatatable.html: the base class supplies the
 * table template, and this bundle only adds the cell type.
 */
import LightningDatatable from 'lightning/datatable';
import stepUpBadge from './stepUpBadge.html';

export default class SipDatatable extends LightningDatatable {
    static customTypes = {
        stepUpBadge: {
            template: stepUpBadge,
            standardCellLayout: true,
            typeAttributes: ['assistiveLabel']
        }
    };
}
