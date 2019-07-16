'use strict';

const _ = require(`lodash`);
const Field = require(`../Field`);

class NumberField extends Field {
    /**
     * @param value {number | undefined | null}
     */
    set value(value) {
        if (!_.isNil(value) && !_.isNumber(value)) {
            throw new Error(`Value must be a number!`);
        }

        super.value = value;
    }

    /**
     * @returns {number | undefined | null}
     */
    get value() {
        return super.value;
    }

    validate() {
        super.validate();
    }
}

module.exports = NumberField;
