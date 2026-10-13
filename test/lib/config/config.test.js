import '../../bootstrapTests.js';
import nconf from '../../../lib/config/config.js';
import globalNconf from 'nconf';

describe(`config`, function() {
    this.timeout(testTimeout);

    it(`exposes the defaults of "config.json"`, () => {
        //The whole library reads its behaviour from these - a missing configuration file would answer undefined
        expect(nconf.get(`es:maxResults`)).to.equal(10000);
        expect(nconf.get(`es:paginationSize`)).to.equal(1000);
        expect(nconf.get(`es:requestTimeoutSeconds`)).to.be.a(`number`);
        expect(nconf.get(`es:pingTimeoutSeconds`)).to.be.a(`number`);
        expect(nconf.get(`es:maxRetries`)).to.be.a(`number`);
        expect(nconf.get(`es:pitTimeoutSeconds`)).to.be.a(`number`);
        expect(nconf.get(`es:retryOnConflict`)).to.be.a(`number`);
        expect(nconf.get(`es:retries:base`)).to.be.a(`number`);
        expect(nconf.get(`es:retries:maxRetries`)).to.be.a(`number`);
        expect(nconf.get(`joi:validatorConfig`)).to.be.an(`object`);
        expect(nconf.get(`logger:name`)).to.be.a(`string`);
    });

    it(`carries the configuration layered in by the bootstrap`, () => {
        //"test/test_config.json" is attached after the library defaults, so it can only add keys of its own -
        //a key "config.json" already defines cannot be overridden from there
        expect(nconf.get(`test:settings:timeout`)).to.equal(1800000);
        expect(testTimeout).to.equal(1800000);

        //The library defaults survive the store attached later
        expect(nconf.get(`es:maxResults`)).to.equal(10000);
        expect(nconf.get(`es:paginationSize`)).to.equal(1000);
    });

    it(`keeps its configuration apart from the process-wide nconf`, () => {
        //Consumers resolving the same nconf copy share its default export - the library must neither add its stores
        //to it nor read theirs
        expect(globalNconf.get(`es:maxResults`)).to.be.undefined;

        globalNconf.set(`es:maxResults`, 1);
        try {
            expect(nconf.get(`es:maxResults`)).to.equal(10000);
        } finally {
            globalNconf.clear(`es:maxResults`);
        }
    });

    it(`answers undefined for an unknown key`, () => {
        expect(nconf.get(`thisKeyDoesNotExist`)).to.be.undefined;
        expect(nconf.get(`es:thisKeyDoesNotExist`)).to.be.undefined;
    });

    it(`writes a value through, so "setConfiguration" can reach it`, () => {
        const original = nconf.get(`warning:downloadedB`);
        try {
            nconf.set(`warning:downloadedB`, 12345);
            expect(nconf.get(`warning:downloadedB`)).to.equal(12345);
        } finally {
            nconf.set(`warning:downloadedB`, original);
        }
    });
});
