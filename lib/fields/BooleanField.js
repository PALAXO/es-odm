'use strict';

const Joi = require(`@hapi/joi`);
const Field = require(`../Field`);

class BooleanField extends Field {
    /**
     * @param data {void | null | boolean}
     * @param schema {Object}
     */
    constructor(data, schema = Joi.boolean()) {
        super(data, schema, `boolean`);
    }
}

module.exports = BooleanField;
