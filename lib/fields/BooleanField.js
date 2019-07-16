'use strict';

const _ = require(`lodash`);
const Field = require(`../Field`);

class BooleanField extends Field {
    /**
     * @param value {boolean | undefined | null}
     */
    set value(value) {
        if (!_.isNil(value) && !_.isBoolean(value)) {
            throw new Error(`Value must be a boolean!`);
        }

        super.value = value;
    }

    /**
     * @returns {boolean}
     */
    get value() {
        return !!super.value;
    }

    validate() {
        super.validate();
    }
}

module.exports = BooleanField;
