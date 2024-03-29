# ElasticSearch 8 Node.js ODM library

## Basic information
 
 - This library maps ES documents and functions to JS classes
 
### Alias
 - ODM models are represented via ES aliases
 - Calling functions like `createIndex()` will create an underlying index and also sets an alias into it
 - Most of the communication is accomplished via aliases, real indices are used only when necessary
   - This is to simplify some processes like reindexing/cloning/migrating from source (old) index into the new one
     - Thanks to this, we can create new index, migrate data from the original one, than switch the aliases and delete the original one.
     - And the index are still in human-readable format

 - Alias consist from two parts:
   - tenant (AKA prefix) - defaults to `*`
   - name - main index name
 - Final alias looks like this:
   - `tenant_name`

#### Work with aliases
 - Alias name is specified when model is created, like this - `createClass('myIndex')`
 - Tenant can be specified using `createClass('myIndex', void 0, 'myTenant')`
   - or later by using `.in('myTenant')`
 - Function `in('tenant')` (and `immediateRefresh(bool)` as well) creates new ODM model with updated values, original ODM remains unchanged
 - example:
   - `createClass('myIndex').in('default')` -> `default_myIndex`
   - `createClass('myIndex')` -> `*_myIndex`
   - `createClass('myIndex', void 0, 'tenant')` -> `tenant_myIndex`
   - `createClass('myIndex', void 0, 'tenant').in('changedTenant')` -> `changedTenant_myIndex`
   
 - When creating a new instance (or performing some operations), the alias cannot contain any wildcard
   - it means you must fully specify the tenant
   
### Underlying index
 - Underlying index is in a very similar format, just also contains unique identifier:
    - `tenant_name-id`

 - This library is made to use aliases, but technically speaking it should be also working with ES indices directly (or even with mixture of indices and aliases)
   - It is necessary to avoid any conflicts between indices / aliases
   - Newly created indices will always be created as aliases with underlying indices

#### Usage
 - `const { createClass, BulkArray, BaseModel, JointModel, esClient, setClient, esErrors, setLoggerConfig, setLoggerUidFunction } = require('odm');`
 - `createClass` function creates new class
   - Each class contains several properties
     - `schema`, `alias`, `_tenant`, `_name` and `_immediateRefresh`
   - Class static functions profit from those properties
     - e.g. `static search()` uses them to get alias
     - You may write your own static function, which will use those properties
       - Or rewrite existing functions
         - Which may influence another functions
       - Or redefine class properties
   - Instances have access to those properties / functions
     - `myInstance.constructor.alias`
     - And they use them during ES operations
       - eq. to validate data, ...
   - Whenever we need new / independent class, we must either create a new one or clone an existing one
 - Additionally, library provides `BulkArray`
   - Class inherited from `Array`
   - Contains methods which uses ES Bulk API
     - `save`, `delete` and `reload`
     - Plus some additional methods to dynamically mark and remove ODM instance - see in code
 - Exported `BaseModel` should be used mainly for `instanceof` checks
   - Do not create instances from it / do not change its parameters (unless you really know what you are doing)
 - `JointModel` is a special class used to "record" searches from multiple distinct ODM classes and then perform single search with different queries above multiple indices
 - `setClient` replaces ES client singleton
   - Should be called once at application startup
   - New client is then used - even in already created classes
 - `esErrors` - Errors from underlying ES library
 - `setLoggerConfig` - Replaces default logger configuration
 - `setLoggerUidFunction` - Pass custom function to be used to generate ID, which is passed to generated logs


#### Class usage

##### Create new class
 - To create new class, call `createClass(name, ?schema, ?tenant)`:
   - `name` - essential, it must be specified
   - `schema` - may be undefined or Joi object, it is there, so we can do additional validations
   - `tenant` - Serves as part of the index (prefix)
     - This is required and cannot contain underscores (`_`)
     - By default, it is `*`
       - You can rewrite it later by using `.in('newTenant')`
         - It will create inherited class
         - `const SpecificTenantClass = MyClass.in('newTenant');`
       - You must specify it before creating new instance
       - When searching for records, found records will have correctly set tenant
 
##### Modify / clone existing class
 - Class can be modified / cloned using:
   - `in(tenant)`
     - Returns class clone with tenant changed to given value
   - `immediateRefresh(bool)`
     - Returns class clone with immediate refresh set to given value
       - By default, new classes (and its instances) does perform `refresh: true` with all write operations -> You can use this to disable it
   - `clone(?changes)`
     - Clones class
     - `changes` is optional object to set cloned class properties
     - This method is internally used by `in()` and `immediateRefresh()`
     - You should not need to use it
 
 - Cloning class means:
   - New inherited class is created
   - Changes made afterwards to cloned class are NOT transferred to original one
 
#### Instances
 - Instances are made from prepared class
   - Manually: 
     - You prepare class and then you can call `new MyClass(?data, ?_id, ?_version, ?_highlight, ?_primary_term, ?_seq_no, ?_score, ?_sort)`
       - `data` is optional object whose properties are placed to instance
       - `_id` is optional ES _id
       - `_version` is optional ES _version
       - `_highlight` is optional ES highlight
       - `_primary_term` is optional ES _primary_term
       - `_seq_no` is optional ES _seq_no
       - `_score` is optional ES _score
       - `_sort` is optional ES sort
   - From static functions: 
     - When you call functions like `findAll()`, `search()`, ...
       - Instance is made from class and correct data is loaded from ES
 - Instance contains only ES data and methods to save / reload / validate / ...
   - All ES properties, search functions, ... are saved in class
 - NOTE: `_id`, `_version`, `_highlight`, `_primary_term`, `_seq_no`, `_score` and `_sort` are not enumerable

#### BulkArray
 - For ES Bulk API, you can use `BulkArray`
 - Class inherited from `Array`
 - All static search functions in BaseModel class returns `BulkArray` of instances instead of `Array`
 - Provides bulk functions:
   - `async save(?useVersion)`
     - Saves all items to ES
       - Not existing ids are generated and pushed to instances
     - Returns ES response
     - `useVersion` - Checks if version match
       - uses sequence numbers internally, if not presented, it will fetch them and checks version automatically
     
   - `async delete(?useVersion)`
     - Deletes all items from ES
     - Returns ES response
     - `useVersion` - Checks if version match
                          - uses sequence numbers internally, if not presented, it will fetch them and checks version automatically
     
   - `async reload()`
     - Reloads all instances in bulk array
         
#### Examples:
  ```
  class Counter extends createClass('counter', Joi.object()) {
    async customFunction() {
        return 666;
    }
    
    static customStatic() {
        return new this({ a: 4 }, `myId`);
    }
    
    static async search(...args) {
        // Rewritting static function -> affects search, find and findAll
        const results = await super.search(...args);
        if (results.length <= 0) {
            throw Error(`Nothing`);
        } else {
            return results;
        }
    }
  }

  ...

  const MyCounter = Counter.in('default'); //Index is 'default_counter'

  const allCounters = await MyCounter.findAll();    //BulkArray with all counters in index
  await allCounters.delete();   //Everything deleted from ES

  const instanceCounter = new MyCounter({ counter: 15 }, 'myId');   //Prepared new instance
  await instanceCounter.save(); //New instance saved

  ```
   
    
#### Functions / Methods

##### Internal getters
 - `static get alias`
   - Returns class full alias, usable for ES queries
   - It consists of tenant and name

##### Class level API
 - `static async search(body, ?from, ?size, ?additional)`
   - Performs ES search
   - Returns `BulkArray` of instances
   - Used by another static functions
     - Redefining this function will affect their behavior
   - User must specify `body`
     - `alias` is already defined in the class
   - `from` and `size` are optional
     - Returns all results if `from` / `size` are not specified, no matter how many there are
   - `additional` is an optional object with additional data


 - `static async *bulkIterator(body, ?source, ?bulkSize, ?additional)`
   - Async generator for iterating over bulks of documents
   - `body`, `source` and `additional` arguments are the same as in the `search` function
   - `bulkSize` is optional custom size of a bulk

 - `static async *itemIterator(body, ?source, ?bulkSize, ?additional)`
   - Async generator for iterating over documents
   - Arguments are the same as in the `bulkIterator` generator

 - `static async findAll()`
   - Finds all entries in ES, matching class `alias`
   - Uses `this.search()`
     - Returns `BulkArray`
     
 - `static async find(ids)`
   - Performs ES 'search' query
   - Always returns `BulkArray` of instances
   - Uses `this.search()`
   
 - `static async get(ids)`
   - Performs ES 'get'
   - If 'ids' is strings, returns single instance
   - Else if 'ids' is an array of strings, returns `BulkArray` of instances
   
 - `static async head(ids)`
   - Performs ES 'mget' without '_source' field
   - Throws when any of the IDs is not found
   - If 'ids' is strings, returns single object
   - Else if 'ids' is an array of strings, returns array of objects
   
 - `static async delete(ids, ?version)`
   - Performs ES 'delete'
   - Uses bulk API
   - Class alias must be fully specified
   - Returns ES response
   - If `version` is specified, only one id is allowed
   
 - `static async exists(ids)`
   - Performs ES 'exists'
   - If 'ids' is strings, returns single boolean
   - Else if 'ids' is array of strings, returns array of booleans
     - true if exists, else otherwise
   
 - `static async update(ids, body)`
   - Performs ES 'update'
   - Uses bulk API
   - Returns ES response
 
 - `static async count(?body)`
   - Performs ES 'count'
   - Returns number
   
 - `static async updateByQuery(body)`
   - Performs ES 'update_by_query'
   - Returns ES response
 
 - `static async deleteByQuery(body)`
   - Performs ES 'delete_by_query'
   - Returns ES response

##### Indices API
 - `static async createIndex(?body, ?setAlias = true)`
   - Creates index given by current class
   - `body` is optional settings
   - `setAlias` is used when we do not want automatically set an alias to newly create index
   
 - `static async getIndex()`
   - Returns ES index of ODM alias
   - Returns string
   
 - `static async aliasIndex(index)`
   - Puts alias of current ODM onto selected `index`

 - `static async deleteAlias()`
   - Deletes ODM alias from ES, underlying index remains unchanged

 - `static async aliasExists()`
   - Checks ODM alias existence
   - Returns boolean

 - `static async indexExists()`
   - Checks ODM index existence
   - Returns boolean
   
 - `static async deleteIndex()`
   - Deletes alias and index given by current class
   
 - `static async getMapping()`
   - Gets mapping of index given by current class
   
 - `static async putMapping(mapping)`
   - Puts mapping to index given by current class
   
 - `static async getSettings(?includeDefaults = false)`
   - Gets settings of index given by current class
   
 - `static async putSettings(settings)`
   - Puts settings to index given by current class
   
 - `static async reindex(destinationModel, ?script)`
   - Reindex from current model class to selected one
   - Destination may be chosen by ODM or by alias/index string
   - `script` specifies optional painless script to be used
   
 - `static async cloneIndex(?settings)`
   - Creates clone of ODM index
   - Current index has to be manually blocked for write (be made read-only)
   - `settings` is optional settings to be used for newly created index
   - Returns newly created index
   
 - `static async refresh()`
   - Refreshed current index / indices

 - `static async openPIT()`
   - Opens Point in Time in given index

 - `static async closePIT(id)`
   - Closes given Point in Time
   
##### Instance level API
 - `async save(?useVersion)`
   - saves or re-saves instance
   - it uses specified `_id` or generates new one if not specified
     - it uses ES 'index' function
   - `useVersion` - checks if version matches, `_id` and `_version` must be specified
     - sequence number will be fetched automatically in not presented
     
 - `async reload()`
   - Reloads instance data from ES
   - Uses `get` and `new this.constructor()` internally
     
 - `async delete(?useVersion)`
   - Deletes an instance from ES
   - `_id` must be specified and entry must exist in ES
   - `useVersion` - checks if version matches, `_version` must be specified
     - sequence number will be fetched automatically in not presented
     
 - `clone(?_preserveAttributes)`
   - Returns clone of current instance
     - Deep copy
   - Cloned instance is created from the same class
   - `preserveAttributes` (defaults true) can be used to preserve attributes (`_id`, `_version`, ...)
     
 - `async validate()`
   - Validates instance using Joi
   - Throws in case of error / incorrect data
     
##### Class copy
 - `static clone(?changes)`
   - Creates class copy
   - In fact, it creates new class which inherits from the current one
   - `changes` is an optional object with properties to be set
 
 - `static in(newTenant)`
   - Clones class using `clone()`
   - Sets given tenant
 
 - `static immediateRefresh(newRefresh)`
   - Clones class using `clone()`
   - Sets given refresh mode

#### Other
- `static _parseIndex(index)`
    - Parses given index (or even alias) and returns its parts

- `static __checkIfFullySpecified(functionName)`
    - Checks if current class is fully specified, meaning it doesn't contain any wildcard in alias
    - Throws otherwise

- `static __getConstructor(searchResult, constructorCache)`
    - Returns the correct class (constructor) for given search result

- `static _alterSearch(body)`
    - Alters the search function query (and also query of other functions that use the query)
    - By default, just passes the body without any change, but can be rewritten

- `static _unpackData(source)`
    - Alters the fetched ES documents before the instance is created from them
    - By default, just passes the source without any change, but can be rewritten

- `async _packData(cache)`
    - Alters the instance data before it is saved to ES
    - By default, just passes the instance data without any change, but can be rewritten

- `static async _afterSearch(instances, ?cache)`
    - Special function called for each record founded by search / find / findAll / get
    - By default, it is empty, but you can overwrite it in your code

- `static async _getBulkSize()`
    - Returns optimal size of bulk for given model
    - Used in `search` function for pagination
 