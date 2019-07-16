'use strict';

const Field = require(`./Field`);

class BaseModel {
    constructor() {

        //???
        //this rewrites class getters/setters
        // - no need to call .value for value get/set
        // - brakes .validate(), fix needed
        const handler = {
            get: function (target, name) {
                if (target[name] instanceof Field) {
                    return target[name].value;
                } else {
                    return target[name];
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
        //return scope;
    }
}

module.exports = BaseModel;
