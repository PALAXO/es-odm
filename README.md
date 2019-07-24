# es-odm

## Current state:

### Data type abstraction

 - As discussed, this has been completely discarded
 
 - No Fields, only Joi (and maybe manually written jsdoc)

### ODM

 - Draft, might change...

 - To get class constructor, call `library(index, ?schema, ?type)`:
   - index - absolutely necessary, it must be specified
   - schema - may be undefined or Joi object, it is there because of validations
   - type - Serves as ES type and document type, default is `*`
     - Specify it for all types, but `documents`!
     - For `documents` use default value!
       - Suitable for searching in all documents
       - When working with concrete document type, use `.type(newType)`, see bellow
 
 
 - Class can be next modified using:
   - `in(tenant)` - Changes tenant from `default` to given value, returns class copy
   - `type(type)` - Sets type of document - just for Circularo documents
     - use it when working with concrete document type
     - replaces type from `library(index, schema, type)`
       
       
 - How types work:
   - if type is specified in `library(index, schema, type)`, is uses indexes like `<tenant>_<index>`
   - if not, it uses index `<tenant>_<index>_*`
     - only suitable for searching
   - once `.type(type)` is called, it uses indexes like `<tenant>_<index>_<type>`
       
       
 - Custom functions:
   - They can be defined in class level
   - They have access to class static functions and defined properties 
     - Use `this.staticFunction()`
   - They are copied to class clones
   ```
    const MyClass = library(`myIndex`);
    MyClass.showType = function () {
        return this._type;
    }
    
    const TypeClass = MyClass.type(`myType`);
    
    MyClass.showType;       //returns `*`
    TypeClass.showType;     //returns `myType`
    
    ```
       
       
 - Expected usage:
 
    ```
    const library = require(`es-odm`);  //this library, find better name
    
    const index = `users`;
    const userSchema = Joi.any(...);
    
    const UserClass = library(index, userSchema);
    //Class is prepared, may be instantiated, tenant is `default`
    
    const MyTenantUserClass = UserClass.in(`myTenant`);
    //Tenant is `myTenant`
    
    const data = {...};
    const userInstance = new MyTenantUserClass(data, `myId`);
    userInstance.myProperty = 5;
    
    await userInstance.save();
    ```
   
    
#### functions / methods


 - `static async _fullIndex()` and `async _fullIndex()`
   - Returns class full index, usable for ES queries
   - It consist of tenant, index and optionally from type
     - Exact rule is described above

 - `static async _search(body, ?from, ?size, ?scroll)`
   - TODO
   
 - `static async findAll()`
   - TODO
   
 - `static async get(ids)`
   - TODO
   
 - `static async find(ids)`
   - TODO
   
 - `static async delete(ids)`
   - TODO
   
 - `async save(?force)`
   - saves or re-saves instance
   - it uses specified `_id` or generates new one if not specified
     - it uses ES `index()` function
   - `force` - disables validation
   
 - `async reload()`
   - reloads instance data from ES
     - all user specified data are discarded
   - `_id` must be specified and entry must exist in ES
     
 - `async validate()`
   - Validates instance
     - if OK, returns validated object (deep copy)
     - otherwise throws an error
    
 
 - ElasticSearch instance - singleton, implemented in separated module