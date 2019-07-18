'use strict';

const _ = require(`lodash`);
const Joi = require(`@hapi/joi`);
const Field = require(`../Field`);

class NestedField extends Field {
    /**
     * @param data {Object}
     * @param content {Object}
     * @param schema {Object}
     */
    constructor(data, content, schema = Joi.any()) {
        if (!_.isObject(content)) {
            throw new Error(`Content must be an object!`);
        }

        super(data, schema, `any`);
        this.__content = content;
    }

    validate() {
        //Two steps
        //1. build complete field tree and call validate on childs -> ensures correct data types
        //2. call validate on user object -> Joi validation

        const myData = this.value;
        const errors = {};
        let isError = false;

        //1st step
        if (!_.isUndefined(myData)) {
            for (const [key, val] of Object.entries(myData)) {

                let Field = this.__content[key];
                let myContent = void 0;
                if (_.isObject(Field) && !_.isFunction(Field)) {
                    myContent = Field.content;
                    Field = Field.type;
                }

                if (_.isUndefined(Field)) {
                    isError = true;
                    errors[key] = `Unexpected field`;
                } else {
                    let field = void 0;
                    if (_.isNil(myContent)) {
                        field = new Field(val);
                    } else {
                        field = new Field(val, myContent);
                    }

                    try {
                        field.validate();
                    } catch (err) {
                        isError = true;
                        errors[key] = err;
                    }
                }
            }
        }

        if (isError) {
            throw Error(errors);
        }

        //2nd step
        try {
            super.validate();
        } catch (err) {
            isError = true;
            errors.push(err);
        }

        if (isError) {
            throw Error(errors);
        }
    }
}

module.exports = NestedField;
