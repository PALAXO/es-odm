'use strict';

const Joi = require(`@hapi/joi`);
const Field = require(`../Field`);

class StringField extends Field {
    /**
     * @param data {void | null | string}
     * @param schema {Object}
     */
    constructor(data, schema = Joi.string()) {
        super(data, schema, `string`);
    }
}

module.exports = StringField;
