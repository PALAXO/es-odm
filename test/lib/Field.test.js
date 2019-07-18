'use strict';

require(`../bootstrapTests`);

const BaseModel = require(`../../lib/BaseModel`);
const StringField = require(`../../lib/fields/StringField`);
const BooleanField = require(`../../lib/fields/BooleanField`);
const NumberField = require(`../../lib/fields/NumberField`);
const NestedField = require(`../../lib/fields/NestedField`);
const ArrayField = require(`../../lib/fields/ArrayField`);

//TODO - not complete
describe(`Field`, function () {
    this.timeout(testTimeout);

    describe(`Field structure`, () => {
        const UserClass = class User extends BaseModel {
            constructor(data = {}) {
                super();

                this.name = new StringField(data.name);

                this.configuration = new NestedField(
                    data.configuration,
                    {
                        x: BooleanField,
                        y: NumberField
                    }
                );

                this.object = new NestedField(data.object, {
                    name: StringField,
                    id: NumberField,
                    phones: {
                        type: ArrayField, content: {
                            type: NestedField, content: {
                                mobile: BooleanField,
                                number: StringField
                            }
                        }
                    },
                    preferences: {
                        type: NestedField, content: {
                            language: StringField,
                            flags: {
                                type: ArrayField, content: {
                                    type: BooleanField
                                }
                            }
                        }
                    }
                });
            }
        };

        it(`creates correct object structure`, () => {
            const testObject = {
                name: `unman`,
                configuration: { x: true, y: 5 },
                object: {
                    name: `objectName`,
                    //id: undefined
                    phones: [{
                        mobile: false,
                        number: `123456789`
                    }, {
                        mobile: true,
                        number: `987654321`
                    }],
                    preferences: {
                        language: `en`,
                        flags: [true, false, false, true]
                    }
                }
            };

            const user = new UserClass(testObject);

            expect(user).to.deep.equal(testObject);
            expect(user.name).to.equal(testObject.name);

            expect(user.configuration).to.deep.equal(testObject.configuration);
            expect(user.configuration.x).to.equal(testObject.configuration.x);
            expect(user.configuration.y).to.equal(testObject.configuration.y);

            expect(user.object.name).to.equal(testObject.object.name);
            expect(user.object.id).to.equal(testObject.object.id);

            expect(user.object.phones).to.deep.equal(testObject.object.phones);
            expect(user.object.phones.length).to.equal(testObject.object.phones.length);
            expect(user.object.phones[0].mobile).to.equal(testObject.object.phones[0].mobile);
            expect(user.object.phones[0].number).to.equal(testObject.object.phones[0].number);
            expect(user.object.phones[1].mobile).to.equal(testObject.object.phones[1].mobile);
            expect(user.object.phones[1].number).to.equal(testObject.object.phones[1].number);

            expect(user.object.preferences.language).to.equal(testObject.object.preferences.language);

            expect(user.object.preferences.flags).to.deep.equal(testObject.object.preferences.flags);
            expect(user.object.preferences.flags.length).to.equal(testObject.object.preferences.flags.length);
            expect(user.object.preferences.flags[0]).to.equal(testObject.object.preferences.flags[0]);
            expect(user.object.preferences.flags[1]).to.equal(testObject.object.preferences.flags[1]);
            expect(user.object.preferences.flags[2]).to.equal(testObject.object.preferences.flags[2]);
            expect(user.object.preferences.flags[3]).to.equal(testObject.object.preferences.flags[3]);
        });

        it(`ensures object changes are propagated to instance`, () => {
            const testObject = {
                name: `unman`,
                configuration: { x: true, y: 5 },
                object: {
                    name: `objectName`,
                    //id: undefined
                    phones: [{
                        mobile: false,
                        number: `123456789`
                    }, {
                        mobile: true,
                        number: `987654321`
                    }],
                    preferences: {
                        language: `en`,
                        flags: [true, false, false, true]
                    }
                }
            };

            const user = new UserClass(testObject);

            testObject.name = user.name = `another`;
            testObject.object.name = `name`;
            testObject.object.id =  885;
            testObject.object.phones[0] = {
                mobile: true,
                number: `7741`
            };
            testObject.object.preferences.flags = [false, false];

            expect(user).to.deep.equal(testObject);
            expect(user.name).to.equal(testObject.name);

            expect(user.configuration).to.deep.equal(testObject.configuration);
            expect(user.configuration.x).to.equal(testObject.configuration.x);
            expect(user.configuration.y).to.equal(testObject.configuration.y);

            expect(user.object.name).to.equal(testObject.object.name);
            expect(user.object.id).to.equal(testObject.object.id);

            expect(user.object.phones).to.deep.equal(testObject.object.phones);
            expect(user.object.phones.length).to.equal(testObject.object.phones.length);
            expect(user.object.phones[0].mobile).to.equal(testObject.object.phones[0].mobile);
            expect(user.object.phones[0].number).to.equal(testObject.object.phones[0].number);
            expect(user.object.phones[1].mobile).to.equal(testObject.object.phones[1].mobile);
            expect(user.object.phones[1].number).to.equal(testObject.object.phones[1].number);

            expect(user.object.preferences.language).to.equal(testObject.object.preferences.language);

            expect(user.object.preferences.flags).to.deep.equal(testObject.object.preferences.flags);
            expect(user.object.preferences.flags.length).to.equal(testObject.object.preferences.flags.length);
            expect(user.object.preferences.flags[0]).to.equal(testObject.object.preferences.flags[0]);
            expect(user.object.preferences.flags[1]).to.equal(testObject.object.preferences.flags[1]);
            expect(user.object.preferences.flags[2]).to.equal(testObject.object.preferences.flags[2]);
            expect(user.object.preferences.flags[3]).to.equal(testObject.object.preferences.flags[3]);
        });
    });

    describe(`Field validation`, () => {
        const UserClass = class User extends BaseModel {
            constructor(data = {}) {
                super();

                this.name = new StringField(data.name);

                this.configuration = new NestedField(
                    data.configuration,
                    {
                        x: BooleanField,
                        y: NumberField
                    }
                );

                this.object = new NestedField(data.object, {
                    name: StringField,
                    id: NumberField,
                    phones: {
                        type: ArrayField, content: {
                            type: NestedField, content: {
                                mobile: BooleanField,
                                number: StringField
                            }
                        }
                    },
                    preferences: {
                        type: NestedField, content: {
                            language: StringField,
                            flags: {
                                type: ArrayField, content: {
                                    type: BooleanField
                                }
                            }
                        }
                    }
                });
            }
        };

        it.skip(`validates structure`, () => {
            const testObject = {
                name: 15,
                configuration: { x: true, y: 5 },
                object: {
                    name: `objectName`,
                    //id: undefined
                    phones: [{
                        mobile: false,
                        number: `123456789`
                    }, {
                        mobile: true,
                        number: `987654321`
                    }],
                    preferences: {
                        language: `en`,
                        flags: [true, false, false, true]
                    }
                }
            };

            const user = new UserClass(testObject);
            try {
                user.validate();
            } catch (err) {
                console.log(err.message);
            }
        });
    });
});
