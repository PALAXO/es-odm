# es-odm

## Current state:

### Data type abstraction

 - As discussed, this has been completely discarded
 
 - No Fields, only Joi (and maybe manually written jsdoc)

### ODM

 - Draft, might change...

 - To get class constructor, call `library.prepareClass(index, ?schema, ?esType)`:
   - index - absolutely necessary, it must be specified
   - schema - may be undefined or Joi object, it is there because of validations
   - esType - Serves as ES type, default is `*`
     - For all document types but `documents` should be specified
       - Because asterisk is suitable only for searching
     - For `documents`, you can use this default value for searching in all documents
       - When working with concrete document type, use `.type(newType)`, see bellow
 
 
 - Class can be next modified using:
   - `in(tenant)` - Changes tenant from `default` to given value, returns class copy
   - `type(type)` - Sets type of document - just for Circularo documents
     - When not specified -> `<tenant>_<index>`
     - If specified -> `<tenant>_<index>_<type>`
       - It also replaces esType in ES queries
       
       
 - Expected usage:
 
    ```
    const library = require(`es-odm`);  //this library, find better name
    
    const index = `users`;
    const userSchema = Joi.any(...);
    
    const UserClass = library.prepareClass(index, userSchema);
    //Class is prepared, may be instantiated, tenant is `default`
    
    const MyTenantUserClass = UserClass.in(`myTenant`);
    //Tenant is `myTenant`
    
    const data = {...};
    const userInstance = new MyTenantUserClass(data);
    ```
 
 
 - ElasticSearch instance - singleton, implemented in separated module