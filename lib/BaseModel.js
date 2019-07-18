'use strict';

const util = require(`util`);
const Field = require(`./Field`);
const NestedField = require(`./fields/NestedField`);
const ArrayField = require(`./fields/ArrayField`);

class BaseModel {
    constructor() {
        const handler = {
            get: function (target, name) {
                if (target[name] instanceof Field) {
                    if (target[name] instanceof NestedField || target[name] instanceof ArrayField) {
                        const myObj = target[name].value;
                        return new Proxy(myObj, handler);
                    } else {
                        return target[name].value;
                    }
                } else {
                    return Reflect.get(...arguments);
                }
            },
            set: function (target, name, value) {
                if (target[name] instanceof Field) {
                    return target[name].value = value;
                } else {
                    return Reflect.set(...arguments);
                }
            }
        };
        const scope = new Proxy(this, handler);

        Object.defineProperty(this, `__originalThis`, {
            value: this,
            enumerable: false,
            writable: true
        });

        return scope;
    }

    validate() {
        const errors = {};
        let isError = false;

        for (const [key, val] of Object.entries(this.__originalThis)) {
            if (val instanceof Field) {
                try {
                    val.validate();
                } catch (err) {
                    isError = true;
                    errors[key] = err;
                }
            }
        }

        if (isError) {
            throw Error(errors);
        }
    }

    [util.inspect.custom]() {
        const result = {};
        for (const [key, val] of Object.entries(this)) {
            result[key] = val;
        }
        return result;
    }
}

module.exports = BaseModel;
