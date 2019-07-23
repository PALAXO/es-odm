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
       
 - How type works:
   - if type is specified in `library(index, schema, type)`, is uses indexes like `<tenant>_<index>`
   - if not, it uses index `<tenant>_<index>_*`
     - only suitable for searching
   - once `.type(type)` is called, it uses indexes like `<tenant>_<index>_<type>`
       
       
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

 - `async save(?force, ?clone)`
   - saves instance
   - it uses specified `_id` or generates new one if not specified
     - it uses `index` function
   - `force` - disables validation
   - `clone` 
     - if instance has specified `_id`, it creates its copy and returns it
     - otherwise just save, like if not set
     
 - `async validate()`
   - Validates instance
     - if OK, returns validated object (deep copy)
     - otherwise throws an error
 
 - ElasticSearch instance - singleton, implemented in separated module