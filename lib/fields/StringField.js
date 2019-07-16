'use strict';

const _ = require(`lodash`);
const Field = require(`../Field`);

class StringField extends Field {
    /**
     * @param value {string | undefined | null}
     */
    set value(value) {
        if (!_.isNil(value) && !_.isString(value)) {
            throw new Error(`Value must be a string!`);
        }

        super.value = value;
    }

    /**
     * @returns {string | undefined | null}
     */
    get value() {
        return super.value;
    }

    validate() {
        super.validate();
    }
}

module.exports = StringField;
