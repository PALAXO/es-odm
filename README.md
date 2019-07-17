# es-odm

- Some notes, might change...

### Fields

#### Primitive fields

 - NumberField, StringField, BooleanField, ...
 - Usage: `new NumberField(data.number, ?Joi.number(...) );`
 
#### Special fields

 - ArrayField: `new ArrayField(data.array, { type: StringField }, ?Joi.array(...) );`
 
 - NestedField: `new NestedField(data.object, { a: BooleanField, b: NumberField }, ?Joi.any(...) )`
 
 
#### Usage example - nesting

```
const object = new NestedField(data.object, {
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
}, Joi.any(...) );
```
 
 
### BaseModel
