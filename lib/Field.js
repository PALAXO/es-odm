'use strict';

const Joi = require(`@hapi/joi`);
const nconf = require(`nconf`);
const validatorConfig = nconf.get(`joi:validatorConfig`);

class Field {
    /**
     * @param data {*}
     * @param schema {*}
     * @param schemaType {*}
     */
    constructor(data, schema = Joi.any(), schemaType = `any`) {
        if (schema.schemaType !== schemaType) {
            throw new Error(`Schema type must be ${schemaType}!`);
        }

        this.__schema = schema;
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
        const value = Joi.validate(this.value, this.__schema, validatorConfig);
        if (value.error) {
            throw Error(value.error);
        } else {
            this.value = value;
        }
    }
}

module.exports = Field;
