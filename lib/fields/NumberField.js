'use strict';

const Joi = require(`@hapi/joi`);
const Field = require(`../Field`);

class NumberField extends Field {
    /**
     * @param data {void | null | number}
     * @param schema {Object}
     */
    constructor(data, schema = Joi.number()) {
        super(data, schema, `number`);
    }
}

module.exports = NumberField;
