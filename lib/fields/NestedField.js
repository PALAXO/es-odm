'use strict';

const _ = require(`lodash`);
const Field = require(`../Field`);

class NestedField extends Field {
    /**
     * @param options {Object}
     * @param data {Object}
     */
    constructor(options, data) {
        if (!_.isObject(options)) {
            throw new Error(`Data must be an object!`);
        }

        //options contain undefined Fields -> save as data
        super({}, options);
        //replace data with real one
        this.value = data;
    }

    /**
     * @param value {Object}
     */
    set value(value) {
        if (_.isNil(value)) {
            return;
        }

        if (!_.isObject(value)) {
            throw new Error(`Value must be an object!`);
        }

        for (const [key, val] of Object.entries(value)) {
            if (val instanceof Field) {
                this[key] = val;
            } else {
                this[key].value = val;
            }
        }
    }

    /**
     * @returns {Object}
     */
    get value() {
        const returnValue = {};
        for (const [key, val] of Object.entries(this)) {
            if (val instanceof Field) {
                returnValue[key] = val.value;
            }
        }

        return returnValue;
    }

    validate() {
        for (const val of Object.values(this)) {
            if (val instanceof Field) {
                val.validate();
            }
        }
    }
}

module.exports = NestedField;
