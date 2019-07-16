'use strict';

const _ = require(`lodash`);

class Field {
    /**
     * @param options {Object}
     * @param data {*}
     */
    constructor(options = {}, data) {
        if (!_.isObject(options)) {
            throw new Error(`Options must be an object!`);
        }

        this.options = options;
        this.value = data;
    }

    /**
     * @param value {*}
     */
    set value(value) {
        this.__value = value;
    }

    /**
     * @returns {*}
     */
    get value() {
        return this.__value;
    }

    validate() {
        for (const [key, value] of Object.entries(this.options)) {
            switch (key) {
                case `required`: {
                    if (value && _.isNil(this.value)) {
                        throw new Error(`Value is required!`);
                    }

                    break;
                }
            }
        }
    }
}

module.exports = Field;
