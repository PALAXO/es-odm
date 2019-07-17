'use strict';

const Field = require(`./Field`);
const NestedField = require(`./fields/NestedField`);

class BaseModel {
    constructor() {
        const handler = {
            get: function (target, name) {
                if (target[name] instanceof Field) {
                    if (target[name] instanceof NestedField) {
                        const myObj = target[name];
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
                    if (target[name] instanceof NestedField) {
                        return true;
                    } else {
                        return target[name].value = value;
                    }
                } else {
                    return Reflect.set(...arguments);
                }
            }
        };
        const scope = new Proxy(this, handler);
        this.__originalThis = this;
        return scope;
    }

    validate() {
        for (const [key, val] of Object.entries(this.__originalThis)) {
            if (val instanceof Field) {
                try {
                    val.validate();
                } catch (err) {
                    throw new Error(`${key}: ${err}`);
                }
            }
        }
    }
}

module.exports = BaseModel;
